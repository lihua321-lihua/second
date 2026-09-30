import { prisma } from "@/lib/db";
import { writeAuditTx, type Tx } from "@/lib/audit";
import { computeTermsHash } from "@/lib/hash";
import { parseJson } from "@/lib/json";
import {
  termsSchema,
  validateFields,
  type ValidationResult,
  fieldLabel,
} from "@/lib/contracts/terms";
import { INITIAL_STATUS, type ActorType, type Terms, type VendorInfo } from "@/types/domain";

/** 计算 patch 相对 base 的字段级 diff（旧值 → 新值）。 */
export function diffTerms(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
): { key: string; oldValue: unknown; newValue: unknown }[] {
  const allKeys = [...Object.keys(base), ...Object.keys(next)];
  const keys = allKeys.filter((k, i) => allKeys.indexOf(k) === i);
  const diff: { key: string; oldValue: unknown; newValue: unknown }[] = [];
  for (const k of keys) {
    const o = base[k] ?? null;
    const n = next[k] ?? null;
    if (JSON.stringify(o) !== JSON.stringify(n)) {
      diff.push({ key: k, oldValue: o, newValue: n });
    }
  }
  return diff;
}

function toVendorSnapshot(vendor: VendorInfo): VendorInfo {
  return {
    legalName: vendor.legalName,
    country: vendor.country,
    address: vendor.address,
    product: vendor.product,
    signerName: vendor.signerName,
    title: vendor.title,
    email: vendor.email,
  };
}

/** 读取合同的当前版本（无则返回 null）。 */
async function findCurrentVersion(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { currentVersionId: true },
  });
  if (!contract?.currentVersionId) return null;
  return prisma.contractVersion.findUnique({
    where: { id: contract.currentVersionId },
  });
}

/** 旧版本审批作废（事务版）：非 newVersionId 的 Pending/Approved 审批标记为 Rejected。 */
async function invalidateOldApprovalsTx(
  tx: Tx,
  contractId: string,
  newVersionId: string,
): Promise<number> {
  const others = await tx.contractVersion.findMany({
    where: { contractId, id: { not: newVersionId } },
    select: { id: true },
  });
  const ids = others.map((v) => v.id);
  if (ids.length === 0) return 0;
  const r = await tx.approval.updateMany({
    where: { versionId: { in: ids }, status: { in: ["Pending", "Approved"] } },
    data: {
      status: "Rejected",
      comment: "合同版本已更新，旧版本审批自动失效",
    },
  });
  return r.count;
}

/** 旧版本审批作废（独立调用版）。 */
export async function invalidateOldApprovals(
  contractId: string,
  newVersionId: string,
): Promise<number> {
  return prisma.$transaction((tx) =>
    invalidateOldApprovalsTx(tx, contractId, newVersionId),
  );
}

/**
 * 基于当前版本/草稿条款应用 patch 并创建新版本（不可变）。
 * - 读取当前版本（无则读草稿）
 * - 应用 patch → Zod 校验
 * - 创建新版本 + vendor 快照 + hash
 * - 更新 currentVersionId
 * - 旧审批作废
 * - 写审计日志
 * @returns 新版本 + diff
 */
export async function createNewVersionWithPatch(
  contractId: string,
  patch: Partial<Terms>,
  source: ActorType,
  actor: string,
) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, vendorId: true, status: true, currentVersionId: true, draftTermsJson: true },
  });
  if (!contract) throw new Error(`合同不存在: ${contractId}`);

  // 仅草稿期（Draft/待补充/已阻断）允许编辑并生成新版本；进入审批/签署后需先驳回或取消
  if (!["Draft", "NeedsInformation", "Blocked"].includes(contract.status)) {
    throw new Error(`当前状态（${contract.status}）不可编辑：请先驳回审批或取消签署`);
  }

  const currentVersion = contract.currentVersionId
    ? await prisma.contractVersion.findUnique({
        where: { id: contract.currentVersionId },
      })
    : null;

  // 未锁定：以草稿缓冲区为准（与「保存草稿」保持一致），无草稿则回落到当前版本条款
  const draft = contract.draftTermsJson
    ? (parseJson<Record<string, unknown>>(contract.draftTermsJson) ?? null)
    : null;
  const baseTerms: Record<string, unknown> =
    draft ??
    (currentVersion?.termsJson
      ? (parseJson<Record<string, unknown>>(currentVersion.termsJson) ?? {})
      : {});

  const merged = { ...baseTerms, ...patch };
  const parsed = termsSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`条款校验失败: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const terms = parsed.data as Terms;

  const vendor = await prisma.vendor.findUnique({ where: { id: contract.vendorId } });
  const snapshot = vendor ? toVendorSnapshot(vendor as VendorInfo) : ({} as VendorInfo);

  const nextVersion = (currentVersion?.version ?? 0) + 1;
  const hash = computeTermsHash(terms as unknown as Record<string, unknown>);

  const newVersion = await prisma.$transaction(async (tx) => {
    const v = await tx.contractVersion.create({
      data: {
        contractId,
        version: nextVersion,
        termsJson: JSON.stringify(terms),
        vendorSnapshot: JSON.stringify(snapshot),
        hash,
        templateVersion: 1,
        createdBy: actor,
      },
    });
    await tx.contract.update({
      where: { id: contractId },
      data: { currentVersionId: v.id, draftTermsJson: JSON.stringify(terms) },
    });
    await invalidateOldApprovalsTx(tx, contractId, v.id);
    await writeAuditTx(tx, {
      actor,
      actorType: source,
      source,
      action: "create_version",
      entity: "ContractVersion",
      entityId: v.id,
      before: baseTerms,
      after: terms,
    });
    return v;
  });

  const diff = diffTerms(baseTerms, terms as unknown as Record<string, unknown>);
  await recomputeContractStatus(contractId);

  // 生成 PDF（失败不阻断版本创建，可在草稿页重试）
  let pdfUrl: string | null = null;
  try {
    const { generateAndStorePdf } = await import("@/lib/pdf/generate");
    pdfUrl = await generateAndStorePdf(contractId, newVersion.id);
  } catch (e) {
    console.error("PDF 生成失败（版本已创建）:", e);
  }

  return { newVersion, diff, versionNumber: nextVersion, pdfUrl };
}

/**
 * 提交审批前的状态校准：仅当合同处于 Draft/NeedsInformation/Blocked 时，
 * 依据完整性校验结果刷新状态。
 */
export async function recomputeContractStatus(
  contractId: string,
): Promise<ValidationResult> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { vendor: true },
  });
  if (!contract) throw new Error(`合同不存在: ${contractId}`);
  if (!["Draft", "NeedsInformation", "Blocked"].includes(contract.status)) {
    const cv = await findCurrentVersion(contractId);
    const terms = cv?.termsJson ? (parseJson<Partial<Terms>>(cv.termsJson) ?? {}) : {};
    const sv = contract.vendor ? toVendorSnapshot(contract.vendor as VendorInfo) : ({} as VendorInfo);
    return validateFields(sv, terms);
  }

  const currentVersion = await findCurrentVersion(contractId);
  const terms = currentVersion?.termsJson
    ? (parseJson<Partial<Terms>>(currentVersion.termsJson) ?? {})
    : contract.draftTermsJson
      ? (parseJson<Partial<Terms>>(contract.draftTermsJson) ?? {})
      : {};

  const vendor = contract.vendor ? toVendorSnapshot(contract.vendor as VendorInfo) : ({} as VendorInfo);

  const v = validateFields(vendor, terms);
  const newStatus =
    v.hint === "Blocked" ? "Blocked" : v.hint === "NeedsInformation" ? "NeedsInformation" : INITIAL_STATUS;
  if (newStatus !== contract.status) {
    await prisma.contract.update({
      where: { id: contractId },
      data: { status: newStatus },
    });
  }
  return v;
}

export interface MissingField {
  key: string;
  label: string;
  core: boolean;
  critical: boolean;
}

export interface ContractView {
  id: string;
  type: string;
  status: string;
  currentVersionId: string | null;
  vendorId: string;
  version: number | null;
  lockedAt: Date | null;
  hasPdf: boolean;
  pdfUrl: string | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  terms: Partial<Terms>;
  vendor: Partial<VendorInfo>;
  approvals: {
    role: string;
    status: string;
    comment: string | null;
    approverId: string | null;
    approvedAt: Date | null;
  }[];
  signatureRequest: {
    id: string;
    versionId: string;
    provider: string;
    providerEnvelopeId: string | null;
    status: string;
    signers: { name: string; email: string; role: string }[];
    sentAt: Date | null;
    completedAt: Date | null;
    lastEventId: string | null;
    signedPdfUrl: string | null;
    certificateUrl: string | null;
  } | null;
  validation: ValidationResult;
  missingFields: MissingField[];
}

/** 组装完整合同视图（供规则校验与 UI 共用）。 */
export async function loadContractView(contractId: string): Promise<ContractView> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { vendor: true },
  });
  if (!contract) throw new Error(`合同不存在: ${contractId}`);

  const currentVersion = await findCurrentVersion(contractId);
  const currentVersionId = contract.currentVersionId;

  const approvals = currentVersionId
    ? await prisma.approval.findMany({
        where: { versionId: currentVersionId },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const signatureRequest = await prisma.signatureRequest.findFirst({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });

  const terms = currentVersion?.termsJson
    ? (parseJson<Partial<Terms>>(currentVersion.termsJson) ?? {})
    : contract.draftTermsJson
      ? (parseJson<Partial<Terms>>(contract.draftTermsJson) ?? {})
      : {};

  const vendorRaw = contract.vendor;
  const vendor: Partial<VendorInfo> = vendorRaw
    ? {
        legalName: vendorRaw.legalName,
        country: vendorRaw.country,
        address: vendorRaw.address,
        product: vendorRaw.product,
        signerName: vendorRaw.signerName,
        title: vendorRaw.title,
        email: vendorRaw.email,
      }
    : {};

  const validation = validateFields(vendor, terms);
  const missingFields: MissingField[] = [
    ...validation.missingCore.map((key) => ({
      key,
      label: fieldLabel(key),
      core: true,
      critical: false,
    })),
    ...validation.missingRequired.map((key) => ({
      key,
      label: fieldLabel(key),
      core: false,
      critical: false,
    })),
  ];

  return {
    id: contract.id,
    type: contract.type,
    status: contract.status,
    currentVersionId,
    vendorId: contract.vendorId,
    version: currentVersion?.version ?? null,
    lockedAt: currentVersion?.lockedAt ?? null,
    hasPdf: !!currentVersion?.pdfUrl,
    pdfUrl: currentVersion?.pdfUrl ?? null,
    archivedAt: contract.archivedAt,
    archivedBy: contract.archivedBy,
    terms,
    vendor,
    approvals: approvals.map((a) => ({
      role: a.role,
      status: a.status,
      comment: a.comment,
      approverId: a.approverId,
      approvedAt: a.approvedAt,
    })),
    signatureRequest: signatureRequest
      ? {
          id: signatureRequest.id,
          versionId: signatureRequest.versionId,
          provider: signatureRequest.provider,
          providerEnvelopeId: signatureRequest.providerEnvelopeId,
          status: signatureRequest.status,
          signers: (parseJson<{ name: string; email: string; role: string }[]>(signatureRequest.signersJson) ?? []),
          sentAt: signatureRequest.sentAt,
          completedAt: signatureRequest.completedAt,
          lastEventId: signatureRequest.lastEventId,
          signedPdfUrl: signatureRequest.signedPdfUrl,
          certificateUrl: signatureRequest.certificateUrl,
        }
      : null,
    validation,
    missingFields,
  };
}

/** 供规则层使用的简化状态视图（纯函数入参）。 */
export function toStateView(view: ContractView) {
  return {
    status: view.status as never,
    currentVersionId: view.currentVersionId,
    terms: view.terms,
    vendor: view.vendor,
    hasPdf: view.hasPdf,
    approvals: view.approvals.map((a) => ({
      role: a.role as "biz" | "legal",
      status: a.status as "Pending" | "Approved" | "Rejected",
    })),
    signatureRequest: view.signatureRequest
      ? {
          versionId: view.signatureRequest.versionId,
          status: view.signatureRequest.status as never,
          signersComplete: view.signatureRequest.status === "Completed",
        }
      : null,
  };
}