import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODE,
  MODES,
  MODE_LIST,
  buildRoomSettings,
  describeResultAtNone,
  getMode,
  isGameMode,
  scopePatch,
} from "./modes";

describe("buildRoomSettings", () => {
  it("모드별 기본 설정이 표와 같다", () => {
    expect(buildRoomSettings("daily")).toEqual({
      mode: "daily",
      assigner: "app",
      visibility: "public",
      scope: "same",
      durationDays: 7,
      timeLimitSec: null,
    });
    expect(buildRoomSettings("oneshot")).toEqual({
      mode: "oneshot",
      assigner: "players",
      visibility: "private",
      scope: "different",
      durationDays: null,
      timeLimitSec: null,
    });
    expect(buildRoomSettings("race")).toMatchObject({
      assigner: "app",
      visibility: "public",
      scope: "same",
    });
    expect(buildRoomSettings("solo")).toMatchObject({
      assigner: "app",
      visibility: "private",
      scope: "different",
    });
    expect(buildRoomSettings("endless")).toEqual({
      mode: "endless",
      assigner: "app",
      visibility: "public",
      scope: "same",
      durationDays: null,
      timeLimitSec: 180,
    });
  });
});

describe("모드 정의", () => {
  it("5개 모드가 순서대로 있다", () => {
    expect(MODE_LIST.map((mode) => mode.id)).toEqual([
      "daily",
      "oneshot",
      "race",
      "solo",
      "endless",
    ]);
  });

  it("기본값은 항상 허용된 선택지 안에 있다", () => {
    for (const mode of MODE_LIST) {
      for (const choice of [mode.assigner, mode.scope, mode.visibility]) {
        if (choice.options.length > 0) {
          expect(choice.options).toContain(choice.default);
        }
      }
    }
  });

  it("고정되거나 해당 없는 항목은 선택지가 1개 이하다", () => {
    expect(MODES.daily.scope.options).toEqual(["same"]);
    expect(MODES.daily.visibility.options).toEqual(["public"]);
    expect(MODES.race.assigner.options).toEqual(["app"]);
    expect(MODES.race.scope.options).toEqual(["same"]);
    expect(MODES.endless.assigner.options).toEqual(["app"]);
    expect(MODES.solo.scope.options).toEqual([]);
    expect(MODES.solo.visibility.options).toEqual([]);
  });

  it("앞쪽이 기본값이고 뒤쪽도 고를 수 있다", () => {
    expect(MODES.daily.assigner.options).toEqual(["app", "players"]);
    expect(MODES.oneshot.assigner.options).toEqual(["players", "app"]);
    expect(MODES.oneshot.scope.options).toEqual(["different", "same"]);
    expect(MODES.endless.scope.options).toEqual(["same", "different"]);
    expect(MODES.endless.visibility.options).toEqual(["public", "private"]);
  });

  it("초대가 필요 없는 모드는 1인모드뿐이다", () => {
    expect(MODE_LIST.filter((mode) => !mode.invite).map((mode) => mode.id)).toEqual(["solo"]);
  });

  it("추가 설정의 기본값은 범위 안이고 단계에 맞는다", () => {
    for (const mode of MODE_LIST) {
      for (const extra of mode.extras) {
        expect(extra.default).toBeGreaterThanOrEqual(extra.min);
        expect(extra.default).toBeLessThanOrEqual(extra.max);
        expect((extra.default - extra.min) % extra.step).toBe(0);
      }
    }
    expect(MODES.endless.extras[0].format(180)).toBe("3분");
    expect(MODES.endless.extras[0].format(90)).toBe("1분 30초");
    expect(MODES.daily.extras[0].format(7)).toBe("7일");
  });
});

describe("getMode / isGameMode", () => {
  it("알 수 없는 값은 기본 모드로 취급한다", () => {
    expect(getMode("race").id).toBe("race");
    expect(getMode("nope").id).toBe(DEFAULT_MODE);
    expect(getMode(undefined).id).toBe(DEFAULT_MODE);
    expect(isGameMode("toString")).toBe(false);
    expect(isGameMode("solo")).toBe(true);
  });
});

describe("정하지 않을 수 있는 설정", () => {
  it("진행 일수는 매일매일에서만 정하지 않을 수 있다", () => {
    expect(MODES.daily.extras[0].optional).toBeDefined();
    expect(MODES.endless.extras[0].optional).toBeUndefined();
  });
});

describe("scopePatch", () => {
  it("모두 같은 미션이면 공개 범위는 미리 전체 공개로 정한다", () => {
    expect(scopePatch(MODES.oneshot, "same")).toEqual({
      scope: "same",
      visibility: "public",
    });
  });

  it("각자 다른 미션으로 돌아오면 모드의 기본 공개 범위로 되돌린다", () => {
    expect(scopePatch(MODES.oneshot, "different")).toEqual({
      scope: "different",
      visibility: "private",
    });
    expect(scopePatch(MODES.endless, "different")).toEqual({
      scope: "different",
      visibility: "public",
    });
  });

  it("모든 모드의 기본 설정은 같은 미션이면 전체 공개다", () => {
    for (const mode of MODE_LIST) {
      const settings = buildRoomSettings(mode.id);
      if (settings.scope === "same") expect(settings.visibility).toBe("public");
    }
  });
});

describe("결과 공개 시각 정책", () => {
  it("1인모드, 선착순, 무한미션은 정하지 않는다 (A)", () => {
    for (const id of ["solo", "race", "endless"] as const) {
      expect(MODES[id].resultAt(buildRoomSettings(id))).toBe("none");
    }
  });

  it("일회성은 방장이 정할지 말지 고른다 (B)", () => {
    expect(MODES.oneshot.resultAt(buildRoomSettings("oneshot"))).toBe("choice");
  });

  it("매일매일은 진행 일수가 있으면 고르고(B), 없으면 정하지 않는다(A)", () => {
    const withDays = buildRoomSettings("daily");
    expect(MODES.daily.resultAt(withDays)).toBe("choice");
    expect(MODES.daily.resultAt({ ...withDays, durationDays: null })).toBe("none");
  });
});

describe("describeResultAtNone", () => {
  it("제한 시간이 있으면 제한 시간이 끝날 때 공개된다고 안내한다", () => {
    expect(describeResultAtNone(buildRoomSettings("endless"))).toBe(
      "제한 시간이 끝나면 결과가 공개돼요.",
    );
  });

  it("제한 시간이 없으면 방장이 직접 공개한다고 안내한다", () => {
    expect(describeResultAtNone(buildRoomSettings("race"))).toContain("방장이");
  });
});
