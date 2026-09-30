import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const STEPS: { title: string; desc: string }[] = [
  { title: "新建供应商申请", desc: "在首页「合同列表」点击「新建供应商申请」，或直接访问 /vendors/apply。填写公司法定名称、注册地、注册地址、产品/服务，以及签字人姓名、职务和签署邮箱。必填项为「公司法定名称」和「签字人信息」。" },
  { title: "补全商业条款", desc: "提交申请后进入该合同的「商业条款」页，补全产品、授权范围、收费方式、币种、收入口径，以及核心条款「分成比例」（例如补全为 15%）和结算周期。条款通过校验后方可进入下一环节。" },
  { title: "提交审批", desc: "条款校验通过后，点击「提交审批」。此时合同状态由「待补充信息」进入「待审批」，等待商务与法务审批。" },
  { title: "商务与法务双重审批", desc: "商务、法务分别对合同进行「通过」或「驳回」。两个角色都需要审批通过，合同才会进入「待签署」。任意一方驳回则回到修订阶段。" },
  { title: "发起签署", desc: "审批全部通过后，点击「发起签署」，将合同发送至签字人签署邮箱，状态变为「已发出签署」。" },
  { title: "同步签署状态", desc: "签署过程中可点击「同步签署状态」，拉取签署进度（部分签署 / 签署完成），合同状态随之更新。" },
  { title: "归档合同", desc: "签署完成后点击「归档」，将合同标记为「已归档」存档，整个流程完成。" },
];

const BUTTONS: { name: string; desc: string }[] = [
  { name: "新建供应商申请", desc: "位于「合同列表」首页右上角，进入供应商申请表。" },
  { name: "提交申请", desc: "在供应商申请页底部，保存供应商基本信息并创建合同初稿。" },
  { name: "保存商业条款", desc: "在商业条款页保存并校验条款内容（如分成比例必须填写且通过校验）。" },
  { name: "提交审批", desc: "触发审批流程，将合同送达商务、法务审批队列。" },
  { name: "通过 / 驳回", desc: "商务或法务角色在审批页面的操作按钮，决定合同是否进入签署环节。" },
  { name: "发起签署", desc: "审批通过后向签字人邮箱发出签署请求。" },
  { name: "同步签署状态", desc: "拉取/刷新签署进度，更新合同为部分签署或已签署。" },
  { name: "归档", desc: "将已签署合同归档存档。" },
];

const IMPLEMENTED = [
  "供应商申请：填写并提交供应商基本信息，自动创建合同草稿。",
  "商业条款管理：编辑与校验产品、授权范围、分成比例（如 15%）、结算周期等条款。",
  "合同完整性校验：对合同关键生效要件（签约主体、签字人、分成比例等）进行校验。",
  "版本管理：供应商可创建合同版本（createVersion），支持多版本演进。",
  "内部审批：商务、法务双角色双岗位审批，支持通过 / 驳回。",
  "发起签署：向签字人邮箱发起签署请求。",
  "签署状态同步：同步签署进度（部分签署 / 已签署）。",
  "归档：对已签署合同做归档存档。",
  "合同搜索：支持按条件搜索合同（searchContracts）。",
  "操作日志：记录合同状态流转与关键操作。",
  "AI 自然语言操作：可通过 AI 侧栏用一句话操作，如「补全分成比例 15%」「提交审批」「发起签署」「同步签署状态」「归档」。",
  "角色权限控制：前端与后端双层校验每位角色可执行的最小动作集。",
];

const NOT_IMPLEMENTED = [
  "真实第三方电子签名服务：当前发起签署 / 同步签署状态为模拟流程，未对接真实的电子签章平台。",
  "合同 PDF 生成与真实签署文件：暂未生成可供真实签署的 PDF 文件。",
  "邮件发送：签署邀请等为模拟行为，未接入真实邮件投递。",
  "多级 / 自定义审批流：审批固定为商务 + 法务两档，暂不支持自定义审批节点。",
  "多租户与组织架构：当前仅演示范围内的角色与账号，尚无企业组织、部门级别的权限管理。",
  "报表与分析：暂无合同金额统计、审批时效等可视化报表。",
];

const ROLES: { name: string; desc: string }[] = [
  { name: "供应商", desc: "维护自身的供应商与签字人信息、编辑商业条款、创建合同版本；但无权发起审批。" },
  { name: "商务", desc: "负责合同商务侧审批，可对合同版本执行「通过 / 驳回」。" },
  { name: "法务", desc: "负责合同法务侧审批，可对合同版本执行「通过 / 驳回」。与商务是两条独立的审批，只有两者都通过合同才可进入签署。" },
  { name: "管理员", desc: "拥有全部动作权限：维护信息、编辑条款、建版本、校验完整性、提交审批、通过/驳回、发起签署、同步签署状态、归档、搜索合同等；用于兜底与全流程操作。" },
];

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {intro && <p className="mt-1 text-sm text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">产品说明</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          欢迎使用「供应商合同工作台」。本产品帮助企业与供应商完成从申请建档、商业条款确认、内部审批、签署到归档的完整合同全流程管理。
        </p>
      </div>

      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b pb-2 text-sm">
        <Link href="#steps" className="text-primary underline-offset-4 hover:underline">使用步骤</Link>
        <Link href="#buttons" className="text-primary underline-offset-4 hover:underline">关键按钮</Link>
        <Link href="#features" className="text-primary underline-offset-4 hover:underline">功能清单</Link>
        <Link href="#roles" className="text-primary underline-offset-4 hover:underline">角色区别</Link>
      </nav>

      <Section
        id="steps"
        title="一、使用步骤"
        intro="从新建供应商申请开始，一步一步完成整个合同流程。右上角可切换当前角色，不同角色的可操作步骤不同。"
      >
        <Card>
          <CardContent className="space-y-4 p-5">
            {STEPS.map((s, i) => (
              <div key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </Section>

      <Section id="buttons" title="二、关键按钮是做什么的" intro="合同在不同阶段会显示对应的操作按钮，下表说明各按钮的作用。">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-1/3 px-5 py-2 font-medium">按钮</th>
                  <th className="px-5 py-2 font-medium">作用</th>
                </tr>
              </thead>
              <tbody>
                {BUTTONS.map((b, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-5 py-2.5 font-medium">{b.name}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{b.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Section>

      <Section id="features" title="三、已实现与未实现的功能" intro="如实列出当前版本已经支持的能力，以及暂未提供（或以模拟方式提供）的能力。">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-emerald-600">已实现</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {IMPLEMENTED.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-red-600">暂未实现 / 以模拟方式提供</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {NOT_IMPLEMENTED.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="roles" title="四、四个角色有什么不同" intro="角色通过顶部「角色」下拉框切换，前端与后端都会按角色做权限校验。">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-1/4 px-5 py-2 font-medium">角色</th>
                  <th className="px-5 py-2 font-medium">权限差异</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}