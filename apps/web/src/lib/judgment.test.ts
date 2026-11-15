import { describe, expect, it } from "vitest";
import { boomsNeeded, countFor, judgmentState } from "./judgment";

// 5명 방: 붐따는 본인을 뺀 4명이 누르고, 인정 투표는 본인 포함 5명이 한다.
const base = {
  boomBase: 4,
  voterCount: 5,
  booms: 0,
  accepts: 0,
  rejects: 0,
  allPresentVoted: false,
};

describe("boomsNeeded", () => {
  it("붐따를 누를 수 있는 사람의 30% 이상(올림)이고 최소 1개다", () => {
    expect(boomsNeeded(2)).toBe(1);
    expect(boomsNeeded(4)).toBe(2);
    expect(boomsNeeded(10)).toBe(3);
    expect(boomsNeeded(11)).toBe(4);
  });
});

describe("judgmentState", () => {
  it("붐따가 모자라면 인정 투표가 열리지 않는다", () => {
    expect(judgmentState({ ...base, booms: 1 })).toBe("none");
  });

  it("붐따가 30% 이상이면 인정 투표 중이다", () => {
    expect(judgmentState({ ...base, booms: 2 })).toBe("voting");
  });

  it("불인정이 본인 포함 전체의 과반이면 미션 실패다", () => {
    expect(judgmentState({ ...base, booms: 2, rejects: 2 })).toBe("voting");
    expect(judgmentState({ ...base, booms: 2, rejects: 3 })).toBe("failed");
  });

  it("인정이 절반 이상이면 인정이다", () => {
    expect(judgmentState({ ...base, booms: 2, accepts: 2 })).toBe("voting");
    expect(judgmentState({ ...base, booms: 2, accepts: 3 })).toBe("accepted");
  });

  it("들어온 사람이 모두 투표했는데 갈리지 않으면 인정이다", () => {
    expect(judgmentState({ ...base, booms: 2, rejects: 2, accepts: 1, allPresentVoted: true })).toBe(
      "accepted",
    );
  });
});

describe("countFor", () => {
  it("본인 표도 세고, 붐따 기준은 본인을 뺀 인원이다", () => {
    const counts = countFor(
      "a",
      ["a", "b", "c", "d"],
      new Set(["a", "b", "c"]),
      [{ targetId: "a" }, { targetId: "a" }, { targetId: "b" }],
      [
        { targetId: "a", voterId: "b", accept: false },
        { targetId: "a", voterId: "c", accept: true },
        { targetId: "a", voterId: "a", accept: true },
        { targetId: "a", voterId: "x", accept: false }, // 멤버가 아닌 표는 세지 않는다
        { targetId: "b", voterId: "c", accept: false },
      ],
    );
    expect(counts).toEqual({
      boomBase: 3,
      voterCount: 4,
      booms: 2,
      accepts: 2,
      rejects: 1,
      allPresentVoted: true, // 들어온 a, b, c가 모두 투표했다 (d는 안 들어옴)
    });
  });
});
