"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/contract/page-header";
import type { ContractView } from "@/lib/services/contract-service";

interface LogRow {
  id: string;
  timestamp: string;
  actor: string;
  actorType: string;
  source: string;
  action: string;
  entity: string;
  before: string | null;
  after: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  user: "用户",
  ai: "AI",
  system: "系统",
  webhook: "Webhook",
};

function parseJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "空";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Diff({ before, after }: { before: string | null; after: string | null }) {
  const b = parseJson(before);
  const a = parseJson(after);

  if (b && typeof b === "object" && !Array.isArray(b) && a && typeof a === "object" && !Array.isArray(a)) {
    const bObj = b as Record<string, unknown>;
    const aObj = a as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(bObj), ...Object.keys(aObj)]));
    const changes = keys.filter((k) => JSON.stringify(bObj[k]) !== JSON.stringify(aObj[k]));
    if (changes.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="space-y-0.5">
        {changes.map((k) => (
          <div key={k}>
            <span className="font-medium">{k}</span>: <span className="text-red-600">{fmtValue(bObj[k])}</span>
            <span className="text-muted-foreground"> → </span>
            <span className="text-emerald-600">{fmtValue(aObj[k])}</span>
          </div>
        ))}
      </div>
    );
  }

  if (a === null && b === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      {b !== null && <div className="text-red-600">旧 {fmtValue(b)}</div>}
      {a !== null && <div className="text-emerald-600">新 {fmtValue(a)}</div>}
    </div>
  );
}

export default function LogsPage({ params }: { params: { id: string } }) {
  const [view, setView] = useState<ContractView | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/contracts/${params.id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setView(d)))
      .catch(() => setError("加载失败"));
    fetch(`/api/contracts/${params.id}/logs`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setLogs(d) : setLogs([])))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error || !view) {
    return <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? "合同不存在"}</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader view={view} />

      <Card>
        <CardHeader>
          <CardTitle>操作日志</CardTitle>
          <CardDescription>来源：用户 / AI / 系统 / Webhook；变更展示字段级 before → after。</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">暂无操作记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="whitespace-nowrap py-2 pr-4">时间</th>
                    <th className="whitespace-nowrap py-2 pr-4">操作人</th>
                    <th className="whitespace-nowrap py-2 pr-4">来源</th>
                    <th className="whitespace-nowrap py-2 pr-4">动作</th>
                    <th className="py-2">变更</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b align-top">
                      <td className="whitespace-nowrap py-2 pr-4">{new Date(l.timestamp).toLocaleString("zh-CN")}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{l.actor}</td>
                      <td className="whitespace-nowrap py-2 pr-4">
                        <Badge variant="outline">{SOURCE_LABEL[l.source] ?? l.source}</Badge>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-4">{l.action}</td>
                      <td className="py-2">
                        <Diff before={l.before} after={l.after} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}