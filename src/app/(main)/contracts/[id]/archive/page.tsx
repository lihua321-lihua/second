"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/contract/page-header";
import { toast } from "@/store/toast-store";
import { useRoleStore } from "@/store/role-store";
import type { ContractView } from "@/lib/services/contract-service";

export default function ArchivePage({ params }: { params: { id: string } }) {
  const role = useRoleStore((s) => s.role);
  const [view, setView] = useState<ContractView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(`/api/contracts/${params.id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setView(d)))
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function doArchive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "归档失败");
        return;
      }
      toast.success("已归档");
      setView(data);
    } catch {
      toast.error("网络错误");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error || !view) {
    return <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? "合同不存在"}</div>;
  }

  const sr = view.signatureRequest;
  const isArchived = view.status === "Archived";
  const canArchive = view.status === "Completed";

  return (
    <div className="space-y-4">
      <PageHeader view={view} />

      {!sr || !["Completed", "Archived"].includes(view.status) ? (
        <div className="rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          当前状态（{view.status}）不可归档。需先完成签署。
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>合同归档</CardTitle>
            <CardDescription>
              已签署合同 PDF 与签署完成证明；归档后将标记为终态「已归档」。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isArchived && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                已归档 · 归档时间 {view.archivedAt ? new Date(view.archivedAt).toLocaleString("zh-CN") : "—"} · 操作人 {view.archivedBy ?? "—"}
              </div>
            )}

            {canArchive && (
              <div className="flex items-center gap-3">
                <Button onClick={doArchive} disabled={busy}>
                  {busy ? "归档中…" : "归档"}
                </Button>
                <span className="text-xs text-muted-foreground">归档后下载已签署 PDF 与证明</span>
              </div>
            )}

            {isArchived && (
              <div className="flex flex-wrap gap-2">
                {sr.signedPdfUrl && (
                  <Button asChild variant="outline">
                    <a href={sr.signedPdfUrl} download>
                      下载已签署 PDF
                    </a>
                  </Button>
                )}
                {sr.certificateUrl && (
                  <Button asChild variant="outline">
                    <a href={sr.certificateUrl} download>
                      下载签署完成证明
                    </a>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}