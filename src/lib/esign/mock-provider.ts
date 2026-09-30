import type {
  ESignProvider,
  EnvelopeResult,
  SendEnvelopeInput,
  SignatureEvent,
  SignerInfo,
  TimelineInput,
} from "./provider";

/** 自动模式：发起后多久视为双方签署完成（演示用阈值）。 */
export const MOCK_AUTO_COMPLETE_MS = 3000;

/**
 * MockProvider：无状态、确定性电子签（演示用）。
 * - 自动模式：发起 sentAt 起超过 MOCK_AUTO_COMPLETE_MS 后，timeline() 产出「部分签署 → 签署完成」事件。
 * - 手动模式：forceComplete=true 时立即产出完成事件（忽略时间阈值）。
 * 事件 eventId 由 envelopeId + 阶段确定，天然幂等（配合 provider+eventId 唯一约束去重）。
 */
class MockProvider implements ESignProvider {
  readonly name = "mock";

  vendorSigner(): SignerInfo {
    return { name: "Alice Tan", email: "alice@acme.example", role: "vendor" };
  }

  sendEnvelope(input: SendEnvelopeInput): EnvelopeResult {
    return {
      providerEnvelopeId: `mock-env-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      status: "Sent",
      sentAt: new Date(),
    };
  }

  timeline({ envelopeId, sentAt, autoComplete, forceComplete, now = new Date() }: TimelineInput): SignatureEvent[] {
    const events: SignatureEvent[] = [
      {
        eventId: `${envelopeId}:sent`,
        envelopeId,
        eventType: "envelope.sent",
        status: "Sent",
        at: sentAt,
      },
    ];

    const shouldComplete =
      forceComplete || (autoComplete && now.getTime() - sentAt.getTime() >= MOCK_AUTO_COMPLETE_MS);

    if (shouldComplete) {
      events.push({
        eventId: `${envelopeId}:partial`,
        envelopeId,
        eventType: "signer.signed",
        status: "PartiallySigned",
        at: new Date(sentAt.getTime() + MOCK_AUTO_COMPLETE_MS / 2),
      });
      events.push({
        eventId: `${envelopeId}:completed`,
        envelopeId,
        eventType: "signature.completed",
        status: "Completed",
        at: new Date(sentAt.getTime() + MOCK_AUTO_COMPLETE_MS),
        data: { signedPdfUrl: null, certificateUrl: null },
      });
    }

    return events;
  }
}

/** 单例实例。 */
export const mockProvider = new MockProvider();