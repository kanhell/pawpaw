import { describe, expect, it } from "vitest";
import {
  INVITE_CODE_LENGTH,
  generateInviteCode,
  isValidInviteCode,
} from "./code";

describe("generateInviteCode", () => {
  it("24자 영숫자 코드를 만든다", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(isValidInviteCode(code)).toBe(true);
  });

  it("매번 다른 코드를 만든다", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBe(50);
  });

  it("248 이상인 바이트는 건너뛰어 값이 치우치지 않게 한다", () => {
    // 255는 버려지고 0, 1, 2 ...만 쓰인다.
    const bytes = [255, 254, 248, 0, 1, 2];
    let call = 0;
    const code = generateInviteCode((length) => {
      call += 1;
      // 첫 호출만 특수 값, 이후는 0으로 채운다.
      return call === 1
        ? Uint8Array.from([...bytes, ...new Array(length - bytes.length).fill(0)])
        : new Uint8Array(length);
    });
    expect(code.startsWith("ABC")).toBe(true); // 0,1,2 → A,B,C
    expect(isValidInviteCode(code)).toBe(true);
  });
});

describe("isValidInviteCode", () => {
  it("형식이 맞지 않으면 거부한다", () => {
    expect(isValidInviteCode("")).toBe(false);
    expect(isValidInviteCode("a".repeat(23))).toBe(false);
    expect(isValidInviteCode("a".repeat(25))).toBe(false);
    expect(isValidInviteCode("a".repeat(23) + "/")).toBe(false);
    expect(isValidInviteCode("a".repeat(23) + "-")).toBe(false);
  });

  it("24자 영숫자는 허용한다", () => {
    expect(isValidInviteCode("aB3".repeat(8))).toBe(true);
  });
});
