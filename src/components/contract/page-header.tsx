"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/layout/status-badge";
import { VersionBadge } from "@/components/layout/version-badge";
import { Stepper } from "@/components/layout/stepper";
import { suggestNextSteps } from "@/lib/suggestions";
import { fieldLabel } from "@/lib/contracts/terms";
import type { ContractView } from "@/lib/services/contract-service";

export function PageHeader({ view }: { view: ContractView }) {
  const steps = suggestNextSteps(view);
  const missing = view.missingFields;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">
            {view.vendor.legalName || "未命名合同"}
          </h1>
          <StatusBadge status={view.status} />
          <VersionBadge version={view.version} />
          {view.lockedAt && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              已锁定
            </span>
          )}
        </div>
        <Stepper status={view.status} />
      </div>

      {missing.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-medium text-amber-800">缺失字段：</span>
          <span className="text-amber-700">
            {missing.map((m) => (m.core ? `${fieldLabel(m.key)}（核心）` : fieldLabel(m.key))).join("、")}
          </span>
        </div>
      )}

      {steps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span className="font-medium text-blue-800">建议下一步：</span>
          {steps.map((s, i) => (
            <span key={i} className="text-blue-700">
              {s.href ? (
                <Link href={s.href} className="underline hover:text-blue-900">
                  {s.label}
                </Link>
              ) : (
                s.label
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}