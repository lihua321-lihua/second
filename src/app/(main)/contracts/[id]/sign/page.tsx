"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/contract/page-header";
import { toast } from "@/store/toast-store";
import { useRoleStore } from "@/store/role-store";
import type { ContractView } from "@/lib/services/contract-service";

export default function SignPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const role = useRoleStore((s) => s.role);
  const [view, setView] = useState<ContractView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function load() {
    fetch(`/api/contracts/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setView(d);
        setName(d.vendor.signerName ?? "");
        setEmail(d.vendor.email ?? "");
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function doSend() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}/send-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, vendorSigner: { name, email } }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "发起签署失败");
        return;
      }
      toast.success("已发起电子签（模拟），3 秒后自动完成");
      setConfirmOpen(false);
      router.push(`/contracts/${params.id}/status`);
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

  const ready = view.status === "ReadyToSign";

  return (
    <div className="space-y-4">
      <PageHeader view={view} />

      {!ready ? (
        <div className="rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          当前状态（{view.status}）不可发起签署。需先完成商务 + 法务双审批（进入「待签署」）。
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>发起电子签（模拟）</CardTitle>
              <CardDescription>
                签署服务：MockProvider · 自动模式（发起后 3 秒模拟双方签署完成）。供应商签署人默认带出，可编辑。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>供应商签署人姓名</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>供应商签署人邮箱</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">我方签署人：</span>
                <span>Kevin Li / kevin@ourco.example（固定，不可编辑）</span>
              </div>

              <p className="text-xs text-muted-foreground">
                发起前将二次确认；校验：当前版本 + 双审批通过 + PDF 已生成。
              </p>

              <Button onClick={() => setConfirmOpen(true)} disabled={busy}>
                {busy ? "处理中…" : "发起电子签"}
              </Button>
            </CardContent>
          </Card>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认发起电子签？</AlertDialogTitle>
                <AlertDialogDescription>
                  将向以下签署人发起签署：<br />
                  供应商：{name} / {email}<br />
                  我方：Kevin Li / kevin@ourco.example
                  <br />发起后合同进入「已发出签署」，模拟 3 秒后自动完成。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={doSend} disabled={busy}>
                  确认发起
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}