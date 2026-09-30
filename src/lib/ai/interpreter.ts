import type { Role } from "@/types/domain";
import type { ConfirmationChange } from "./types";
import { fieldLabel, isCriticalField } from "@/lib/contracts/terms";
import type { ContractView } from "@/lib/services/contract-service";

/**
 * 确定性意图解析器：把自然语言文本映射为「工具 + 参数」。
 * - 关键条款变更计算 confirmation.changes（旧值 → 新值，critical 字段 required=true）
 * - 模糊指令返回 kind:"question" 先反问
 * 该层不落库、不执行工具，仅产出意图；真正的权限与落库在 chat/execute 路由完成。
 */

export interface Intent {
  kind: "action" | "question" | "error";
  message: string;
  tool?: string;
  params?: Record<string, unknown>;
  /** 需用户二次确认的字段级变更；关键字段 required=true */
  confirmation?: { required: boolean; changes: ConfirmationChange[] };
}

interface Synonym {
  key: string;
  group: "terms" | "vendor";
  words: string[];
}

const SYNONYMS: Synonym[] = [
  { key: "revenueShare", group: "terms", words: ["分成比例", "分成", "分成百分比", "revenueshare"] },
  { key: "currency", group: "terms", words: ["币种", "currency"] },
  { key: "settlementCycle", group: "terms", words: ["结算周期", "结算", "settlementcycle"] },
  { key: "scope", group: "terms", words: ["授权范围", "scope", "授权"] },
  { key: "territory", group: "terms", words: ["地域", "territory", "区域"] },
  { key: "pricingModel", group: "terms", words: ["收费方式", "pricingmodel"] },
  { key: "revenueBasis", group: "terms", words: ["收入计算口径", "计算口径", "revenuebasis"] },
  { key: "refund", group: "terms", words: ["退款", "退款处理", "refund"] },
  { key: "product", group: "terms", words: ["产品", "服务", "product"] },
  { key: "legalName", group: "vendor", words: ["法定名称", "签约主体", "公司名称", "legalname", "公司"] },
  { key: "country", group: "vendor", words: ["注册地", "country"] },
  { key: "address", group: "vendor", words: ["注册地址", "地址", "address"] },
  { key: "signerName", group: "vendor", words: ["签字人", "签字人姓名", "signername"] },
  { key: "title", group: "vendor", words: ["职务", "title"] },
  { key: "email", group: "vendor", words: ["邮箱", "签署邮箱", "email"] },
];

const PERCENT_FIELDS = new Set(["revenueShare"]);

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** 找出命中的字段（按词长优先，避免「收入计算口径」被「收入」误匹配）。 */
function matchField(msg: string): Synonym | null {
  const hits = SYNONYMS.filter((f) => f.words.some((w) => msg.includes(w)));
  if (hits.length === 0) return null;
  // 优先匹配最长关键词（更具体）
  hits.sort(
    (a, b) =>
      Math.max(...b.words.map((w) => w.length)) -
      Math.max(...a.words.map((w) => w.length)),
  );
  return hits[0];
}

/** 提取百分比字段的值（支持 "15%" 或 "15"）。 */
function extractPercent(msg: string): string | null {
  const pct = msg.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) return `${pct[1]}%`;
  const bare = msg.match(/(?:分成|比例|设为|改成|改为|设置为|补全|填|填为|是)\s*(\d+(?:\.\d+)?)/);
  if (bare) return `${bare[1]}%`;
  return null;
}

const CONNECTIVES = ["设为", "改为", "改成", "设置为", "变更为", "更新为", "为", "=", ":", "是"];

/** 提取通用「字段 设为 值」里的值部分。 */
function extractSetValue(msg: string, word: string): string | null {
  const idx = msg.indexOf(word);
  if (idx < 0) return null;
  let s = msg.slice(idx + word.length);
  s = s.replace(/^(的|请|要|设|设置|成|改|为|好、|好,)?/, "");
  for (const c of CONNECTIVES) {
    const ci = s.indexOf(c);
    if (ci >= 0) {
      s = s.slice(ci + c.length);
      break;
    }
  }
  s = s.replace(/^[\s:=、，]*/, "");
  s = s.replace(/[。，,!！?？;；]+.*$/, "");
  s = s.replace(/[的呢吧呀哦啦么]+$/, "");
  s = s.trim();
  return s.length > 0 ? s : null;
}

/** 依据字段与消息提取新值。 */
function extractValue(msg: string, field: Synonym): string | null {
  if (PERCENT_FIELDS.has(field.key)) return extractPercent(msg);
  for (const w of field.words) {
    const v = extractSetValue(msg, w);
    if (v) return v;
  }
  return null;
}

export interface InterpretContext {
  message: string;
  role: Role;
  contractId: string;
  view: ContractView | null;
}

function confirmFor(key: string, oldValue: unknown, newValue: unknown) {
  const changes: ConfirmationChange[] = [
    {
      key,
      label: fieldLabel(key),
      oldValue,
      newValue,
      critical: isCriticalField(key),
    },
  ];
  return { required: changes.some((c) => c.critical), changes };
}

/** 从 view 读取某字段当前值（terms 或 vendor）。 */
function currentValue(view: ContractView | null, key: string): unknown {
  if (!view) return "";
  const fromTerms = (view.terms as Record<string, unknown>)[key];
  if (fromTerms !== undefined && fromTerms !== null) return fromTerms;
  return (view.vendor as Record<string, unknown>)[key] ?? "";
}

/** 组装字段变更意图（条款 → 新版本；供应商 → patchVendorInfo）。 */
function fieldIntent(ctx: InterpretContext, field: Synonym, value: string): Intent {
  const oldValue = currentValue(ctx.view, field.key);
  const confirmation = confirmFor(field.key, oldValue === "" ? null : oldValue, value);

  if (field.group === "vendor") {
    return {
      kind: "action",
      tool: "patchVendorInfo",
      params: { patch: { [field.key]: value } },
      message: `准备把「${fieldLabel(field.key)}」从「${(oldValue as string) || "空"}」改为「${value}」`,
      confirmation,
    };
  }

  const nextVersion = ((ctx.view?.version) ?? 0) + 1;
  return {
    kind: "action",
    tool: "createNewVersionWithPatch",
    params: { patch: { [field.key]: value } },
    message: `准备把「${fieldLabel(field.key)}」从「${(oldValue as string) || "空"}」改为「${value}」，生成 v${nextVersion}`,
    confirmation,
  };
}

function detectApprovalRole(msg: string, role: Role): "biz" | "legal" {
  if (msg.includes("法务")) return "legal";
  if (msg.includes("商务")) return "biz";
  return role === "legal" ? "legal" : "biz";
}

/** 主入口：文本 → 意图。 */
export function interpret(ctx: InterpretContext): Intent {
  const msg = norm(ctx.message);
  if (!msg) return { kind: "question", message: "请描述你想做什么，例如「补全分成比例为 15%」。" };

  // 1) 模拟签署完成（先于「签署」判断）
  if (/模拟(双方)?签署完成|模拟完成|模拟签署/.test(msg)) {
    return { kind: "action", tool: "simulateCompletion", message: "将模拟双方签署完成（推进签署状态至 Completed）" };
  }

  // 2) 搜索
  if (/搜索|查找|找(一下)?|search/.test(msg)) {
    const query = msg.replace(/.*?(搜索|查找|找(一下)?|search)/, "").replace(/合同|记录/g, "").trim();
    return { kind: "action", tool: "searchContracts", params: { query }, message: `搜索合同：${query || "全部"}` };
  }

  // 3) 校验
  if (/校验|检查|完整性|缺什么|缺哪些|还缺|validate/.test(msg)) {
    return { kind: "action", tool: "validateContract", message: "校验合同完整性并列出缺失字段" };
  }

  // 4) 驳回（含意见）
  if (/驳回|拒绝|reject/.test(msg)) {
    const comment = msg.replace(/.*?(?:驳回|拒绝|reject)\s*[:：]?\s*/, "").trim();
    return {
      kind: "action",
      tool: "rejectVersion",
      params: { approvalRole: detectApprovalRole(msg, ctx.role), comment },
      message: `驳回审批${comment ? `（意见：${comment}）` : ""}，回退草稿`,
    };
  }

  // 5) 通过
  if (/通过|同意|批准|approve(?!.*reject)/.test(msg)) {
    const role = detectApprovalRole(msg, ctx.role);
    return {
      kind: "action",
      tool: "approveVersion",
      params: { approvalRole: role },
      message: `以「${role === "biz" ? "商务" : "法务"}」身份通过审批`,
    };
  }

  // 6) 提交审批
  if (/提交审批|提交|submit/.test(msg)) {
    return { kind: "action", tool: "submitForApproval", message: "提交审批（锁定当前版本并创建商务+法务审批）" };
  }

  // 7) 发起签署
  if (/发起(电子)?签|发起签署|发送签署|send.*sign/.test(msg)) {
    return { kind: "action", tool: "sendForSignature", message: "发起电子签（供应商签署人 + 我方 Kevin Li）" };
  }

  // 8) 同步签署状态
  if (/同步/.test(msg)) {
    return { kind: "action", tool: "syncSignatureStatus", message: "同步签署状态" };
  }

  // 9) 归档
  if (/归档|archive/.test(msg)) {
    return { kind: "action", tool: "archiveContract", message: "归档已签署合同（生成签署 PDF 与证明）" };
  }

  // 10) 字段补全 / 修改
  const field = matchField(msg);
  if (field) {
    const value = extractValue(msg, field);
    if (value) return fieldIntent(ctx, field, value);
    const label = fieldLabel(field.key);
    const cur = currentValue(ctx.view, field.key);
    if (cur !== "" && cur !== null && cur !== undefined) {
      return {
        kind: "question",
        message: `你想把「${label}」改成什么？（当前值：${String(cur)}）`,
      };
    }
    return { kind: "question", message: `请提供「${label}」的新值，例如「${label} 设为 15%」。` };
  }

  // 11) 模糊指令 → 反问
  return {
    kind: "question",
    message:
      "我还不确定你想做什么。可以这样说：补全分成比例 15%、提交审批、通过审批、驳回、发起签署、同步签署状态、归档、搜索合同、校验完整性。",
  };
}