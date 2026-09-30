"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/contract/page-header";
import { toast } from "@/store/toast-store";
import { useRoleStore } from "@/store/role-store";
import type { ContractView } from "@/lib/services/contract-service";
import type { ApprovalRole } from "@/types/domain";

const ROLE_META: { role: ApprovalRole; label: string; email: string }[] = [
  { role: "biz", label: "商务审批", email: "bob@ourco.example" },
  { role: "legal", label: "法务审批", email: "carol@ourco.example" },
];

function approvalStatusBadge(status: string) {
  if (status === "Approved") return <Badge variant="success">已通过</Badge>;
  if (status === "Rejected") return <Badge variant="destructive">已驳回</Badge>;
  return <Badge variant="warning">待审批</Badge>;
}

export default function ApprovalPage({ params }: { params: { id: string } }) {
  const role = useRoleStore((s) => s.role);
  const [view, setView] = useState<ContractView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ApprovalRole | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalRole | null>(null);
  const [comment, setComment] = useState("");

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

  function roleCanAct(approvalRole: ApprovalRole): boolean {
    if (role === "admin") return true;
    if (role === "biz") return approvalRole === "biz";
    if (role === "legal") return approvalRole === "legal";
    return false;
  }

  async function onApprove(approvalRole: ApprovalRole) {
    setBusy(approvalRole);
    try {
      const res = await fetch(`/api/contracts/${params.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, approvalRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "审批失败");
        return;
      }
      toast.success(data.status === "ReadyToSign" ? "两位审批人均已通过，进入待签署" : "已通过，等待另一位审批人");
      setView(data);
      setRejecting(null);
    } catch {
      toast.error("网络错误");
    } finally {
      setBusy(null);
    }
  }

  async function onReject(approvalRole: ApprovalRole) {
    if (!comment.trim()) {
      toast.error("请填写驳回意见");
      return;
    }
    setBusy(approvalRole);
    try {
      const res = await fetch(`/api/contracts/${params.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, approvalRole, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "驳回失败");
        return;
      }
      toast.success("已驳回，合同回退草稿");
      setView(data);
      setRejecting(null);
      setComment("");
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

  const isPending = view.status === "PendingApproval";
  const approvals = view.approvals;
  const byRole: Record<string, { status: string; comment: string | null; approverId: string | null; approvedAt: Date | null } | undefined> = {};
  for (const a of approvals) byRole[a.role] = a;

  return (
    <div className="space-y-4">
      <PageHeader view={view} />

      {!isPending ? (
        <div className="rounded-md border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
          尚未提交审批。请先在「合同草稿」页生成版本与 PDF 后提交审批。
        </div>
      ) : (
        <>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            当前版本 v{view.version} 已锁定，不可编辑；两位审批人均通过后进入「待签署」。
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {ROLE_META.map(({ role: ar, label, email }) => {
              const rec = byRole[ar];
              const status = rec?.status ?? "Pending";
              const canAct = roleCanAct(ar);
              const isRejecting = rejecting === ar;
              const isApproved = status === "Approved";
              return (
                <Card key={ar}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{label}</CardTitle>
                      {approvalStatusBadge(status)}
                    </div>
                    <CardDescription>
                      审批人：{rec?.approverId ?? email}
                      {rec?.approvedAt ? ` · 通过时间 ${new Date(rec.approvedAt).toLocaleString("zh-CN")}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {status === "Rejected" && rec?.comment && (
                      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <span className="font-medium">驳回意见：</span>
                        {rec.comment}
                      </div>
                    )}

                    {!canAct && (
                      <p className="text-xs text-muted-foreground">
                        当前角色无权执行此审批（需切换为 {ar === "biz" ? "商务" : "法务"} 或管理员）。
                      </p>
                    )}

                    {isRejecting ? (
                      <div className="space-y-2">
                        <Textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="填写驳回意见（将保留并回退草稿）"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => onReject(ar)}
                            disabled={busy === ar}
                          >
                            {busy === ar ? "提交中…" : "确认驳回"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setRejecting(null)}>
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => onApprove(ar)} disabled={!canAct || busy !== null || isApproved}>
                          {isApproved ? "已通过" : "通过"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setRejecting(ar)}
                          disabled={!canAct || busy !== null}
                        >
                          驳回
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}