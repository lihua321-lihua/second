"use client";

import { useToastStore } from "@/store/toast-store";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  return (
    <div className="pointer-events-none fixed bottom-28 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={cn(
            "pointer-events-auto cursor-pointer rounded-md border px-3 py-2 text-sm text-white shadow-lg",
            t.type === "success" && "bg-emerald-600",
            t.type === "error" && "bg-red-600",
            t.type === "info" && "bg-blue-600",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}