import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Terms, VendorInfo } from "@/types/domain";

export interface ContractPdfProps {
  terms: Partial<Terms>;
  vendor: Partial<VendorInfo>;
  version: number;
  generatedAt: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Noto Sans SC",
    fontSize: 11,
    lineHeight: 1.6,
    padding: 48,
    color: "#1a1a1a",
  },
  title: { fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 11, textAlign: "center", color: "#666", marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingBottom: 4,
  },
  row: { flexDirection: "row", marginBottom: 6 },
  key: { width: 130, color: "#444" },
  value: { flex: 1 },
  footer: { marginTop: 32, fontSize: 9, color: "#999", textAlign: "center" },
});

function Row({ k, v }: { k: string; v?: string }) {
  const show = v && v.trim() !== "" ? v : "（未填写）";
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{k}</Text>
      <Text style={styles.value}>{show}</Text>
    </View>
  );
}

export function ContractPdf({ terms, vendor, version, generatedAt }: ContractPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>供应商产品分销协议</Text>
        <Text style={styles.subtitle}>
          版本 v{version} · 生成时间 {generatedAt}
        </Text>

        <Text style={styles.sectionTitle}>一、签约主体</Text>
        <Row k="供应商（乙方）" v={vendor.legalName} />
        <Row k="注册地" v={vendor.country} />
        <Row k="注册地址" v={vendor.address} />
        <Row k="签字人" v={vendor.signerName} />
        <Row k="职务" v={vendor.title} />
        <Row k="签署邮箱" v={vendor.email} />

        <Text style={styles.sectionTitle}>二、商业条款</Text>
        <Row k="产品 / 服务" v={terms.product} />
        <Row k="授权范围" v={terms.scope} />
        <Row k="地域" v={terms.territory} />
        <Row k="收费方式" v={terms.pricingModel} />
        <Row k="币种" v={terms.currency} />
        <Row k="收入计算口径" v={terms.revenueBasis} />
        <Row k="分成比例" v={terms.revenueShare} />
        <Row k="结算周期" v={terms.settlementCycle} />
        <Row k="退款处理" v={terms.refund} />

        <Text style={styles.footer}>
          本协议由系统自动生成，最终以双方签署版本为准。
        </Text>
      </Page>
    </Document>
  );
}