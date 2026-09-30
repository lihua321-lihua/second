"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/store/toast-store";

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "legalName", label: "公司法定名称", required: true },
  { key: "country", label: "注册地" },
  { key: "address", label: "注册地址" },
  { key: "product", label: "产品 / 服务" },
  { key: "signerName", label: "签字人姓名", required: true },
  { key: "title", label: "签字人职务" },
  { key: "email", label: "签字人邮箱（签署邮箱）", required: true },
];

export default function VendorApplyPage() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({
    legalName: "",
    country: "",
    address: "",
    product: "",
    signerName: "",
    title: "",
    email: "",
  });
  const [submitting, setSubmitting] = useState(false);

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "提交失败");
        return;
      }
      toast.success("供应商申请已创建，进入商业条款填写");
      router.push(`/contracts/${data.contract.id}/terms`);
    } catch {
      toast.error("网络错误，提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">供应商申请</h1>
        <p className="text-sm text-muted-foreground">填写供应商基本信息，提交后进入商业条款填写。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>签约主体与签字人信息将用于合同关键生效要件校验。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={f.key}>
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </Label>
                <Input
                  id={f.key}
                  value={form[f.key]}
                  onChange={(e) => update(f.key, e.target.value)}
                  required={f.required}
                />
              </div>
            ))}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "提交中…" : "提交申请"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}