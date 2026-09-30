import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { writeAuditTx } from "@/lib/audit";
import { loadContractView } from "@/lib/services/contract-service";
import { parseJson } from "@/lib/json";
import type { ActorType } from "@/types/domain";

/**
 * 归档（规则：仅签署完成可归档）：
 * - 下载/生成已签署 PDF（Mock：复制当前版本 PDF 为 -signed 副本）
 * - 生成签署完成证明（Mock：文本证明文件）
 * - 记录归档时间 + 操作人，状态 → Archived
 */
export async function archiveContract(contractId: string, actor: string, source: ActorType = "user") {
  const view = await loadContractView(contractId);
  if (view.status !== "Completed") {
    throw new Error(`当前状态（${view.status}）不可归档：仅「已签署」可归档`);
  }

  const signatureRequest = await prisma.signatureRequest.findFirst({
    where: { contractId },
    orderBy: { createdAt: "desc" },
  });
  if (!signatureRequest) throw new Error("无签署请求，无法归档");

  const version = view.currentVersionId
    ? await prisma.contractVersion.findUnique({ where: { id: view.currentVersionId } })
    : null;
  const versionNumber = version?.version ?? 1;
  const dir = path.join(process.cwd(), "public", "uploads", contractId);
  await fs.mkdir(dir, { recursive: true });

  // 1) 已签署 PDF（Mock：复制合同 PDF 为签署副本）
  let signedPdfUrl: string | null = null;
  if (version?.pdfUrl) {
    const srcAbs = path.join(process.cwd(), "public", version.pdfUrl.replace(/^\//, ""));
    const signedRel = `/uploads/${contractId}/v${versionNumber}-signed.pdf`;
    const signedAbs = path.join(process.cwd(), "public", signedRel.replace(/^\//, ""));
    try {
      const buf = await fs.readFile(srcAbs);
      await fs.writeFile(signedAbs, buf);
      signedPdfUrl = signedRel;
    } catch (e) {
      console.error("复制已签署 PDF 失败（回退复用原 PDF）:", e);
      signedPdfUrl = version.pdfUrl;
    }
  }

  // 2) 签署完成证明（Mock：文本证明）
  const signers = parseJson<{ name: string; email: string; role: string }[]>(signatureRequest.signersJson) ?? [];
  const certRel = `/uploads/${contractId}/v${versionNumber}-certificate.txt`;
  const certAbs = path.join(process.cwd(), "public", certRel.replace(/^\//, ""));
  const certContent = [
    "签署完成证明 (MockProvider)",
    "========================",
    `合同编号: ${contractId}`,
    `签署服务: ${signatureRequest.provider}`,
    `信封 ID: ${signatureRequest.providerEnvelopeId ?? "-"}`,
    `版本: v${versionNumber}`,
    `签署完成时间: ${signatureRequest.completedAt?.toISOString() ?? "-"}`,
    "签署人:",
    ...signers.map((s) => `  - ${s.role === "vendor" ? "供应商" : "我方"} ${s.name} <${s.email}>`),
    "",
    `证明生成时间: ${new Date().toISOString()}`,
  ].join("\n");
  await fs.writeFile(certAbs, certContent, "utf8");

  // 3) 落库：签名产物 + 归档信息 + 状态
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.signatureRequest.update({
      where: { id: signatureRequest.id },
      data: { signedPdfUrl, certificateUrl: certRel },
    });
    await tx.contract.update({
      where: { id: contractId },
      data: { status: "Archived", archivedAt: now, archivedBy: actor },
    });
    await writeAuditTx(tx, {
      actor,
      actorType: source,
      source,
      action: "archive_contract",
      entity: "Contract",
      entityId: contractId,
      after: { signedPdfUrl, certificateUrl: certRel, archivedAt: now.toISOString(), archivedBy: actor },
    });
  });

  return loadContractView(contractId);
}