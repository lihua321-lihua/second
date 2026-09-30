// 领域类型与状态常量（与 Prisma 模型对齐，状态字段为字符串）

export const CONTRACT_STATUS = {
  Draft: "Draft",
  NeedsInformation: "NeedsInformation",
  Blocked: "Blocked",
  PendingApproval: "PendingApproval",
  ReadyToSign: "ReadyToSign",
  Sent: "Sent",
  PartiallySigned: "PartiallySigned",
  Completed: "Completed",
  Archived: "Archived",
  Failed: "Failed",
  Cancelled: "Cancelled",
} as const;

export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];

/**
 * 全项目统一的初始化状态：所有新建实体（供应商 / 合同 / 签署请求）初态均为「草稿」。
 * 各创建路径（vendors/route.ts 等）应引用本常量，保证初始化即草稿。
 */
export const INITIAL_STATUS = CONTRACT_STATUS.Draft;

export const SIGNATURE_STATUS = {
  Draft: "Draft",
  Sent: "Sent",
  PartiallySigned: "PartiallySigned",
  Completed: "Completed",
  Failed: "Failed",
  Cancelled: "Cancelled",
} as const;

export type SignatureStatus = (typeof SIGNATURE_STATUS)[keyof typeof SIGNATURE_STATUS];

export const APPROVAL_STATUS = {
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
} as const;

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export type ApprovalRole = "biz" | "legal";

export type ActorType = "user" | "ai" | "system" | "webhook";

export const ROLES = {
  supplier: "供应商",
  biz: "商务",
  legal: "法务",
  admin: "管理员",
} as const;

export type Role = keyof typeof ROLES;

// 商业条款结构
export interface Terms {
  product: string; // 产品/服务
  scope: string; // 授权范围
  territory: string; // 地域
  pricingModel: string; // 收费方式
  currency: string; // 币种
  revenueBasis: string; // 收入计算口径
  revenueShare: string; // 分成比例（如 "15%"，核心条款）
  settlementCycle: string; // 结算周期
  refund: string; // 退款处理
}

// 供应商信息结构（vendorSnapshot 与表单共用）
export interface VendorInfo {
  legalName: string; // 签约主体（公司法定名称）
  country: string; // 注册地
  address: string; // 注册地址
  product: string; // 产品/服务
  signerName: string; // 签字人姓名
  title: string; // 签字人职务
  email: string; // 签字人邮箱（签署邮箱）
}

// 简化契约状态（供纯函数规则使用，service 层负责从 Prisma 组装）
export interface ContractStateView {
  status: ContractStatus;
  currentVersionId: string | null;
  terms: Partial<Terms> | null;
  vendor: Partial<VendorInfo> | null;
  hasPdf: boolean;
  approvals: { role: ApprovalRole; status: ApprovalStatus }[];
  signatureRequest:
    | { versionId: string; status: SignatureStatus; signersComplete: boolean }
    | null;
}