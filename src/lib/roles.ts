import type { Role } from "@/types/domain";

/** 角色 → 操作人标识（前端模拟权限下用于审计与审批归属）。 */
export function personaOfRole(role: Role): string {
  switch (role) {
    case "supplier":
      return "alice@acme.example";
    case "biz":
      return "bob@ourco.example";
    case "legal":
      return "carol@ourco.example";
    case "admin":
      return "kevin@ourco.example";
  }
}

/** 角色可执行的动作集合（供前端 UI 与控制服务端 AI 权限共用）。 */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  supplier: ["patchVendorInfo", "editTerms", "createVersion"],
  biz: ["approveVersion", "rejectVersion"],
  legal: ["approveVersion", "rejectVersion"],
  admin: [
    "patchVendorInfo",
    "editTerms",
    "createVersion",
    "validateContract",
    "submitForApproval",
    "approveVersion",
    "rejectVersion",
    "sendForSignature",
    "syncSignatureStatus",
    "archiveContract",
    "searchContracts",
  ],
};

export function can(role: Role, action: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}