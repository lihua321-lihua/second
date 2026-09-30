"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/layout/status-badge";
import { VersionBadge } from "@/components/layout/version-badge";

interface ContractRow {
  id: string;
  status: string;
  version: number | null;
  vendorName: string;
  vendorEmail: string;
}

export default function ContractListPage() {
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/contracts")
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError("加载合同列表失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">合同列表</h1>
        <Button asChild variant="outline">
          <Link href="/vendors/apply">新建供应商申请</Link>
        </Button>
      </div>

      {error && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          暂无合同。点击「新建供应商申请」开始。
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">供应商</th>
                  <th className="px-4 py-2 font-medium">状态</th>
                  <th className="px-4 py-2 font-medium">版本</th>
                  <th className="px-4 py-2 font-medium">签署邮箱</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2">{c.vendorName}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2">
                      <VersionBadge version={c.version} />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.vendorEmail}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/contracts/${c.id}/terms`} className="text-sm text-primary hover:underline">
                        查看 / 编辑 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}