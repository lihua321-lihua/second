import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { loadContractView, toStateView } from "@/lib/services/contract-service";
import { canSendForSignature, hasBothApprovals, isSigningInfoComplete } from "@/lib/contracts/rules";
import { isForwardSignature } from "@/lib/contracts/state-machine";
import { mockProvider } from "@/lib/esign/mock-provider";
import type { ESignProvider, SignatureEvent, SignerInfo } from "@/lib/esign/provider";
import type { SignatureStatus, ActorType } from "@/types/domain";

/** Mock 自动/手动模式：环境变量 MOCK_ESIGN_MODE=manual 时关闭自动完成（需手动「模拟签署完成」）。 */
function autoCompleteMode(): boolean {
  return process.env.MOCK_ESIGN_MODE !== "manual";
}

/** 按提供方名解析实现（当前仅 mock，保留扩展点）。 */
function getProvider(name: string): ESignProvider {
  if (name === "mock") return mockProvider;
  throw new Error(`未知的电子签提供方: ${name}`);
}

/** 生成「不可发起签署」的具体原因。 */
function sendBlockReason(s: ReturnType<typeof toStateView>): string {
  if (s.status !== "ReadyToSign") return `当前状态（${s.status}）不可发起签署，需先完成双审批`;
  if (!s.hasPdf) return "尚未生成 PDF";
  if (s.currentVersionId == null) return "无当前版本";
  if (!hasBothApprovals(s.approvals)) return "尚未完成双审批（商务 + 法务）";
  if (!isSigningInfoComplete(s.vendor)) return "签署信息不完整（签约主体 / 签字人 / 签署邮箱）";
  if (s.signatureRequest && s.signatureRequest.versionId !== s.currentVersionId)
    return "已存在旧版本的签署请求，请先取消";
  return "不满足签署前置条件";
}

/**
 * 发起电子签（规则 5 五重校验 → 二次确认由前端完成）：
 * - 校验 canSendForSignature
 * - 供应商签署人（可编辑，默认带出） + 我方签署人 Kevin Li
 * - 创建 SignatureRequest（Sent），合同状态 → Sent
 */
export async function sendForSignature(
  contractId: string,
  vendorSigner: { name: string; email: string },
  actor: string,
  source: ActorType = "user",
) {
  const view = await loadContractView(contractId);
  const state = toStateView(view);
  if (!canSendForSignature(state)) {
    throw new Error(sendBlockReason(state));
  }

  const vendor: SignerInfo = {
    name: (vendorSigner.name ?? "").trim(),
    email: (vendorSigner.email ?? "").trim(),
    role: "vendor",
  };
  if (!vendor.name || !vendor.email) throw new Error("供应商签署人姓名与邮箱不能为空");

  const signers: SignerInfo[] = [
    vendor,
    { name: "Kevin Li", email: "kevin@ourco.example", role: "internal" },
  ];

  const provider = getProvider("mock");
  const result = await provider.sendEnvelope({
    contractId,
    versionId: view.currentVersionId as string,
    signers,
    autoComplete: autoCompleteMode(),
  });

  const sr = await prisma.signatureRequest.create({
    data: {
      contractId,
      versionId: view.currentVersionId as string,
      provider: "mock",
      providerEnvelopeId: result.providerEnvelopeId,
      status: "Sent",
      signersJson: JSON.stringify(signers),
      sentAt: result.sentAt,
    },
  });

  await prisma.contract.update({
    where: { id: contractId },
    data: { status: "Sent" },
  });

  await writeAudit({
    actor,
    actorType: source,
    source,
    action: "send_signature",
    entity: "SignatureRequest",
    entityId: sr.id,
    after: { providerEnvelopeId: result.providerEnvelopeId, signers, autoComplete: autoCompleteMode() },
  });

  return loadContractView(contractId);
}

/**
 * 应用单条签署事件（sync 拉取与 Webhook 推送共用）：
 * - 幂等：provider + eventId 唯一（写 WebhookEvent），重复直接跳过
 * - 只允许向前流转（isForwardSignature）
 * - Completed → 记录 completedAt，合同状态同步 Completed
 */
export async function applySignatureEvent(
  event: SignatureEvent,
  opts: { source: ActorType; actor: string },
) {
  const sr = await prisma.signatureRequest.findFirst({
    where: { providerEnvelopeId: event.envelopeId },
  });
  if (!sr) return { duplicated: false, changed: false, missing: true as const };

  const exists = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: sr.provider, eventId: event.eventId } },
  });
  if (exists) return { duplicated: true as const, changed: false, missing: false as const };

  await prisma.webhookEvent.create({
    data: {
      provider: sr.provider,
      eventId: event.eventId,
      envelopeId: event.envelopeId,
      eventType: event.eventType,
      payload: JSON.stringify(event.data ?? {}),
    },
  });

  let changed = false;
  if (isForwardSignature(sr.status as SignatureStatus, event.status as SignatureStatus)) {
    const data: { status: string; lastEventId: string; completedAt?: Date } = {
      status: event.status,
      lastEventId: event.eventId,
    };
    if (event.status === "Completed") data.completedAt = new Date();

    await prisma.signatureRequest.update({ where: { id: sr.id }, data });
    const contractStatus =
      event.status === "Completed" ? "Completed" : event.status === "PartiallySigned" ? "PartiallySigned" : "Sent";
    await prisma.contract.update({ where: { id: sr.contractId }, data: { status: contractStatus } });
    changed = true;
  }

  await writeAudit({
    actor: opts.actor,
    actorType: opts.source,
    source: opts.source,
    action: "signature_event",
    entity: "SignatureRequest",
    entityId: sr.id,
    after: { eventId: event.eventId, eventType: event.eventType, status: event.status, applied: changed },
  });

  return { duplicated: false as const, changed, missing: false as const };
}

/** 应用提供方事件时间轴（幂等、向前推进）。 */
async function applyTimeline(
  req: {
    provider: string;
    providerEnvelopeId: string | null;
    sentAt: Date | null;
  },
  opts: { forceComplete: boolean; source: ActorType; actor: string },
) {
  if (!req.providerEnvelopeId) throw new Error("签署请求缺少信封 ID");
  if (!req.sentAt) throw new Error("签署请求缺少发起时间");

  const provider = getProvider(req.provider);
  const events = provider.timeline({
    envelopeId: req.providerEnvelopeId,
    sentAt: req.sentAt,
    autoComplete: autoCompleteMode(),
    forceComplete: opts.forceComplete,
  });

  let applied = 0;
  for (const ev of events) {
    const r = await applySignatureEvent(ev, { source: opts.source, actor: opts.actor });
    if (r.changed) applied += 1;
  }
  return { events, applied };
}

/** 同步签署状态：拉取提供方事件时间轴并逐条（幂等）应用。 */
export async function syncSignatureStatus(contractId: string, actor: string, source: ActorType = "user") {
  const req = await prisma.signatureRequest.findFirst({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });
  if (!req) throw new Error("尚未发起签署");

  const { events, applied } = await applyTimeline(req, {
    forceComplete: false,
    source,
    actor,
  });
  return { view: await loadContractView(contractId), events, applied };
}

/** 手动模式：模拟双方签署完成（强制推进时间轴），随后同步。 */
export async function simulateCompletion(contractId: string, actor: string, source: ActorType = "user") {
  const req = await prisma.signatureRequest.findFirst({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });
  if (!req) throw new Error("尚未发起签署");

  const { events, applied } = await applyTimeline(req, {
    forceComplete: true,
    source,
    actor,
  });
  return { view: await loadContractView(contractId), events, applied };
}

/** 获取合同的签署事件列表（供状态页展示）。 */
export async function listSignatureEvents(contractId: string) {
  const req = await prisma.signatureRequest.findFirst({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });
  if (!req || !req.providerEnvelopeId) return [];

  return prisma.webhookEvent.findMany({
    where: { provider: req.provider, envelopeId: req.providerEnvelopeId },
    orderBy: { processedAt: "asc" },
  });
}