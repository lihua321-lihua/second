import { validateFields } from "./terms";
import type { ApprovalRole, ContractStateView } from "../../types/domain";

/**
 * 核心规则纯函数（可单测）：
 * - canSubmitForApproval
 * - canSendForSignature
 * - 审批是否双通过
 * service 层负责从 Prisma 组装 ContractStateView 后调用。
 */

const BIZ_APPROVERS = ["bob@ourco.example"];
const LEGAL_APPROVERS = ["carol@ourco.example"];

export function approvalEmails(role: ApprovalRole): string[] {
  return role === "biz" ? BIZ_APPROVERS : LEGAL_APPROVERS;
}

/** 两位审批人（商务 + 法务）是否都已通过。 */
export function hasBothApprovals(
  approvals: ContractStateView["approvals"],
): boolean {
  const byRole: Record<string, boolean> = {};
  for (const a of approvals) {
    if (a.status === "Approved") byRole[a.role] = true;
  }
  return byRole["biz"] === true && byRole["legal"] === true;
}

/** 签署信息是否完整：签约主体、签字人、签署邮箱均已填。 */
export function isSigningInfoComplete(vendor: ContractStateView["vendor"]): boolean {
  if (!vendor) return false;
  return (
    !!vendor.legalName?.trim() &&
    !!vendor.signerName?.trim() &&
    !!vendor.email?.trim()
  );
}

/**
 * 是否可提交审批：
 * - 当前仍在 Draft（有效草稿，未被锁定）
 * - 条款/供应商信息完整性校验通过（无缺失必填项）
 */
export function canSubmitForApproval(state: ContractStateView): boolean {
  if (state.status !== "Draft") return false;
  if (!state.terms) return false;
  const v = validateFields(state.vendor ?? {}, state.terms);
  return v.valid;
}

/**
 * 是否可发起签署（规则 5）：
 * - 状态为 ReadyToSign
 * - PDF 已生成
 * - 当前版本两位审批人均已通过
 * - 签署信息完整
 * - 已存在的签署请求版本 === 当前版本（或被新请求覆盖）
 */
export function canSendForSignature(state: ContractStateView): boolean {
  if (state.status !== "ReadyToSign") return false;
  if (!state.hasPdf) return false;
  if (state.currentVersionId == null) return false;
  if (!hasBothApprovals(state.approvals)) return false;
  if (!isSigningInfoComplete(state.vendor)) return false;
  if (state.signatureRequest && state.signatureRequest.versionId !== state.currentVersionId) {
    return false;
  }
  return true;
}