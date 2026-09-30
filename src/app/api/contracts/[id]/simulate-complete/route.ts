import { NextRequest, NextResponse } from "next/server";
import { simulateCompletion } from "@/lib/services/signature-service";
import { personaOfRole, can } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 手动模式：模拟双方签署完成并同步。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  if (!can(role, "sendForSignature")) {
    return NextResponse.json({ error: `当前角色（${role}）无权操作签署` }, { status: 403 });
  }

  try {
    const result = await simulateCompletion(params.id, personaOfRole(role));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}