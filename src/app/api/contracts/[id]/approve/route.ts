import { NextRequest, NextResponse } from "next/server";
import { approveVersion, canActAs } from "@/lib/services/approval-service";
import { personaOfRole, can } from "@/lib/roles";
import type { ApprovalRole, Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 通过审批：role 为交互角色，approvalRole 为被审批的审批角色（商务/法务）。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role; approvalRole?: ApprovalRole };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  const approvalRole: ApprovalRole = body.approvalRole ?? (role === "legal" ? "legal" : "biz");

  if (!can(role, "approveVersion")) {
    return NextResponse.json({ error: `当前角色（${role}）无权审批` }, { status: 403 });
  }
  if (!canActAs(role, approvalRole)) {
    return NextResponse.json(
      { error: `当前角色（${role}）不能以「${approvalRole === "biz" ? "商务" : "法务"}」身份审批` },
      { status: 403 },
    );
  }

  try {
    const view = await approveVersion(params.id, approvalRole, personaOfRole(role));
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}