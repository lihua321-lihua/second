import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { vendorInfoSchema } from "@/lib/contracts/terms";
import { recomputeContractStatus, loadContractView } from "@/lib/services/contract-service";
import { parseJson } from "@/lib/json";
import type { VendorInfo } from "@/types/domain";

const VENDOR_KEYS = [
  "legalName",
  "country",
  "address",
  "product",
  "signerName",
  "title",
  "email",
] as const;

function pickPatch(patch: Record<string, unknown>): Partial<VendorInfo> {
  const out: Record<string, unknown> = {};
  for (const k of VENDOR_KEYS) {
    if (patch[k] !== undefined) out[k] = patch[k];
  }
  return out as Partial<VendorInfo>;
}

function toVendorInfo(v: {
  legalName: string;
  country: string;
  address: string;
  product: string;
  signerName: string;
  title: string;
  email: string;
}): VendorInfo {
  return {
    legalName: v.legalName,
    country: v.country,
    address: v.address,
    product: v.product,
    signerName: v.signerName,
    title: v.title,
    email: v.email,
  };
}

/**
 * 修改供应商信息（仅草稿期可编辑；写审计，source 标识 user/ai）。
 * @returns 更新后的合同视图 + before/after（供撤销与二次确认复用）
 */
export async function patchVendorInfo(
  contractId: string,
  patch: Record<string, unknown>,
  source: "user" | "ai",
  actor: string,
) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { vendor: true },
  });
  if (!contract?.vendor) throw new Error("供应商不存在");

  if (!["Draft", "NeedsInformation", "Blocked"].includes(contract.status)) {
    throw new Error(`当前状态（${contract.status}）不可修改供应商信息`);
  }

  const before = toVendorInfo(contract.vendor);
  const merged = { ...before, ...pickPatch(patch) };
  const parsed = vendorInfoSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`供应商信息校验失败: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  await prisma.vendor.update({
    where: { id: contract.vendorId },
    data: parsed.data,
  });

  await recomputeContractStatus(contractId);
  await writeAudit({
    actor,
    actorType: source,
    source,
    action: "patch_vendor",
    entity: "Vendor",
    entityId: contract.vendorId,
    before,
    after: parsed.data,
  });

  return { view: await loadContractView(contractId), before, after: parsed.data };
}

/** 校验合同完整性（读操作，供 AI 工具与提示复用）。 */
export async function validateContract(contractId: string) {
  const view = await loadContractView(contractId);
  return {
    valid: view.validation.valid,
    hint: view.validation.hint,
    status: view.status,
    missingCore: view.validation.missingCore,
    missingRequired: view.validation.missingRequired,
    missingFields: view.missingFields.map((m) => m.label),
  };
}

/** 搜索合同（按名称/产品/状态）。 */
export async function searchContracts(query: string) {
  const q = (query ?? "").trim().toLowerCase();
  const contracts = await prisma.contract.findMany({
    include: { vendor: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const filtered = contracts.filter((c) => {
    if (!q) return true;
    const hay = [
      c.vendor?.legalName,
      c.vendor?.product,
      c.vendor?.signerName,
      c.status,
      c.type,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  return filtered.map((c) => ({
    id: c.id,
    status: c.status,
    vendorName: c.vendor?.legalName ?? "",
    product: c.vendor?.product ?? "",
    version: c.currentVersionId ? 1 : null,
  }));
}