import { NextRequest, NextResponse } from "next/server";
import { getTool, undoTool, type RevertPatch } from "@/lib/ai/tools";
import { ROLES, type Role } from "@/types/domain";
import type { AIResponse } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

/**
 * 执行 AI 工具（用户在确认卡上点「确认执行」后调用）。
 * - 所有变更通过服务层落库（AI 不直接改 UI）
 * - 服务端按角色强制权限校验（工具层 guard 二次把关）
 * - 写审计 source='ai'
 * - 支持撤销：body.undo=true + body.revert 传入逆 patch
 */
export async function POST(req: NextRequest) {
  let body: {
    tool?: string;
    params?: Record<string, unknown>;
    contractId?: string;
    role?: Role;
    undo?: boolean;
    revert?: RevertPatch;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = (ROLES as Record<string, unknown>)[body.role ?? ""] ? (body.role as Role) : "admin";
  const contractId = body.contractId ?? "";
  const ctx = { contractId, role };

  let result;
  if (body.undo) {
    if (!body.revert) {
      return NextResponse.json<AIResponse>({ kind: "error", message: "缺少撤销信息", contractId });
    }
    result = await undoTool(ctx, body.revert);
  } else {
    const toolName = body.tool ?? "";
    const tool = getTool(toolName);
    if (!tool) {
      return NextResponse.json<AIResponse>({ kind: "error", message: `未识别的操作：${toolName}`, contractId });
    }
    result = await tool.run(ctx, body.params ?? {});
  }

  return NextResponse.json<AIResponse>({
    kind: result.ok ? "done" : "error",
    message: result.message,
    tool: body.tool,
    contractId,
    result,
  });
}