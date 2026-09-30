"use client";

import { useRoleStore } from "@/store/role-store";
import { ROLE_LABEL } from "@/lib/status-meta";
import type { Role } from "@/types/domain";

export function RoleSwitcher() {
  const role = useRoleStore((s) => s.role);
  const setRole = useRoleStore((s) => s.setRole);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">角色</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="切换角色"
      >
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </div>
  );
}