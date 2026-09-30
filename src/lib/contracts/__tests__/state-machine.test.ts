import { describe, it, expect } from "vitest";
import {
  CONTRACT_TRANSITIONS,
  canTransition,
  isForwardSignature,
  nextTransitions,
} from "../state-machine";

describe("合同状态机转移表", () => {
  it("Draft 可进入 NeedsInformation / Blocked / PendingApproval / Cancelled", () => {
    expect(nextTransitions("Draft")).toEqual([
      "NeedsInformation",
      "Blocked",
      "PendingApproval",
      "Cancelled",
    ]);
  });

  it("PendingApproval → 驳回回 Draft，双通过 → ReadyToSign", () => {
    expect(canTransition("PendingApproval", "Draft")).toBe(true);
    expect(canTransition("PendingApproval", "ReadyToSign")).toBe(true);
    expect(canTransition("PendingApproval", "Sent")).toBe(false);
  });

  it("Sent 后禁止回退到 Draft（仅可取消或向前）", () => {
    expect(canTransition("Sent", "Draft")).toBe(false);
    expect(canTransition("Sent", "PartiallySigned")).toBe(true);
    expect(canTransition("Sent", "Cancelled")).toBe(true);
  });

  it("Completed 只能归档，Archived 为终态", () => {
    expect(canTransition("Completed", "Archived")).toBe(true);
    expect(CONTRACT_TRANSITIONS["Archived"]).toEqual([]);
    expect(canTransition("Archived", "Draft")).toBe(false);
  });

  it("Cancelled / Failed 允许重新起草回 Draft", () => {
    expect(canTransition("Cancelled", "Draft")).toBe(true);
    expect(canTransition("Failed", "Draft")).toBe(true);
  });
});

describe("签署状态 Forward-only", () => {
  it("Sent → PartiallySigned → Completed 单调推进", () => {
    expect(isForwardSignature("Sent", "PartiallySigned")).toBe(true);
    expect(isForwardSignature("PartiallySigned", "Completed")).toBe(true);
  });

  it("Completed 终态不可被 Sent/PartiallySigned 覆盖", () => {
    expect(isForwardSignature("Completed", "Sent")).toBe(false);
    expect(isForwardSignature("Completed", "PartiallySigned")).toBe(false);
  });

  it("不允许跳过状态（Sent 不能直接到 Completed）", () => {
    expect(isForwardSignature("Sent", "Completed")).toBe(false);
  });
});