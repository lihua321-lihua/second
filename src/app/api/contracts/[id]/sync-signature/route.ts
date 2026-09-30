import { NextRequest, NextResponse } from "next/server";
import { syncSignatureStatus } from "@/lib/services/signature-service";
import { personaOfRole, can } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 同步签署状态：拉取提供方事件并幂等应用。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  if (!can(role, "syncSignatureStatus")) {
    return NextResponse.json({ error: `当前角色（${role}）无权同步签署状态` }, { status: 403 });
  }

  try {
    const result = await syncSignatureStatus(params.id, personaOfRole(role));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}