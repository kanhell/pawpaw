import { describe, expect, it } from "vitest";
import { fromDatetimeLocal, toDatetimeLocal } from "./datetime";

describe("datetime", () => {
  it("로컬 시각 문자열을 왕복 변환해도 같은 값이다", () => {
    const date = fromDatetimeLocal("2026-10-30T21:00");
    expect(date).not.toBeNull();
    expect(toDatetimeLocal(date!.toISOString())).toBe("2026-10-30T21:00");
  });

  it("비었거나 올바르지 않으면 빈 값/null이다", () => {
    expect(toDatetimeLocal(null)).toBe("");
    expect(toDatetimeLocal("not-a-date")).toBe("");
    expect(fromDatetimeLocal("")).toBeNull();
    expect(fromDatetimeLocal("not-a-date")).toBeNull();
  });
});
