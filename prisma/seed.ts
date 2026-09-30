import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { validateFields } from "../src/lib/contracts/terms";

const prisma = new PrismaClient();

async function main() {
  // 开发用幂等 seed：先清空再重建
  await prisma.auditLog.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.signatureRequest.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.contractVersion.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();

  // 内部用户（商务 / 法务 / 我方签署人）
  await prisma.user.createMany({
    data: [
      { name: "Bob", role: "biz", email: "bob@ourco.example" },
      { name: "Carol", role: "legal", email: "carol@ourco.example" },
      { name: "Kevin Li", role: "admin", email: "kevin@ourco.example" },
    ],
  });

  // 供应商 Acme Cloud
  const vendor = await prisma.vendor.create({
    data: {
      legalName: "Acme Cloud Pte. Ltd.",
      country: "Singapore",
      address: "1 Raffles Place, Singapore 048616",
      product: "Acme API Gateway 分销",
      signerName: "Alice Tan",
      title: "CFO",
      email: "alice@acme.example",
      status: "Active",
    },
  });

  // 商业条款：初始故意缺 revenueShare
  const terms = {
    product: "Acme API Gateway",
    scope: "非独家分销",
    territory: "APAC",
    pricingModel: "收入分成",
    currency: "USD",
    revenueBasis: "净收入",
    revenueShare: "", // 初始缺失 → NeedsInformation
    settlementCycle: "月结30天",
    refund: "按未使用比例扣减",
  };

  const validation = validateFields(vendor, terms);
  const status =
    validation.hint === "Blocked"
      ? "Blocked"
      : validation.hint === "NeedsInformation"
        ? "NeedsInformation"
        : "Draft";

  const contract = await prisma.contract.create({
    data: {
      vendorId: vendor.id,
      type: "distribution",
      status,
      draftTermsJson: JSON.stringify(terms),
    },
  });

  console.log("=== Seed 完成 ===");
  console.log(`供应商: ${vendor.legalName} (${vendor.email})`);
  console.log(`合同: ${contract.id}  状态: ${status}`);
  console.log(`校验: valid=${validation.valid} hint=${validation.hint}`);
  console.log(`  缺核心: ${JSON.stringify(validation.missingCore)}`);
  console.log(`  缺必填: ${JSON.stringify(validation.missingRequired)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());