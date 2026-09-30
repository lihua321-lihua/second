import { prisma } from "@/lib/db";

/** 汇总合同及关联实体（版本/审批/签署请求）的全部审计日志。 */
export async function listContractLogs(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      versions: { select: { id: true } },
      signatureRequests: { select: { id: true } },
    },
  });
  if (!contract) return [];

  const versionIds = contract.versions.map((v) => v.id);
  const sigIds = contract.signatureRequests.map((s) => s.id);
  const approvals = await prisma.approval.findMany({
    where: { versionId: { in: versionIds } },
    select: { id: true },
  });

  const entityIds = [contract.id, ...versionIds, ...sigIds, ...approvals.map((a) => a.id)];

  const logs = await prisma.auditLog.findMany({
    where: { entityId: { in: entityIds } },
    orderBy: { timestamp: "asc" },
  });

  return logs.map((l) => ({
    id: l.id,
    timestamp: l.timestamp,
    actor: l.actor,
    actorType: l.actorType,
    source: l.source,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    before: l.before,
    after: l.after,
    correlationId: l.correlationId,
  }));
}