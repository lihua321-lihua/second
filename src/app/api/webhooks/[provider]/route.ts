import { NextRequest, NextResponse } from "next/server";
import { applySignatureEvent } from "@/lib/services/signature-service";

export const dynamic = "force-dynamic";

/**
 * 电子签 Webhook（Mock 与真实提供方均走此入口）：
 * - 先 await req.text()
 * - 验证签名（Mock 跳过；真实提供方可在此校验 HMAC）
 * - 幂等：provider + eventId 唯一，重复事件返回 200
 * - 状态只向前（Forward-only）
 */
export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  // 1) 先读取原始文本（后续用于验签）
  const raw = await req.text();

  let body: { eventId?: string; envelopeId?: string; eventType?: string; status?: string; data?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const { eventId, envelopeId, eventType, status, data } = body;
  if (!eventId || !envelopeId || !status) {
    return NextResponse.json({ error: "缺少 eventId / envelopeId / status" }, { status: 400 });
  }

  // 2) 验签（Mock 跳过；真实提供方在此实现）
  // const signature = req.headers.get("x-signature"); ...

  // 3) 幂等 + 只向前应用
  const result = await applySignatureEvent(
    {
      eventId,
      envelopeId,
      eventType: eventType ?? "webhook.event",
      status,
      at: new Date(),
      data: (data ?? {}) as Record<string, unknown>,
    },
    { source: "webhook", actor: "webhook" },
  );

  // 4) 无论重复与否，均返回 200（ack）
  return NextResponse.json(
    { ok: true, duplicated: result.duplicated, applied: result.changed, missing: result.missing },
    { status: 200 },
  );
}