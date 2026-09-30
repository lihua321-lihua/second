import type { ContractView } from "@/lib/services/contract-service";

export interface NextStep {
  label: string;
  href?: string;
}

/** 依据合同状态与校验结果，给出「当前建议下一步」。 */
export function suggestNextSteps(view: ContractView): NextStep[] {
  const base = `/contracts/${view.id}`;
  const v = view.validation;

  switch (view.status) {
    case "Blocked":
      return [
        { label: "补齐核心生效要件（签约主体、签字人、签署邮箱、币种、结算周期）", href: `${base}/terms` },
      ];
    case "NeedsInformation":
      return [{ label: "补充缺失字段后校验通过", href: `${base}/terms` }];
    case "Draft":
      if (!v.valid) {
        return [{ label: "补齐缺失字段", href: `${base}/terms` }];
      }
      if (!view.hasPdf) {
        return [{ label: "生成合同 PDF", href: `${base}/draft` }];
      }
      return [{ label: "提交审批", href: `${base}/draft` }];
    case "PendingApproval":
      return [{ label: "等待商务与法务审批", href: `${base}/approval` }];
    case "ReadyToSign":
      return [{ label: "发起电子签", href: `${base}/sign` }];
    case "Sent":
    case "PartiallySigned":
      return [{ label: "跟踪签署状态", href: `${base}/status` }];
    case "Completed":
      return [{ label: "下载已签署文件并归档", href: `${base}/archive` }];
    case "Archived":
      return [{ label: "已完成归档（终态）" }];
    case "Failed":
    case "Cancelled":
      return [{ label: "重新起草新版本", href: `${base}/terms` }];
    default:
      return [];
  }
}