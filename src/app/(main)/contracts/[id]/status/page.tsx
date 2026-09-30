"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/contract/page-header";
import { toast } from "@/store/toast-store";
import { useRoleStore } from "@/store/role-store";
import { signatureStatusLabel } from "@/lib/status-meta";
import type { ContractView } from "@/lib/services/contract-service";

interface EventRow {
  eventId: string;
  eventType: string;
  envelopeId: string;
  processedAt: string;
}

export default function StatusPage({ params }: { params: { id: string } }) {
  const role = useRoleStore((s) => s.role);
  const [view, setView] = useState<ContractView | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sync" | "simulate" | null>(null);

  function load() {
    fetch(`/api/contracts/${params.id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setView(d)))
      .catch(() => setError("加载失败"));
    fetch(`/api/contracts/${params.id}/signature-events`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setEvents(d) : setEvents([])))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function run(action: "sync" | "simulate") {
    setBusy(action);
    try {
      const res = await fetch(`/api/contracts/${params.id}/${action === "sync" ? "sync-signature" : "simulate-complete"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "操作失败");
        return;
      }
      if (action === "sync") {
        toast.success(data.applied > 0 ? `已同步，应用 ${data.applied} 条事件` : "无新事件，已是最新状态");
      } else {
        toast.success("已模拟双方签署完成");
      }
      load();
    } catch {
      toast.error("网络错误");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error || !view) {
    return <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? "合同不存在"}</div>;
  }

  const sr = view.signatureRequest;
  const isCompleted = sr?.status === "Completed";

  return (
    <div className="space-y-4">
      <PageHeader view={view} />

      {!sr ? (
        <div className="rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          尚未发起签署。请先在「签署发起」页发起电子签。
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>签署状态</CardTitle>
                <Badge
                  variant={
                    sr.status === "Completed" ? "success" : sr.status === "Failed" ? "destructive" : "info"
                  }
                >
                  {signatureStatusLabel(sr.status)}
                </Badge>
              </div>
              <CardDescription>信封 ID：{sr.providerEnvelopeId ?? "—"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="mb-1 text-sm font-medium">签署人</div>
                <ul className="space-y-1 text-sm">
                  {sr.signers.map((s, i) => (
                    <li key={i}>
                      <span className="text-muted-foreground">{s.role === "vendor" ? "供应商" : "我方"}</span>{" "}
                      {s.name} / {s.email}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => run("sync")} disabled={busy !== null}>
                  {busy === "sync" ? "同步中…" : "同步签署状态"}
                </Button>
                {!isCompleted && (
                  <Button onClick={() => run("simulate")} disabled={busy !== null}>
                    {busy === "simulate" ? "处理中…" : "模拟签署完成"}
                  </Button>
                )}
                {isCompleted && (
                  <Button asChild>
                    <Link href={`/contracts/${params.id}/archive`}>去归档</Link>
                  </Button>
                )}
              </div>

              {isCompleted && (
                <p className="text-xs text-muted-foreground">
                  签署已完成，可前往「归档」下载已签署 PDF 与证明。
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>事件列表</CardTitle>
              <CardDescription>签署过程事件（按时间升序）。</CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">暂无事件</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2">时间</th>
                      <th className="py-2">事件类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.eventId} className="border-b">
                        <td className="py-2">{new Date(e.processedAt).toLocaleString("zh-CN")}</td>
                        <td className="py-2">{e.eventType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}