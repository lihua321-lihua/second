"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/contract/page-header";
import { toast } from "@/store/toast-store";
import { useRoleStore } from "@/store/role-store";
import type { ContractView } from "@/lib/services/contract-service";

export default function DraftPage({ params }: { params: { id: string } }) {
  const router = useRouter();
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

  async function generateVersion() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: {}, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "生成版本失败");
        return;
      }
      toast.success(`已生成 v${data.version}${data.pdfUrl ? " 并生成 PDF" : ""}`);
      load();
    } catch {
      toast.error("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function generatePdf() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "生成 PDF 失败");
        return;
      }
      toast.success("PDF 已生成");
      setView(data.view);
    } catch {
      toast.error("网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function submitApproval() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}/submit-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "提交审批失败");
        return;
      }
      toast.success("已提交审批，等待商务与法务审批");
      router.push(`/contracts/${params.id}/approval`);
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

  const hasVersion = view.version != null;
  const pdfUrl = view.pdfUrl;
  const canSubmit = view.status === "Draft" && view.hasPdf && !view.lockedAt && view.validation.valid;

  return (
    <div className="space-y-4">
      <PageHeader view={view} />

      <Card>
        <CardHeader>
          <CardTitle>合同草稿与 PDF 预览</CardTitle>
          <CardDescription>
            {hasVersion ? `当前版本 v${view.version}` : "尚未生成版本"} · 版本固化后不可变，任何修改生成新版本。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {!hasVersion && (
              <Button onClick={generateVersion} disabled={busy}>
                {busy ? "处理中…" : "生成 v1 并生成 PDF"}
              </Button>
            )}
            {hasVersion && !view.hasPdf && !pdfUrl && (
              <Button onClick={generatePdf} disabled={busy} variant="secondary">
                生成 PDF
              </Button>
            )}
            {hasVersion && (
              <Button onClick={submitApproval} disabled={!canSubmit || busy}>
                {busy ? "提交中…" : view.status === "PendingApproval" ? "已提交审批" : "提交审批"}
              </Button>
            )}
            {pdfUrl && (
              <Button asChild variant="outline">
                <a href={pdfUrl} download>
                  下载 PDF
                </a>
              </Button>
            )}
          </div>

          {pdfUrl ? (
            <iframe src={pdfUrl} title="合同 PDF 预览" className="h-[70vh] w-full rounded-md border" />
          ) : (
            <div className="rounded-md border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">
              {hasVersion ? "PDF 尚未生成，点击「生成 PDF」" : "尚未生成版本，点击「生成 v1 并生成 PDF」"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}