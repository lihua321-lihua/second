import { personaOfRole, can } from "@/lib/roles";
import { createNewVersionWithPatch, loadContractView } from "@/lib/services/contract-service";
import {
  submitForApproval,
  approveVersion,
  rejectVersion,
} from "@/lib/services/approval-service";
import {
  sendForSignature,
  syncSignatureStatus,
  simulateCompletion,
} from "@/lib/services/signature-service";
import { archiveContract } from "@/lib/services/archive-service";
import {
  patchVendorInfo,
  validateContract,
  searchContracts,
} from "@/lib/services/vendor-service";
import type { Role } from "@/types/domain";

/** 可撤销操作的逆 patch（把关键字段从新值改回旧值）。 */
export interface RevertPatch {
  tool: string;
  patch: Record<string, unknown>;
}

export type ToolResult =
  | { ok: true; message: string; data?: unknown; revert?: RevertPatch }
  | { ok: false; message: string; forbidden?: boolean };

export interface ToolContext {
  contractId: string;
  role: Role;
}

export interface AITool {
  name: string;
  /** 对应权限 action 键（见 lib/roles.ts ROLE_PERMISSIONS）。 */
  action: string;
  kind: "read" | "mutation";
  description: string;
  run: (ctx: ToolContext, params: Record<string, unknown>) => Promise<ToolResult>;
}

function actor(ctx: ToolContext): string {
  return personaOfRole(ctx.role);
}

function guard(ctx: ToolContext, action: string): string | null {
  if (!can(ctx.role, action)) return `当前角色（${ctx.role}）无权执行「${action}」`;
  return null;
}

/** 把 filter (["a","b"]) 限制到仅保留 changed 里的字段，去掉空字符串（避免撤销受空值干扰）。 */
function pickFromDiff(diff: { key: string; oldValue: unknown; newValue: unknown }[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const d of diff) {
    patch[d.key] = d.oldValue === null || d.oldValue === undefined ? "" : d.oldValue;
  }
  return patch;
}

const tools: Record<string, AITool> = {
  patchVendorInfo: {
    name: "patchVendorInfo",
    action: "patchVendorInfo",
    kind: "mutation",
    description: "修改供应商信息（法定名称/注册地/地址/产品/签字人/职务/邮箱）",
    async run(ctx, params) {
      const denied = guard(ctx, "patchVendorInfo");
      if (denied) return { ok: false, forbidden: true, message: denied };
      try {
        const patch = (params.patch ?? {}) as Record<string, unknown>;
        const r = await patchVendorInfo(ctx.contractId, patch, "ai", actor(ctx));
        const revert: Record<string, unknown> = {};
        for (const key of Object.keys(r.after)) {
          const before = (r.before as unknown as Record<string, unknown>)[key];
          const after = (r.after as unknown as Record<string, unknown>)[key];
          if (JSON.stringify(before) !== JSON.stringify(after)) revert[key] = before ?? "";
        }
        return {
          ok: true,
          message: "供应商信息已更新",
          data: { view: r.view },
          revert: Object.keys(revert).length ? { tool: "patchVendorInfo", patch: revert } : undefined,
        };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  createNewVersionWithPatch: {
    name: "createNewVersionWithPatch",
    action: "createVersion",
    kind: "mutation",
    description: "应用条款 patch 并生成新版本（不可变；旧审批作废）",
    async run(ctx, params) {
      const denied = guard(ctx, "createVersion");
      if (denied) return { ok: false, forbidden: true, message: denied };
      try {
        const r = await createNewVersionWithPatch(
          ctx.contractId,
          (params.patch ?? {}) as never,
          "ai",
          actor(ctx),
        );
        return {
          ok: true,
          message: `已生成 v${r.versionNumber}`,
          data: { version: r.versionNumber, diff: r.diff },
          revert: r.diff.length
            ? { tool: "createNewVersionWithPatch", patch: pickFromDiff(r.diff) }
            : undefined,
        };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  validateContract: {
    name: "validateContract",
    action: "validateContract",
    kind: "read",
    description: "校验合同完整性并返回缺失字段",
    async run(ctx) {
      const denied = guard(ctx, "validateContract");
      if (denied) return { ok: false, forbidden: true, message: denied };
      const data = await validateContract(ctx.contractId);
      return { ok: true, message: "校验完成", data };
    },
  },

  submitForApproval: {
    name: "submitForApproval",
    action: "submitForApproval",
    kind: "mutation",
    description: "提交审批（锁定当前版本，创建商务+法务审批）",
    async run(ctx) {
      const denied = guard(ctx, "submitForApproval");
      if (denied) return { ok: false, forbidden: true, message: denied };
      try {
        const view = await submitForApproval(ctx.contractId, actor(ctx), "ai");
        return { ok: true, message: `已提交审批（状态：${view.status}）`, data: { status: view.status } };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  approveVersion: {
    name: "approveVersion",
    action: "approveVersion",
    kind: "mutation",
    description: "通过审批（商务/法务）",
    async run(ctx, params) {
      const denied = guard(ctx, "approveVersion");
      if (denied) return { ok: false, forbidden: true, message: denied };
      const approvalRole = (params.approvalRole as "biz" | "legal") ?? (ctx.role === "legal" ? "legal" : "biz");
      try {
        const view = await approveVersion(ctx.contractId, approvalRole, actor(ctx), "ai");
        return { ok: true, message: `已通过（${approvalRole === "biz" ? "商务" : "法务"}），状态：${view.status}`, data: { status: view.status } };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  rejectVersion: {
    name: "rejectVersion",
    action: "rejectVersion",
    kind: "mutation",
    description: "驳回审批（回退草稿，保留意见）",
    async run(ctx, params) {
      const denied = guard(ctx, "rejectVersion");
      if (denied) return { ok: false, forbidden: true, message: denied };
      const approvalRole = (params.approvalRole as "biz" | "legal") ?? (ctx.role === "legal" ? "legal" : "biz");
      try {
        const view = await rejectVersion(ctx.contractId, approvalRole, actor(ctx), (params.comment as string) ?? "", "ai");
        return { ok: true, message: `已驳回，回退草稿（状态：${view.status}）`, data: { status: view.status } };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  sendForSignature: {
    name: "sendForSignature",
    action: "sendForSignature",
    kind: "mutation",
    description: "发起电子签",
    async run(ctx, params) {
      const denied = guard(ctx, "sendForSignature");
      if (denied) return { ok: false, forbidden: true, message: denied };
      try {
        const vs = (params.vendorSigner as { name?: string; email?: string }) ?? {};
        // 未显式指定时，自动带出合同内的供应商签署人（Alice Tan / alice@acme.example）
        const v = await loadContractView(ctx.contractId);
        const name = (vs.name ?? "").trim() || (v.vendor.signerName ?? "");
        const email = (vs.email ?? "").trim() || (v.vendor.email ?? "");
        const view = await sendForSignature(
          ctx.contractId,
          { name, email },
          actor(ctx),
          "ai",
        );
        return { ok: true, message: `已发起签署（状态：${view.status}）`, data: { status: view.status } };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  syncSignatureStatus: {
    name: "syncSignatureStatus",
    action: "syncSignatureStatus",
    kind: "read",
    description: "同步签署状态",
    async run(ctx) {
      const denied = guard(ctx, "syncSignatureStatus");
      if (denied) return { ok: false, forbidden: true, message: denied };
      try {
        const r = await syncSignatureStatus(ctx.contractId, actor(ctx), "ai");
        return { ok: true, message: `已同步（${r.applied} 条新事件）`, data: { status: r.view.status } };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  simulateCompletion: {
    name: "simulateCompletion",
    action: "sendForSignature",
    kind: "mutation",
    description: "模拟双方签署完成",
    async run(ctx) {
      const denied = guard(ctx, "sendForSignature");
      if (denied) return { ok: false, forbidden: true, message: denied };
      try {
        const r = await simulateCompletion(ctx.contractId, actor(ctx), "ai");
        return { ok: true, message: "已模拟签署完成", data: { status: r.view.status } };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  archiveContract: {
    name: "archiveContract",
    action: "archiveContract",
    kind: "mutation",
    description: "归档已签署合同",
    async run(ctx) {
      const denied = guard(ctx, "archiveContract");
      if (denied) return { ok: false, forbidden: true, message: denied };
      try {
        const view = await archiveContract(ctx.contractId, actor(ctx), "ai");
        return { ok: true, message: `已归档（状态：${view.status}）`, data: { status: view.status } };
      } catch (e) {
        return { ok: false, message: (e as Error).message };
      }
    },
  },

  searchContracts: {
    name: "searchContracts",
    action: "searchContracts",
    kind: "read",
    description: "搜索合同",
    async run(ctx, params) {
      const denied = guard(ctx, "searchContracts");
      if (denied) return { ok: false, forbidden: true, message: denied };
      const data = await searchContracts((params.query as string) ?? "");
      return { ok: true, message: `找到 ${data.length} 个合同`, data };
    },
  },
};

export function getTool(name: string): AITool | undefined {
  return tools[name];
}

/** 撤销上一次可撤销数据修改：以逆 patch 重新执行原工具（版本不可变，撤销同样生成新版本）。 */
export async function undoTool(ctx: ToolContext, revert: RevertPatch): Promise<ToolResult> {
  const tool = getTool(revert.tool);
  if (!tool) return { ok: false, message: "该操作不可撤销" };
  const denied = guard(ctx, tool.action);
  if (denied) return { ok: false, forbidden: true, message: denied };
  return tool.run(ctx, { patch: revert.patch });
}

export const AI_TOOL_NAMES = Object.keys(tools);