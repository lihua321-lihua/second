import { STEPS, stepIndexOf } from "@/lib/status-meta";
import { cn } from "@/lib/utils";

export function Stepper({ status }: { status: string }) {
  const active = stepIndexOf(status);

  return (
    <ol className="flex items-center gap-1 text-xs text-muted-foreground">
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <li key={label} className="flex items-center gap-1">
            {i > 0 && <span className="mx-1 text-border">→</span>}
            <span
              className={cn(
                "rounded px-1.5 py-0.5",
                current && "bg-primary text-primary-foreground font-medium",
                done && "text-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}