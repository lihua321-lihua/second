import { createHash } from "crypto";

/** 生成确定性的条款哈希（键排序后序列化），用于版本完整性校验。 */
export function computeTermsHash(terms: Record<string, unknown>): string {
  const canonical = stableStringify(terms);
  return createHash("sha256").update(canonical).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}