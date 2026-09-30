import { NextRequest, NextResponse } from "next/server";
import { createNewVersionWithPatch } from "@/lib/services/contract-service";
import { personaOfRole } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 创建新版本（应用 patch，不可变），用于「生成版本」按钮与 AI 工具。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { patch?: Record<string, unknown>; role?: Role; source?: "ai" | "user" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const role: Role = body.role ?? "admin";
  const source = body.source ?? "user";

  try {
    const result = await createNewVersionWithPatch(
      params.id,
      (body.patch ?? {}) as never,
      source,
      personaOfRole(role),
    );
    return NextResponse.json({
      version: result.newVersion.version,
      versionId: result.newVersion.id,
      diff: result.diff,
      pdfUrl: result.pdfUrl,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}