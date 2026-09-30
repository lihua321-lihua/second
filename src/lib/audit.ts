import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ActorType } from "@/types/domain";

export interface AuditInput {
  actor: string;
  actorType: ActorType;
  source: ActorType;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
}

export type Tx = Prisma.TransactionClient;

function data(input: AuditInput) {
  return {
    actor: input.actor,
    actorType: input.actorType,
    source: input.source,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    before: input.before === undefined ? null : safeJson(input.before),
    after: input.after === undefined ? null : safeJson(input.after),
    correlationId: input.correlationId ?? null,
  };
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** 统一写审计日志，before/after 支持对象（序列化为 JSON）。 */
export async function writeAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({ data: data(input) });
}

/** 在已有事务中写审计日志（供 service 内多步操作原子落库）。 */
export async function writeAuditTx(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditLog.create({ data: data(input) });
}