"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/contract/page-header";
import { TERMS_FIELDS } from "@/lib/contracts/terms";
import { toast } from "@/store/toast-store";
import { useRoleStore } from "@/store/role-store";
import type { ContractView } from "@/lib/services/contract-service";

export default function TermsPage({ params }: { params: { id: string } }) {
  const role = useRoleStore((s) => s.role);
  const [view, setView] = useState<ContractView | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/contracts/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setView(data);
          const init: Record<string, string> = {};
          for (const f of TERMS_FIELDS) init[f.key] = (data.terms as Record<string, string>)[f.key] ?? "";
          setForm(init);
        }
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function onSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/contracts/${params.id}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: form, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "保存失败");
        return;
      }
      toast.success("草稿已保存");
      setView(data);
      const init: Record<string, string> = {};
      for (const f of TERMS_FIELDS) init[f.key] = (data.terms as Record<string, string>)[f.key] ?? "";
      setForm(init);
    } catch {
      toast.error("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>;
  if (error || !view) {
    return <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error ?? "合同不存在"}</div>;
  }

  const editable = ["Draft", "NeedsInformation", "Blocked"].includes(view.status) && !view.lockedAt;

  return (
    <div className="space-y-4">
      <PageHeader view={view} />

      {!editable && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {view.lockedAt ? "当前版本已锁定，不可编辑" : `当前状态（${view.status}）不可编辑商业条款`}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>商业条款</CardTitle>
          <CardDescription>带 * 的为关键条款，修改需二次确认。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TERMS_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key}>
                  {f.label}
                  {f.critical && <span className="text-amber-600"> *</span>}
                </Label>
                <Input
                  id={f.key}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  disabled={!editable}
                  className={!form[f.key] && editable ? "border-amber-400" : undefined}
                  placeholder={f.label}
                />
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={onSave} disabled={!editable || saving}>
              {saving ? "保存中…" : "保存草稿"}
            </Button>
            <span className="text-xs text-muted-foreground">保存草稿不生成正式版本；生成版本与提交审批在「合同草稿」页。</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}