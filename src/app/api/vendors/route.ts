import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { vendorInfoSchema } from "@/lib/contracts/terms";
import { writeAudit } from "@/lib/audit";
import { INITIAL_STATUS } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  const vendors = await prisma.vendor.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(vendors);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const parsed = vendorInfoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "字段校验失败", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // 创建供应商 + 初始合同（统一初始化状态：草稿）
  const created = await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.create({
      data: { ...data, status: INITIAL_STATUS },
    });
    const contract = await tx.contract.create({
      data: {
        vendorId: vendor.id,
        type: "distribution",
        status: INITIAL_STATUS,
      },
    });
    return { vendor, contract };
  });

  await writeAudit({
    actor: "supplier",
    actorType: "user",
    source: "user",
    action: "vendor_apply",
    entity: "Vendor",
    entityId: created.vendor.id,
    after: data,
  });

  return NextResponse.json(created, { status: 201 });
}