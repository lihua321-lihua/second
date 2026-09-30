import { NextResponse } from "next/server";
import { listContractLogs } from "@/lib/services/log-service";

export const dynamic = "force-dynamic";

/** 合同操作日志（含关联版本/审批/签署请求的审计记录）。 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const logs = await listContractLogs(params.id);
  return NextResponse.json(logs);
}