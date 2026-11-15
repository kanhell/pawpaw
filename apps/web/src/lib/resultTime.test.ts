import { describe, expect, it } from "vitest";
import {
  atNextSameTime,
  formatDay,
  formatResultTime,
  nextOccurrence,
  presetHourOf,
  shiftDays,
  shiftMinutes,
} from "./resultTime";

// 로컬 시각 기준 (테스트를 돌리는 컴퓨터의 시간대와 무관하게 같은 결과가 나온다)
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe("nextOccurrence", () => {
  it("오늘 그 시각이 아직이면 오늘이다", () => {
    expect(nextOccurrence(18, 0, at(2026, 11, 15, 17, 59))).toEqual(at(2026, 11, 15, 18));
  });

  it("이미 지났거나 딱 그 시각이면 내일이다", () => {
    expect(nextOccurrence(18, 0, at(2026, 11, 15, 18))).toEqual(at(2026, 11, 16, 18));
    expect(nextOccurrence(18, 0, at(2026, 11, 15, 23))).toEqual(at(2026, 11, 16, 18));
  });

  it("달이 바뀌어도 다음 날로 넘어간다", () => {
    expect(nextOccurrence(10, 0, at(2026, 11, 30, 12))).toEqual(at(2026, 12, 1, 10));
  });
});

describe("atNextSameTime", () => {
  it("날짜와 상관없이 같은 시각의 오늘, 지났으면 내일이다", () => {
    const now = at(2026, 11, 15, 19);
    expect(atNextSameTime(at(2026, 11, 20, 21, 30), now)).toEqual(at(2026, 11, 15, 21, 30));
    expect(atNextSameTime(at(2026, 11, 20, 18, 30), now)).toEqual(at(2026, 11, 16, 18, 30));
  });
});

describe("시각·날짜 옮기기", () => {
  it("30분씩 옮기고, 자정을 넘으면 날짜도 바뀐다", () => {
    expect(shiftMinutes(at(2026, 11, 15, 18), 30)).toEqual(at(2026, 11, 15, 18, 30));
    expect(shiftMinutes(at(2026, 11, 15, 18), -30)).toEqual(at(2026, 11, 15, 17, 30));
    expect(shiftMinutes(at(2026, 11, 15, 23, 30), 30)).toEqual(at(2026, 11, 16, 0));
  });

  it("날짜는 같은 시각으로 하루씩 옮긴다", () => {
    expect(shiftDays(at(2026, 11, 30, 18), 1)).toEqual(at(2026, 12, 1, 18));
    expect(shiftDays(at(2026, 12, 1, 18), -1)).toEqual(at(2026, 11, 30, 18));
  });
});

describe("presetHourOf", () => {
  it("정각 6·8·10시만 정해진 시각으로 본다", () => {
    expect(presetHourOf(at(2026, 11, 15, 20))).toBe(20);
    expect(presetHourOf(at(2026, 11, 15, 20, 30))).toBeNull();
    expect(presetHourOf(at(2026, 11, 15, 19))).toBeNull();
  });
});

describe("formatResultTime", () => {
  const now = at(2026, 11, 15, 12);

  it("오늘·내일·모레는 날짜 대신 말로 보여준다", () => {
    expect(formatDay(at(2026, 11, 15, 18), now)).toBe("오늘");
    expect(formatDay(at(2026, 11, 16, 18), now)).toBe("내일");
    expect(formatDay(at(2026, 11, 17, 18), now)).toBe("모레");
    expect(formatResultTime(at(2026, 11, 15, 18), now)).toMatch(/^오늘 /);
  });

  it("그 뒤로는 날짜와 며칠 뒤인지 보여준다", () => {
    const text = formatDay(at(2026, 11, 20, 18), now);
    expect(text).toContain("11월 20일");
    expect(text).toMatch(/\(5일 뒤\)$/);
    expect(formatDay(at(2026, 12, 1, 18), now)).toMatch(/\(16일 뒤\)$/);
  });
});
