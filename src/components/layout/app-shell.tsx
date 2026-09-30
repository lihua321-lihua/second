"use client";

import Link from "next/link";
import { Breadcrumb } from "./breadcrumb";
import { RoleSwitcher } from "./role-switcher";
import { AIDock } from "@/components/ai-dock/ai-dock";
import { Toaster } from "@/components/ui/toaster";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col pb-28">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <div className="flex flex-1 items-center">
            <Breadcrumb />
          </div>
          <Link
            href="/docs"
            className="shrink-0 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            产品说明
          </Link>
          <div className="flex flex-1 items-center justify-end">
            <RoleSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <AIDock />
      <Toaster />
    </div>
  );
}