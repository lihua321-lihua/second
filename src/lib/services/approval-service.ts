import { prisma } from "@/lib/db";
import { writeAudit, writeAuditTx } from "@/lib/audit";
import { approvalEmails, canSubmitForApproval, hasBothApprovals } from "@/lib/contracts/rules";
import {
  loadContractView,
  createNewVersionWithPatch,
  toStateView,
} from "@/lib/services/contract-service";
import type { ActorType, ApprovalRole, ApprovalStatus } from "@/types/domain";

/** 交互角色能否以某审批角色（商务/法务）身份操作。 */
export function canActAs(interactiveRole: string, approvalRole: ApprovalRole): boolean {
  if (interactiveRole === "admin") return true;
  if (interactiveRole === "biz") return approvalRole === "biz";
  if (interactiveRole === "legal") return approvalRole === "legal";
  return false;
}

/** 草稿是否与当前版本条款不一致（存在未固化的改动，提交审批前需冻结新版本）。 */
async function needsFreezeVersion(contractId: string): Promise<boolean> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      currentVersionId: true,
      draftTermsJson: true,
      versions: { orderBy: { version: "desc" }, take: 1, select: { termsJson: true } },
    },
  });
  if (!contract) throw new Error(`合同不存在: ${contractId}`);
  if (!contract.currentVersionId) return true; // 尚无版本 → 首次固化
  if (contract.draftTermsJson == null) return false; // 无草稿缓冲 → 无未固化改动
  return contract.draftTermsJson !== (contract.versions[0]?.termsJson ?? null);
}

/**
 * 提交审批：
 * - 固化草稿（无版本 → 生成 v1；草稿与当前版本不一致 → 生成新版本冻结最新条款）
 * - 校验 canSubmitForApproval（仅 Draft 且无缺失字段）
 * - 锁定当前版本
 * - 创建商务 + 法务两位 Pending 审批
 * - 合同状态 → PendingApproval
 */
export async function submitForApproval(contractId: string, actor: string, source: ActorType = "user") {
  if (await needsFreezeVersion(contractId)) {
    await createNewVersionWithPatch(contractId, {}, source, actor);
  }

  const view = await loadContractView(contractId);
  const stateView = toStateView(view);
  if (!canSubmitForApproval(stateView)) {
    const reasons: string[] = [];
    if (view.status !== "Draft") reasons.push(`当前状态为 ${view.status}，仅「草稿」可提交审批`);
    if (!view.validation.valid) reasons.push("存在缺失字段，请先补齐");
    throw new Error(reasons.length ? reasons.join("；") : "当前不可提交审批");
  }
  if (!view.hasPdf) throw new Error("尚未生成 PDF，请先在草稿页生成");

  const versionId = view.currentVersionId as string;

  await prisma.$transaction(async (tx) => {
    await tx.contractVersion.update({
      where: { id: versionId },
      data: { lockedAt: new Date() },
    });
    for (const role of ["biz", "legal"] as const) {
      const email = approvalEmails(role)[0];
      await tx.approval.upsert({
        where: { versionId_role: { versionId, role } },
        create: { versionId, role, approverId: email, status: "Pending" },
        update: { approverId: email, status: "Pending", comment: null, approvedAt: null },
      });
    }
    await tx.contract.update({
      where: { id: contractId },
      data: { status: "PendingApproval" },
    });
    await writeAuditTx(tx, {
      actor,
      actorType: source,
      source,
      action: "submit_approval",
      entity: "Contract",
      entityId: contractId,
      after: { versionId, status: "PendingApproval" },
    });
  });

  return loadContractView(contractId);
}

/**
 * 通过审批（商务/法务任一）：
 * - 状态须 PendingApproval
 * - 标记该角色 Approval → Approved
 * - 两位均通过 → ReadyToSign
 */
export async function approveVersion(
  contractId: string,
  role: ApprovalRole,
  actor: string,
  source: ActorType = "user",
) {
  const view = await loadContractView(contractId);
  if (view.status !== "PendingApproval") {
    throw new Error(`当前状态（${view.status}）不可审批`);
  }
  if (!view.currentVersionId) throw new Error("无当前版本");

  const versionId = view.currentVersionId as string;
  const email = approvalEmails(role)[0];

  await prisma.approval.upsert({
    where: { versionId_role: { versionId, role } },
    create: { versionId, role, approverId: email, status: "Approved", approvedAt: new Date() },
    update: { approverId: email, status: "Approved", approvedAt: new Date() },
  });

  const approvals = await prisma.approval.findMany({ where: { versionId } });
  const both = hasBothApprovals(
    approvals.map((a) => ({ role: a.role as ApprovalRole, status: a.status as ApprovalStatus })),
  );
  if (both) {
    await prisma.contract.update({
      where: { id: contractId },
      data: { status: "ReadyToSign" },
    });
  }

  await writeAudit({
    actor,
    actorType: source,
    source,
    action: "approve_version",
    entity: "Approval",
    entityId: versionId,
    after: { role, status: "Approved", readyToSign: both },
  });

  return loadContractView(contractId);
}

/**
 * 驳回审批：
 * - 状态须 PendingApproval
 * - 标记该角色 Approval → Rejected（保留驳回意见）
 * - 解锁当前版本
 * - 合同状态 → Draft（驳回回退）
 */
export async function rejectVersion(
  contractId: string,
  role: ApprovalRole,
  actor: string,
  comment: string,
  source: ActorType = "user",
) {
  const view = await loadContractView(contractId);
  if (view.status !== "PendingApproval") {
    throw new Error(`当前状态（${view.status}）不可审批`);
  }
  if (!view.currentVersionId) throw new Error("无当前版本");

  const versionId = view.currentVersionId as string;
  const email = approvalEmails(role)[0];
  const normalizedComment = comment?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.approval.upsert({
      where: { versionId_role: { versionId, role } },
      create: { versionId, role, approverId: email, status: "Rejected", comment: normalizedComment },
      update: { approverId: email, status: "Rejected", comment: normalizedComment, approvedAt: null },
    });
    await tx.contractVersion.update({
      where: { id: versionId },
      data: { lockedAt: null },
    });
    await tx.contract.update({
      where: { id: contractId },
      data: { status: "Draft" },
    });
    await writeAuditTx(tx, {
      actor,
      actorType: source,
      source,
      action: "reject_version",
      entity: "Approval",
      entityId: versionId,
      after: { role, status: "Rejected", comment: normalizedComment },
    });
  });

  return loadContractView(contractId);
}