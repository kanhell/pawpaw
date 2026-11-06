import { describe, expect, it } from "vitest";
import {
  MissionPoolError,
  PRESET_MISSIONS,
  describeAssignmentMission,
  pickDistinctMissions,
} from "./missions";

describe("pickDistinctMissions", () => {
  it("미션 수까지는 서로 겹치지 않게 뽑는다", () => {
    for (const count of [1, 5, PRESET_MISSIONS.length]) {
      const picked = pickDistinctMissions(count);
      expect(picked).toHaveLength(count);
      expect(new Set(picked.map((m) => m.id)).size).toBe(count);
    }
  });

  it("미션이 모자라면 겹치게 주지 않고 오류를 던진다", () => {
    expect(() => pickDistinctMissions(PRESET_MISSIONS.length + 1)).toThrow(
      MissionPoolError,
    );
  });
});

describe("describeAssignmentMission", () => {
  it("직접 정한 미션은 본문을 그대로 보여준다", () => {
    expect(
      describeAssignmentMission({ missionId: null, missionText: "하늘 사진 찍기" }),
    ).toEqual({ text: "하늘 사진 찍기", label: "직접 정한 미션" });
  });

  it("기본 제공 미션은 분류와 난이도를 함께 보여준다", () => {
    expect(describeAssignmentMission({ missionId: "m03" })).toEqual({
      text: "꽃 사진 찍기",
      label: "사진 · ★",
    });
  });

  it("알 수 없는 미션이면 undefined다", () => {
    expect(describeAssignmentMission({ missionId: "nope" })).toBeUndefined();
    expect(describeAssignmentMission({ missionId: null })).toBeUndefined();
  });
});
