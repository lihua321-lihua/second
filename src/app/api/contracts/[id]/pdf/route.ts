import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateAndStorePdf } from "@/lib/pdf/generate";
import { loadContractView } from "@/lib/services/contract-service";
import { writeAudit } from "@/lib/audit";
import { personaOfRole } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 为当前版本生成/重新生成 PDF。 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { role?: Role };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const contract = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!contract?.currentVersionId) {
    return NextResponse.json({ error: "当前无版本可生成 PDF，请先生成版本" }, { status: 409 });
  }

  try {
    const pdfUrl = await generateAndStorePdf(params.id, contract.currentVersionId);
    await writeAudit({
      actor: personaOfRole(body.role ?? "admin"),
      actorType: "user",
      source: "user",
      action: "generate_pdf",
      entity: "ContractVersion",
      entityId: contract.currentVersionId,
      after: { pdfUrl },
    });
    const view = await loadContractView(params.id);
    return NextResponse.json({ pdfUrl, view });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}