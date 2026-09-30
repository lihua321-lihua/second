import { describe, it, expect } from "vitest";
import {
  canSubmitForApproval,
  canSendForSignature,
  hasBothApprovals,
  isSigningInfoComplete,
} from "../rules";
import type { ContractStateView } from "../../../types/domain";

const fullTerms = {
  product: "Acme API Gateway",
  scope: "非独家分销",
  territory: "APAC",
  pricingModel: "收入分成",
  currency: "USD",
  revenueBasis: "净收入",
  revenueShare: "15%",
  settlementCycle: "月结30天",
  refund: "按未使用比例扣减",
};

const fullVendor = {
  legalName: "Acme Cloud Pte. Ltd.",
  country: "Singapore",
  address: "1 Raffles Place",
  product: "Acme API Gateway 分销",
  signerName: "Alice Tan",
  title: "CFO",
  email: "alice@acme.example",
};

function state(overrides: Partial<ContractStateView>): ContractStateView {
  return {
    status: "Draft",
    currentVersionId: "v1",
    terms: fullTerms,
    vendor: fullVendor,
    hasPdf: false,
    approvals: [],
    signatureRequest: null,
    ...overrides,
  };
}

describe("canSubmitForApproval", () => {
  it("有效 Draft 可提交", () => {
    expect(canSubmitForApproval(state({}))).toBe(true);
  });

  it("缺分成比例（非核心必填）时不可提交", () => {
    expect(
      canSubmitForApproval(state({ terms: { ...fullTerms, revenueShare: "" } })),
    ).toBe(false);
  });

  it("非 Draft 状态不可提交", () => {
    expect(canSubmitForApproval(state({ status: "PendingApproval" }))).toBe(false);
  });
});

describe("canSendForSignature", () => {
  const approved = [
    { role: "biz" as const, status: "Approved" as const },
    { role: "legal" as const, status: "Approved" as const },
  ];

  it("ReadyToSign + 双通过 + PDF + 签署信息完整 → 可发起", () => {
    expect(
      canSendForSignature(
        state({ status: "ReadyToSign", approvals: approved, hasPdf: true }),
      ),
    ).toBe(true);
  });

  it("缺少法务通过 → 不可发起", () => {
    expect(
      canSendForSignature(
        state({
          status: "ReadyToSign",
          approvals: [{ role: "biz", status: "Approved" }],
          hasPdf: true,
        }),
      ),
    ).toBe(false);
  });

  it("PDF 未生成 → 不可发起", () => {
    expect(
      canSendForSignature(state({ status: "ReadyToSign", approvals: approved })),
    ).toBe(false);
  });

  it("签署请求版本与当前版本不一致 → 不可发起", () => {
    expect(
      canSendForSignature(
        state({
          status: "ReadyToSign",
          approvals: approved,
          hasPdf: true,
          signatureRequest: {
            versionId: "v0",
            status: "Draft",
            signersComplete: false,
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("审批辅助", () => {
  it("hasBothApprovals 仅商务+法务都通过为真", () => {
    expect(hasBothApprovals([])).toBe(false);
    expect(
      hasBothApprovals([
        { role: "biz", status: "Approved" },
        { role: "legal", status: "Approved" },
      ]),
    ).toBe(true);
    expect(
      hasBothApprovals([
        { role: "biz", status: "Approved" },
        { role: "legal", status: "Pending" },
      ]),
    ).toBe(false);
  });

  it("签署信息完整性校验", () => {
    expect(isSigningInfoComplete(fullVendor)).toBe(true);
    expect(isSigningInfoComplete({ ...fullVendor, email: "" })).toBe(false);
    expect(isSigningInfoComplete(null)).toBe(false);
  });
});