import { NextRequest, NextResponse } from "next/server";
import { interpret } from "@/lib/ai/interpreter";
import { interpretWithLLM } from "@/lib/ai/llm";
import { getTool } from "@/lib/ai/tools";
import { loadContractView, type ContractView } from "@/lib/services/contract-service";
import { can } from "@/lib/roles";
import { ROLES, type Role } from "@/types/domain";
import type { AIResponse } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

/** 需要绑定具体合同的工具（searchContracts 除外）。 */
const CONTRACT_BOUND = new Set([
  "patchVendorInfo",
  "createNewVersionWithPatch",
  "validateContract",
  "submitForApproval",
  "approveVersion",
  "rejectVersion",
  "sendForSignature",
  "syncSignatureStatus",
  "simulateCompletion",
  "archiveContract",
]);

/**
 * AI 对话入口：解析意图（不落库）。
 * - 读工具：立即执行并返回 done
 * - 变更工具：返回 proposal（含关键条款二次确认），等 execute 再落库
 */
export async function POST(req: NextRequest) {
  let body: { message?: string; role?: Role; contractId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  const role: Role = (ROLES as Record<string, unknown>)[body.role ?? ""] ? (body.role as Role) : "admin";
  const contractId = body.contractId ?? "";

  if (!message) {
    return NextResponse.json<AIResponse>({ kind: "question", message: "请描述你想做什么。" });
  }

  let view: ContractView | null = null;
  if (contractId) {
    try {
      view = await loadContractView(contractId);
    } catch {
      return NextResponse.json<AIResponse>({
        kind: "error",
        message: `找不到合同 ${contractId}`,
      });
    }
  }

  // 配置了 LLM（DeepSeek）时优先走 LLM 意图解析；未配置/失败则回退确定性规则引擎
  const llmIntent = await interpretWithLLM({ message, role, contractId, view });
  const intent = llmIntent ?? interpret({ message, role, contractId, view });

  if (intent.kind === "question") {
    return NextResponse.json<AIResponse>({ kind: "question", message: intent.message, contractId });
  }
  if (intent.kind === "error") {
    return NextResponse.json<AIResponse>({ kind: "error", message: intent.message, contractId });
  }

  const toolName = intent.tool as string;
  const tool = getTool(toolName);
  if (!tool) {
    return NextResponse.json<AIResponse>({ kind: "error", message: `未识别的操作：${toolName}`, contractId });
  }

  // 权限预检（execute 仍会强制校验，作为真正的服务端闸门）
  if (!can(role, tool.action)) {
    return NextResponse.json<AIResponse>({
      kind: "error",
      message: `当前角色（${role}）无权执行「${tool.action}」`,
      contractId,
    });
  }

  // 非搜索类工具需绑定合同
  if (CONTRACT_BOUND.has(toolName) && !contractId) {
    return NextResponse.json<AIResponse>({
      kind: "question",
      message: "该操作需要指定合同。请先在某个合同页面发起，或告诉我合同名称让我搜索。",
    });
  }

  const ctx = { contractId, role };

  // 读工具：立即执行
  if (tool.kind === "read") {
    const result = await tool.run(ctx, intent.params ?? {});
    return NextResponse.json<AIResponse>({
      kind: "done",
      message: result.ok ? result.message : result.message,
      tool: toolName,
      params: intent.params,
      contractId,
      result,
    });
  }

  // 变更工具：返回提案（等二次确认）
  return NextResponse.json<AIResponse>({
    kind: "proposal",
    message: intent.message,
    tool: toolName,
    params: intent.params,
    contractId,
    confirmation: intent.confirmation,
  });
}