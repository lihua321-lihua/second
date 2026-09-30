import type { ToolResult } from "./tools";

export interface ConfirmationChange {
  key: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
  critical: boolean;
}

export interface AIResponse {
  kind: "question" | "proposal" | "done" | "error";
  message: string;
  tool?: string;
  params?: Record<string, unknown>;
  contractId?: string;
  /** 需用户确认的字段级变更（旧值 → 新值）；关键字段变更 required=true */
  confirmation?: { required: boolean; changes: ConfirmationChange[] };
  result?: ToolResult;
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}