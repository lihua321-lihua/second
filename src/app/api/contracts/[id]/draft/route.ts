import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { termsSchema } from "@/lib/contracts/terms";
import { recomputeContractStatus, loadContractView } from "@/lib/services/contract-service";
import { writeAudit } from "@/lib/audit";
import { personaOfRole } from "@/lib/roles";
import type { Role } from "@/types/domain";

export const dynamic = "force-dynamic";

/** 保存草稿：Draft/NeedsInformation/Blocked 状态下的可变条款缓冲，不生成正式版本。 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const contract = await prisma.contract.findUnique({
    where: { id: params.id },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }

  const locked = contract.versions[0]?.lockedAt;
  if (locked || !["Draft", "NeedsInformation", "Blocked"].includes(contract.status)) {
    return NextResponse.json(
      { error: `当前状态（${contract.status}）不可编辑；${locked ? "版本已锁定" : "仅 Draft/待补充/已阻断 状态可保存草稿"}` },
      { status: 409 },
    );
  }

  let body: { terms?: unknown; role?: Role };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const parsed = termsSchema.safeParse(body.terms ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "条款校验失败", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const before = contract.draftTermsJson;
  const after = JSON.stringify(parsed.data);

  await prisma.contract.update({
    where: { id: params.id },
    data: { draftTermsJson: after },
  });

  await recomputeContractStatus(params.id);
  await writeAudit({
    actor: personaOfRole(body.role ?? "admin"),
    actorType: "user",
    source: "user",
    action: "save_draft",
    entity: "Contract",
    entityId: params.id,
    before: before ? JSON.parse(before) : null,
    after: parsed.data,
  });

  const view = await loadContractView(params.id);
  return NextResponse.json(view);
}