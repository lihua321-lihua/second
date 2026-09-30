import { NextRequest, NextResponse } from "next/server";
import { archiveContract } from "@/lib/services/archive-service";
import { personaOfRole, can } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 归档已签署合同：生成签署 PDF + 证明，记录归档时间/操作人。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  if (!can(role, "archiveContract")) {
    return NextResponse.json({ error: `当前角色（${role}）无权归档` }, { status: 403 });
  }

  try {
    const view = await archiveContract(params.id, personaOfRole(role));
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}