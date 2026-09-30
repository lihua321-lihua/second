import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import fs from "fs/promises";
import path from "path";
import { ensurePdfFont } from "./register";
import { ContractPdf, type ContractPdfProps } from "./contract-document";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/json";
import type { Terms, VendorInfo } from "@/types/domain";

export async function renderContractPdfBuffer(
  props: ContractPdfProps,
): Promise<Buffer> {
  ensurePdfFont();
  return renderToBuffer(createElement(ContractPdf, props) as never);
}

function now(): string {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

/**
 * 为指定版本生成 PDF 并存至 public/uploads，更新版本 pdfUrl。
 * 优先使用版本内的 vendorSnapshot（不可变），保证历史合同不随供应商变更漂移。
 */
export async function generateAndStorePdf(
  contractId: string,
  versionId: string,
): Promise<string> {
  const version = await prisma.contractVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new Error("版本不存在");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { vendor: true },
  });
  if (!contract) throw new Error("合同不存在");

  const terms = parseJson<Partial<Terms>>(version.termsJson) ?? {};
  const snapshot = parseJson<Partial<VendorInfo>>(version.vendorSnapshot) ?? {};
  const vendor: Partial<VendorInfo> = {
    legalName: snapshot.legalName ?? contract.vendor?.legalName,
    country: snapshot.country ?? contract.vendor?.country,
    address: snapshot.address ?? contract.vendor?.address,
    product: snapshot.product ?? contract.vendor?.product,
    signerName: snapshot.signerName ?? contract.vendor?.signerName,
    title: snapshot.title ?? contract.vendor?.title,
    email: snapshot.email ?? contract.vendor?.email,
  };

  const buffer = await renderContractPdfBuffer({
    terms,
    vendor,
    version: version.version,
    generatedAt: now(),
  });

  const rel = `/uploads/${contractId}/v${version.version}.pdf`;
  const abs = path.join(process.cwd(), "public", "uploads", contractId, `v${version.version}.pdf`);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);

  await prisma.contractVersion.update({
    where: { id: versionId },
    data: { pdfUrl: rel },
  });

  return rel;
}