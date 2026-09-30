import type { ContractStatus, SignatureStatus } from "../../types/domain";

/**
 * 状态机：单一来源的合法转移表。
 * 所有状态流转（含 AI / webhook 触发）都必须经由此处判定，禁止散落手写 status 赋值。
 */

// 合同（Contract）状态转移表
export const CONTRACT_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  Draft: ["NeedsInformation", "Blocked", "PendingApproval", "Cancelled"],
  NeedsInformation: ["Draft"],
  Blocked: ["Draft"],
  PendingApproval: ["ReadyToSign", "Draft"], // Draft 为「驳回」回退，记录 ChangesRequested
  ReadyToSign: ["Sent", "Cancelled"],
  Sent: ["PartiallySigned", "Cancelled", "Failed"],
  PartiallySigned: ["Completed", "Cancelled", "Failed"],
  Completed: ["Archived"],
  Archived: [],
  Cancelled: ["Draft"], // 取消后可重新起草新版本
  Failed: ["Draft"],
};

// 签署（SignatureRequest）状态转移表（Forward-only）
export const SIGNATURE_TRANSITIONS: Record<SignatureStatus, SignatureStatus[]> = {
  Draft: ["Sent", "Cancelled", "Failed"],
  Sent: ["PartiallySigned", "Cancelled", "Failed"],
  PartiallySigned: ["Completed", "Cancelled", "Failed"],
  Completed: [], // 终态，不可被覆盖
  Cancelled: [],
  Failed: [],
};

// 签署状态单调推进的权重，用于 Webhook "只允许向前流转"
export const SIGNATURE_RANK: Record<SignatureStatus, number> = {
  Draft: 0,
  Sent: 1,
  PartiallySigned: 2,
  Completed: 3,
  Failed: 0,
  Cancelled: 0,
};

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return (CONTRACT_TRANSITIONS[from] ?? []).includes(to);
}

export function canTransitionSignature(
  from: SignatureStatus,
  to: SignatureStatus,
): boolean {
  return (SIGNATURE_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Webhook 单调推进判定：目标状态权重必须高于当前，且目标状态在转移表允许内；
 * Completed 作为终态不允许被覆盖（Sent/PartiallySigned 权重都低于 Completed）。
 */
export function isForwardSignature(
  current: SignatureStatus,
  target: SignatureStatus,
): boolean {
  if (!canTransitionSignature(current, target)) return false;
  return SIGNATURE_RANK[target] > SIGNATURE_RANK[current];
}

/** 供 UI/校验层查询：某状态下可执行的下一步。 */
export function nextTransitions(status: ContractStatus): ContractStatus[] {
  return CONTRACT_TRANSITIONS[status] ?? [];
}