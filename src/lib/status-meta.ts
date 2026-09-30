import type { ContractStatus, SignatureStatus } from "@/types/domain";

/** 状态 → 展示标签 */
export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  Draft: "草稿",
  NeedsInformation: "待补充信息",
  Blocked: "已阻断",
  PendingApproval: "待审批",
  ReadyToSign: "待签署",
  Sent: "已发出签署",
  PartiallySigned: "部分签署",
  Completed: "已签署",
  Archived: "已归档",
  Failed: "失败",
  Cancelled: "已取消",
};

export function statusLabel(status: string): string {
  return CONTRACT_STATUS_LABEL[status] ?? status;
}

/** 状态 → 徽章配色变体 */
export function statusVariant(
  status: string,
): "default" | "secondary" | "outline" | "success" | "warning" | "info" | "destructive" {
  switch (status) {
    case "Draft":
      return "secondary";
    case "NeedsInformation":
    case "PendingApproval":
      return "warning";
    case "Blocked":
    case "Failed":
    case "Cancelled":
      return "destructive";
    case "ReadyToSign":
      return "info";
    case "Sent":
    case "PartiallySigned":
      return "info";
    case "Completed":
      return "success";
    case "Archived":
      return "outline";
    default:
      return "default";
  }
}

export const SIGNATURE_STATUS_LABEL: Record<string, string> = {
  Draft: "未发起",
  Sent: "已发出",
  PartiallySigned: "部分签署",
  Completed: "签署完成",
  Failed: "失败",
  Cancelled: "已取消",
};

export function signatureStatusLabel(status: string): string {
  return SIGNATURE_STATUS_LABEL[status] ?? status;
}

export const ROLE_LABEL: Record<string, string> = {
  supplier: "供应商",
  biz: "商务",
  legal: "法务",
  admin: "管理员",
};

/** 极简步骤条节点 */
export const STEPS = ["草稿", "校验", "审批", "签署", "归档"] as const;

/** 状态 → 步骤条激活下标 */
export function stepIndexOf(status: string): number {
  switch (status) {
    case "Draft":
      return 0;
    case "NeedsInformation":
    case "Blocked":
    case "Failed":
    case "Cancelled":
      return 1;
    case "PendingApproval":
    case "ReadyToSign":
      return 2;
    case "Sent":
    case "PartiallySigned":
    case "Completed":
      return 3;
    case "Archived":
      return 4;
    default:
      return 0;
  }
}

export type { ContractStatus, SignatureStatus };