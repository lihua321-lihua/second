import { describe, it, expect } from "vitest";
import { validateFields, termsSchema } from "../terms";

const fullVendor = {
  legalName: "Acme Cloud Pte. Ltd.",
  country: "Singapore",
  address: "1 Raffles Place",
  product: "Acme API Gateway 分销",
  signerName: "Alice Tan",
  title: "CFO",
  email: "alice@acme.example",
};

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

describe("字段完整性校验", () => {
  it("全填写 → Draft（有效）", () => {
    const r = validateFields(fullVendor, fullTerms);
    expect(r.valid).toBe(true);
    expect(r.hint).toBe("Draft");
  });

  it("缺分成比例 → NeedsInformation（演示流程）", () => {
    const r = validateFields(fullVendor, { ...fullTerms, revenueShare: "" });
    expect(r.valid).toBe(false);
    expect(r.hint).toBe("NeedsInformation");
    expect(r.missingRequired).toContain("revenueShare");
  });

  it("缺签约主体/签署邮箱 → Blocked（核心生效要件）", () => {
    const r = validateFields({ ...fullVendor, legalName: "", email: "" }, fullTerms);
    expect(r.hint).toBe("Blocked");
    expect(r.missingCore).toEqual(expect.arrayContaining(["legalName", "email"]));
  });

  it("核心缺失优先于非核心缺失（Blocked 优先）", () => {
    const r = validateFields(
      { ...fullVendor, email: "" },
      { ...fullTerms, revenueShare: "" },
    );
    expect(r.hint).toBe("Blocked");
  });
});

describe("termsSchema", () => {
  it("类型校验：非字符串会被拒绝", () => {
    const r = termsSchema.safeParse({ ...fullTerms, revenueShare: 123 });
    expect(r.success).toBe(false);
  });

  it("合法条款通过解析", () => {
    const r = termsSchema.safeParse(fullTerms);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.revenueShare).toBe("15%");
  });
});