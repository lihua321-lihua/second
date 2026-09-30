"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRoleStore } from "@/store/role-store";
import type { AIResponse } from "@/lib/ai/types";
import type { ToolResult, RevertPatch } from "@/lib/ai/tools";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  kind?: "question" | "proposal" | "done" | "error";
  result?: ToolResult | null;
  revert?: RevertPatch | null;
  contractId?: string;
  tool?: string;
}

function contractIdFromPath(p: string): string {
  const m = p.match(/\/contracts\/([^/]+)/);
  return m ? m[1] : "";
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "（空）";
  return String(v);
}

function jumpHrefFor(tool: string | undefined, contractId: string): string {
  const base = `/contracts/${contractId}`;
  switch (tool) {
    case "createNewVersionWithPatch":
    case "patchVendorInfo":
      return `${base}/terms`;
    case "submitForApproval":
    case "approveVersion":
    case "rejectVersion":
      return `${base}/approval`;
    case "sendForSignature":
    case "syncSignatureStatus":
    case "simulateCompletion":
      return `${base}/status`;
    case "archiveContract":
      return `${base}/archive`;
    default:
      return base;
  }
}

export function AIDock() {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pending, setPending] = useState<AIResponse | null>(null);

  const role = useRoleStore((s) => s.role);
  const pathname = usePathname();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);

  const contractId = contractIdFromPath(pathname);

  function push(m: ChatMsg) {
    setMessages((prev) => [...prev, m]);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  }

  async function send() {
    const text = value.trim();
    if (!text || loading) return;
    setValue("");
    setPending(null);
    push({ role: "user", content: text });
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, role, contractId }),
      });
      const data: AIResponse = await res.json();

      if (data.kind === "proposal") {
        push({
          role: "assistant",
          content: data.message,
          kind: "proposal",
          contractId: data.contractId,
          tool: data.tool,
        });
        setPending(data);
      } else if (data.kind === "done") {
        push({
          role: "assistant",
          content: data.message,
          kind: "done",
          result: data.result,
          contractId: data.contractId,
          tool: data.tool,
        });
      } else if (data.kind === "question") {
        push({ role: "assistant", content: data.message, kind: "question" });
      } else {
        push({ role: "assistant", content: data.message, kind: "error" });
      }
    } catch {
      push({ role: "assistant", content: "AI 服务暂不可用，请稍后重试。", kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!pending || loading) return;
    const p = pending;
    setPending(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: p.tool,
          params: p.params,
          role,
          contractId: p.contractId,
        }),
      });
      const data: AIResponse = await res.json();
      const result = data.result as ToolResult | undefined;

      if (data.kind === "done" && result?.ok) {
        push({
          role: "assistant",
          content: data.message,
          kind: "done",
          result,
          revert: result.revert,
          contractId: data.contractId,
          tool: p.tool,
        });
        router.refresh();
      } else {
        const forbidden = result && result.ok === false && result.forbidden;
        push({
          role: "assistant",
          content: forbidden ? `权限拒绝：${data.message}` : data.message,
          kind: "error",
        });
      }
    } catch {
      push({ role: "assistant", content: "执行失败，请稍后重试。", kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function undo(msg: ChatMsg) {
    if (!msg.revert || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: msg.tool ?? msg.revert.tool,
          undo: true,
          revert: msg.revert,
          role,
          contractId: msg.contractId,
        }),
      });
      const data: AIResponse = await res.json();
      const result = data.result as ToolResult | undefined;
      push({
        role: "assistant",
        content: data.kind === "done" && result?.ok ? `已撤销：${data.message}` : data.message,
        kind: data.kind === "error" || !result?.ok ? "error" : "done",
        result: result?.ok ? result : undefined,
        revert: result?.ok ? result.revert : undefined,
        contractId: data.contractId,
        tool: msg.tool,
      });
      router.refresh();
    } catch {
      push({ role: "assistant", content: "撤销失败，请稍后重试。", kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3">
        {/* 展开面板 */}
        {expanded && (
          <div className="mb-3 flex max-h-[60vh] flex-col rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-semibold">AI 助手</span>
              <span className="text-xs text-muted-foreground">
                当前角色：{role === "admin" ? "管理员" : role === "biz" ? "商务" : role === "legal" ? "法务" : "供应商"}
                {contractId ? ` · 合同 ${contractId.slice(0, 8)}…` : ""}
              </span>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  试着说：补全分成比例 15%、提交审批、通过审批、发起签署、同步签署状态、归档、搜索合同、校验完整性。
                </p>
              )}

              {messages.map((m, i) => {
                const pathCid = contractIdFromPath(pathname);
                const isCrossPage = !!m.contractId && m.contractId !== pathCid;
                return (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : m.kind === "error"
                            ? "border border-destructive/40 bg-destructive/10"
                            : "border bg-muted"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>

                      {/* 已执行成功：撤销 + 跨页跳转 */}
                      {m.role === "assistant" && m.kind === "done" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {m.revert && (
                            <Button size="sm" variant="outline" onClick={() => undo(m)} disabled={loading}>
                              撤销
                            </Button>
                          )}
                          {isCrossPage && m.contractId && (
                            <Link href={jumpHrefFor(m.tool, m.contractId)}>
                              <Button size="sm" variant="link">
                                修改了其他合同，点击查看 →
                              </Button>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* 确认卡（提案待执行） */}
              {pending && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                  <div className="text-sm font-medium">{pending.message}</div>
                  {pending.confirmation?.changes?.length ? (
                    <div className="mt-2 space-y-1.5">
                      {pending.confirmation.changes.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Badge variant={c.critical ? "warning" : "secondary"}>{c.label}</Badge>
                          <span className="text-muted-foreground">{fmt(c.oldValue)}</span>
                          <span>→</span>
                          <span className="font-semibold">{fmt(c.newValue)}</span>
                          {c.critical && <span className="text-amber-600">（关键条款）</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">该操作将立即生效，是否继续？</p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" onClick={confirm} disabled={loading}>
                      {loading ? "执行中…" : "确认执行"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPending(null)} disabled={loading}>
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {loading && !pending && <p className="text-xs text-muted-foreground">正在思考…</p>}
            </div>
          </div>
        )}

        {/* 输入栏 */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "收起" : "展开"}
          >
            {expanded ? "收起" : "展开"}
          </Button>
          <span className="shrink-0 text-sm font-semibold text-muted-foreground">AI</span>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="用自然语言操作：补全分成比例 15%、提交审批、发起签署…"
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
          />
          <Button size="sm" onClick={send} disabled={loading}>
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}