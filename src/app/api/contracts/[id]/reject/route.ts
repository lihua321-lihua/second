import { NextRequest, NextResponse } from "next/server";
import { rejectVersion, canActAs } from "@/lib/services/approval-service";
import { personaOfRole, can } from "@/lib/roles";
import type { ApprovalRole, Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 驳回审批：回退 Draft、解锁版本、保留驳回意见。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role; approvalRole?: ApprovalRole; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  const approvalRole: ApprovalRole = body.approvalRole ?? (role === "legal" ? "legal" : "biz");

  if (!can(role, "rejectVersion")) {
    return NextResponse.json({ error: `当前角色（${role}）无权驳回` }, { status: 403 });
  }
  if (!canActAs(role, approvalRole)) {
    return NextResponse.json(
      { error: `当前角色（${role}）不能以「${approvalRole === "biz" ? "商务" : "法务"}」身份驳回` },
      { status: 403 },
    );
  }

  try {
    const view = await rejectVersion(params.id, approvalRole, personaOfRole(role), body.comment ?? "");
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}