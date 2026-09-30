import { NextResponse } from "next/server";
import { listSignatureEvents } from "@/lib/services/signature-service";

export const dynamic = "force-dynamic";

/** 签署事件列表（供状态页展示）。 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const events = await listSignatureEvents(params.id);
  return NextResponse.json(
    events.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      envelopeId: e.envelopeId,
      payload: e.payload,
      processedAt: e.processedAt,
    })),
  );
}