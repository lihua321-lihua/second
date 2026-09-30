import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const contracts = await prisma.contract.findMany({
    include: {
      vendor: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    contracts.map((c) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      currentVersionId: c.currentVersionId,
      version: c.versions[0]?.version ?? null,
      vendorName: c.vendor.legalName,
      vendorEmail: c.vendor.email,
    })),
  );
}