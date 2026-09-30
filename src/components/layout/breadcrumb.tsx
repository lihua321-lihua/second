"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGE_LABEL: Record<string, string> = {
  apply: "供应商申请",
  terms: "商业条款",
  draft: "合同草稿",
  approval: "内部审批",
  sign: "签署发起",
  status: "签署状态",
  archive: "归档",
  logs: "操作日志",
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs: { label: string; href?: string }[] = [{ label: "合同列表", href: "/" }];

  if (segments[0] === "docs") {
    crumbs.push({ label: "产品说明" });
  } else if (segments[0] === "vendors" && segments[1] === "apply") {
    crumbs.push({ label: "供应商申请" });
  } else if (segments[0] === "contracts" && segments.length >= 2) {
    const id = segments[1];
    crumbs.push({ label: `合同 ${id.slice(0, 6)}` });
    const page = segments[2];
    if (page && PAGE_LABEL[page]) crumbs.push({ label: PAGE_LABEL[page] });
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-border">/</span>}
          {c.href ? (
            <Link href={c.href} className="hover:text-foreground hover:underline">
              {c.label}
            </Link>
          ) : (
            <span className="text-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}