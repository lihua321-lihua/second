import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getTool, AI_TOOL_NAMES } from "@/lib/ai/tools";
import { ROLE_PERMISSIONS } from "@/lib/roles";
import { fieldLabel, isCriticalField, ALL_FIELDS } from "@/lib/contracts/terms";
import { ROLES } from "@/types/domain";
import type { Intent, InterpretContext } from "@/lib/ai/interpreter";
import type { ContractView } from "@/lib/services/contract-service";

/**
 * LLM 意图解析（DeepSeek / 任意 OpenAI 兼容端点）。
 * - 未配置 OPENAI_API_KEY 时返回 null，由调用方回退到确定性规则引擎
 * - 调用失败或返回非法 JSON / 未知工具时同样返回 null（不阻塞演示流程）
 * 该层不落库、不执行工具，仅产出意图；权限与落库仍由 chat/execute 路由把关。
 */

/** 各工具的 params 格式说明（注入 prompt，引导模型输出合法参数）。 */
const PARAM_HINTS: Record<string, string> = {
  patchVendorInfo:
    'params.patch 为对象，键限以下英文字段：legalName/country/address/product/signerName/title/email，值为新字符串',
  createNewVersionWithPatch:
    'params.patch 为对象，键限以下英文条款字段：product/scope/territory/pricingModel/currency/revenueBasis/revenueShare/settlementCycle/refund，值为新字符串',
  validateContract: "无参数",
  submitForApproval: "无参数",
  approveVersion: 'params.approvalRole 为 "biz"（商务）或 "legal"（法务）',
  rejectVersion: 'params.approvalRole 为 "biz"（商务）或 "legal"（法务）；params.comment 为驳回意见字符串',
  sendForSignature: "无参数（自动带出合同内供应商签署人）",
  syncSignatureStatus: "无参数",
  simulateCompletion: "无参数",
  archiveContract: "无参数",
  searchContracts: "params.query 为搜索关键词字符串",
};

/** 从响应文本中截取第一个 JSON 对象（容忍 ```json 代码块与前后杂讯）。 */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const raw = text.slice(start, i + 1);
        try {
          return JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 只保留 patch 中已知的英文字段键，过滤未知/中文键。 */
function sanitizePatch(patch: unknown): Record<string, unknown> {
  if (!isPlainObject(patch)) return {};
  const known = new Set(ALL_FIELDS.map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (known.has(k) && typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  }
  return out;
}

/** 依据 view 与 patch 组装字段级变更确认（与确定性引擎同规则：关键条款 required=true）。 */
function buildConfirmation(
  view: ContractView | null,
  patch: Record<string, unknown>,
): { required: boolean; changes: { key: string; label: string; oldValue: unknown; newValue: unknown; critical: boolean }[] } {
  const changes = Object.entries(patch).map(([key, newValue]) => {
    const oldValue =
      (view && ((view.terms as Record<string, unknown>)[key] ?? (view.vendor as Record<string, unknown>)[key])) ??
      "";
    return {
      key,
      label: fieldLabel(key),
      oldValue: oldValue === "" ? null : oldValue,
      newValue,
      critical: isCriticalField(key),
    };
  });
  return { required: changes.some((c) => c.critical), changes };
}

function toolCatalog(): string {
  return AI_TOOL_NAMES.map((name) => {
    const tool = getTool(name);
    if (!tool) return null;
    const hint = PARAM_HINTS[name] ?? "无参数";
    return `- ${name}：${tool.description}。参数：${hint}`;
  })
    .filter(Boolean)
    .join("\n");
}

function viewSummary(view: ContractView | null): string {
  if (!view) return "（未指定合同）";
  const lines: string[] = [];
  for (const field of ALL_FIELDS) {
    const value =
      (view.terms as Record<string, unknown>)[field.key] ??
      (view.vendor as Record<string, unknown>)[field.key];
    lines.push(`${fieldLabel(field.key)}=${value === "" || value == null ? "空" : String(value)}`);
  }
  return `状态：${view.status}；版本：v${view.version ?? "-"}\n${lines.join("；")}`;
}

/**
 * 主入口：文本 → 意图（LLM 版）。
 * @returns 合法意图；无法解析或未配置 key 时返回 null（调用方回退确定性引擎）。
 */
export async function interpretWithLLM(ctx: InterpretContext): Promise<Intent | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const baseURL = process.env.OPENAI_BASE_URL?.trim() || "https://api.deepseek.com/v1";
  const model = process.env.OPENAI_MODEL?.trim() || "deepseek-chat";

  const roleLabel = ROLES[ctx.role];
  const allowed = (ROLE_PERMISSIONS[ctx.role] ?? []).join("、") || "无";

  const system = [
    `你是供应商合同管理系统的 AI 助手。当前交互角色为「${roleLabel}」，该角色允许执行的动作：${allowed}。`,
    `你的任务：把用户的中文指令解析为一个 JSON 对象，只输出该 JSON，不要输出任何其他文字。`,
    `可用工具：\n${toolCatalog()}`,
    `当前合同：\n${viewSummary(ctx.view)}`,
    `输出规则：`,
    `1. 指令可执行时：{"kind":"action","tool":"工具名","params":{...},"message":"面向用户的简短中文说明"}`,
    `2. 指令无法映射到工具或信息不完整时：{"kind":"question","message":"澄清问题（中文）"}`,
    `3. params.patch 的键必须使用上面列出的英文字段名，不得使用中文键。`,
    `4. 只能选择当前角色允许执行的动作对应的工具。`,
  ].join("\n");

  try {
    const { text } = await generateText({
      model: createOpenAI({ apiKey, baseURL, compatibility: "compatible" })(model),
      system,
      prompt: ctx.message,
      temperature: 0,
      maxTokens: 1024,
    });

    const raw = extractJsonObject(text);
    if (!raw) return null;

    if (raw.kind === "question") {
      const message = typeof raw.message === "string" ? raw.message.trim() : "";
      if (!message) return null;
      return { kind: "question", message };
    }

    if (raw.kind !== "action") return null;
    const tool = typeof raw.tool === "string" ? raw.tool : "";
    if (!getTool(tool)) return null;

    const params = isPlainObject(raw.params) ? raw.params : {};
    const intent: Intent = {
      kind: "action",
      tool,
      params,
      message: typeof raw.message === "string" && raw.message.trim() ? raw.message.trim() : `执行「${tool}」`,
    };

    // 字段级变更：过滤未知键并组装二次确认（关键条款 required=true）
    if (tool === "patchVendorInfo" || tool === "createNewVersionWithPatch") {
      const patch = sanitizePatch(params.patch);
      if (Object.keys(patch).length === 0) return null;
      intent.params = { patch };
      intent.confirmation = buildConfirmation(ctx.view, patch);
    }

    return intent;
  } catch {
    // LLM 不可用（无网络/余额/超时）→ 回退确定性引擎
    return null;
  }
}
