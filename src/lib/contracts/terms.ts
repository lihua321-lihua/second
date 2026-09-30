import { z } from "zod";
import type { Terms, VendorInfo } from "../../types/domain";

/**
 * 商业条款与供应商信息的 Zod schema、字段元数据与完整性校验。
 * 校验结果用于判定 NeedsInformation / Blocked / 可进入审批（Draft 有效）。
 */

// ---- Zod schema ----

export const termsSchema = z.object({
  product: z.string(),
  scope: z.string(),
  territory: z.string(),
  pricingModel: z.string(),
  currency: z.string(),
  revenueBasis: z.string(),
  revenueShare: z.string(),
  settlementCycle: z.string(),
  refund: z.string(),
});

export const vendorInfoSchema = z.object({
  legalName: z.string(),
  country: z.string(),
  address: z.string(),
  product: z.string(),
  signerName: z.string(),
  title: z.string(),
  email: z.string(),
});

export type TermsInput = z.infer<typeof termsSchema>;
export type VendorInfoInput = z.infer<typeof vendorInfoSchema>;

// ---- 字段元数据 ----

export interface FieldMeta {
  key: string;
  label: string;
  group: "terms" | "vendor";
  /** true = 缺失时进入 Blocked（核心生效要件） */
  core: boolean;
  /** true = 关键条款，修改需二次确认（旧值 → 新值） */
  critical: boolean;
  required: boolean;
}

export const TERMS_FIELDS: FieldMeta[] = [
  { key: "product", label: "产品/服务", group: "terms", core: false, critical: false, required: true },
  { key: "scope", label: "授权范围", group: "terms", core: false, critical: true, required: true },
  { key: "territory", label: "地域", group: "terms", core: false, critical: true, required: true },
  { key: "pricingModel", label: "收费方式", group: "terms", core: false, critical: false, required: true },
  { key: "currency", label: "币种", group: "terms", core: true, critical: true, required: true },
  { key: "revenueBasis", label: "收入计算口径", group: "terms", core: false, critical: false, required: true },
  // 注意：按校验演示流程，缺分成比例 → NeedsInformation；但分成比例仍是关键条款需二次确认
  { key: "revenueShare", label: "分成比例", group: "terms", core: false, critical: true, required: true },
  { key: "settlementCycle", label: "结算周期", group: "terms", core: true, critical: true, required: true },
  { key: "refund", label: "退款处理", group: "terms", core: false, critical: true, required: true },
];

export const VENDOR_FIELDS: FieldMeta[] = [
  { key: "legalName", label: "签约主体（公司法定名称）", group: "vendor", core: true, critical: true, required: true },
  { key: "country", label: "注册地", group: "vendor", core: false, critical: false, required: true },
  { key: "address", label: "注册地址", group: "vendor", core: false, critical: false, required: true },
  { key: "product", label: "产品/服务", group: "vendor", core: false, critical: false, required: true },
  { key: "signerName", label: "签字人姓名", group: "vendor", core: true, critical: false, required: true },
  { key: "title", label: "签字人职务", group: "vendor", core: false, critical: false, required: true },
  { key: "email", label: "签署邮箱", group: "vendor", core: true, critical: true, required: true },
];

export const ALL_FIELDS: FieldMeta[] = [...VENDOR_FIELDS, ...TERMS_FIELDS];

export const CRITICAL_FIELDS: Set<string> = new Set(
  ALL_FIELDS.filter((f) => f.critical).map((f) => f.key),
);

export function fieldLabel(key: string): string {
  return ALL_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function isCriticalField(key: string): boolean {
  return CRITICAL_FIELDS.has(key);
}

// ---- 完整性校验 ----

export interface ValidationResult {
  valid: boolean;
  /** Draft(有效) | NeedsInformation | Blocked */
  hint: "Draft" | "NeedsInformation" | "Blocked";
  missingCore: string[];
  missingRequired: string[];
}

/** 判断某字段是否缺失（空字符串视为缺失）。 */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

/**
 * 校验合同：由「供应商信息 + 商业条款」合成一帧数据后判定缺失项。
 * - 缺核心生效要件 → Blocked
 * - 缺非核心必填项 → NeedsInformation
 */
export function validateFields(
  vendor: Partial<VendorInfo>,
  terms: Partial<Terms>,
): ValidationResult {
  const data: Record<string, unknown> = {
    ...(vendor ?? {}),
    ...(terms ?? {}),
  };

  const missingCore: string[] = [];
  const missingRequired: string[] = [];

  for (const field of ALL_FIELDS) {
    if (!field.required) continue;
    if (isMissing(data[field.key])) {
      if (field.core) missingCore.push(field.key);
      else missingRequired.push(field.key);
    }
  }

  const hint: ValidationResult["hint"] =
    missingCore.length > 0 ? "Blocked" : missingRequired.length > 0 ? "NeedsInformation" : "Draft";

  return {
    valid: missingCore.length === 0 && missingRequired.length === 0,
    hint,
    missingCore,
    missingRequired,
  };
}

export function isEmptyTerms(terms: Partial<Terms>): boolean {
  return TERMS_FIELDS.every((f) => isMissing((terms as Record<string, unknown>)[f.key]));
}