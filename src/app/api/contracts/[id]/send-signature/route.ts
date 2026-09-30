import { NextRequest, NextResponse } from "next/server";
import { sendForSignature } from "@/lib/services/signature-service";
import { personaOfRole, can } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 发起电子签（签署前二次确认由前端完成）。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role; vendorSigner?: { name?: string; email?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  if (!can(role, "sendForSignature")) {
    return NextResponse.json({ error: `当前角色（${role}）无权发起签署` }, { status: 403 });
  }

  try {
    const view = await sendForSignature(
      params.id,
      { name: body.vendorSigner?.name ?? "", email: body.vendorSigner?.email ?? "" },
      personaOfRole(role),
    );
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}