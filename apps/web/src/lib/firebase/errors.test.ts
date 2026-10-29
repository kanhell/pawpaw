import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError } from "./errors";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("describeError", () => {
  it("권한 오류는 권한 안내를 돌려준다", () => {
    expect(describeError({ code: "permission-denied" })).toContain("권한이 없어요");
    expect(describeError({ code: "storage/unauthorized" })).toContain("권한이 없어요");
  });

  it("네트워크 오류는 네트워크 안내를 돌려준다", () => {
    expect(describeError({ code: "unavailable" })).toContain("네트워크");
    expect(describeError({ code: "storage/retry-limit-exceeded" })).toContain("네트워크");
  });

  it("알 수 없는 오류는 기본 안내를 돌려준다", () => {
    expect(describeError({ code: "something-else" })).toContain("문제가 생겼어요");
    expect(describeError(new Error("boom"))).toContain("문제가 생겼어요");
    expect(describeError(null)).toContain("문제가 생겼어요");
    expect(describeError("문자열")).toContain("문제가 생겼어요");
  });

  it("개발 환경에서는 오류 코드를 덧붙인다", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(describeError({ code: "storage/unauthorized" })).toContain(
      "(storage/unauthorized)",
    );
    expect(describeError({ code: "permission-denied" })).toContain(
      "(permission-denied)",
    );
  });

  it("운영 환경에서는 오류 코드를 보여주지 않는다", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(describeError({ code: "storage/unauthorized" })).not.toContain("storage/");
  });
});
