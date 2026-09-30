// 电子签提供方抽象接口（规则：所有电子签实现都必须实现此接口，业务层只依赖接口）
// Mock 实现见 ./mock-provider.ts

export type SignerRole = "vendor" | "internal";

export interface SignerInfo {
  name: string;
  email: string;
  role: SignerRole;
}

export interface SendEnvelopeInput {
  contractId: string;
  versionId: string;
  signers: SignerInfo[];
  /** 自动模式：发起后到阈值时间即视为双方签署完成 */
  autoComplete: boolean;
}

export interface EnvelopeResult {
  providerEnvelopeId: string;
  status: "Sent";
  sentAt: Date;
}

/** 签署事件（Webhook 推送或同步拉取，均映射为此结构）。 */
export interface SignatureEvent {
  eventId: string;
  envelopeId: string;
  eventType: string; // envelope.sent / signer.signed / signature.completed / ...
  status: string; // 目标签署状态 Sent/PartiallySigned/Completed/...
  at: Date;
  data?: Record<string, unknown>;
}

export interface TimelineInput {
  envelopeId: string;
  sentAt: Date;
  autoComplete: boolean;
  /** 手动模式：立即推进到完成（忽略时间阈值） */
  forceComplete: boolean;
  now?: Date;
}

export interface ESignProvider {
  readonly name: string;
  sendEnvelope(input: SendEnvelopeInput): EnvelopeResult | Promise<EnvelopeResult>;
  /** 计算该信封在当前时间点应产生的事件时间轴（无状态、确定性、幂等）。 */
  timeline(input: TimelineInput): SignatureEvent[];
  /** 供应商签署人默认信息（服务端自动带出，前端可编辑）。 */
  vendorSigner(): SignerInfo;
}