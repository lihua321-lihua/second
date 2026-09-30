"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/types/domain";

interface RoleState {
  role: Role;
  setRole: (role: Role) => void;
}

// 前端模拟权限：角色切换器状态。真实鉴权在服务端 AI 工具层强制校验。
export const useRoleStore = create<RoleState>()(
  persist(
    (set) => ({
      role: "admin",
      setRole: (role) => set({ role }),
    }),
    { name: "contract-workbench-role" },
  ),
);