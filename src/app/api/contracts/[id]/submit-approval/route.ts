import { NextRequest, NextResponse } from "next/server";
import { submitForApproval } from "@/lib/services/approval-service";
import { personaOfRole, can } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 提交审批：锁定当前版本、创建商务+法务两位 Pending 审批。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  if (!can(role, "submitForApproval")) {
    return NextResponse.json({ error: `当前角色（${role}）无权提交审批` }, { status: 403 });
  }

  try {
    const view = await submitForApproval(params.id, personaOfRole(role));
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}