import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  assignRandomMissions,
  finishSettingsPhase,
  startSettingsPhase,
  updateResultAt,
  updateRoomSettings,
} from "./roomRepo";

/**
 * 게임 설정 단계(docs/ROUTES.md "게임 설정")에서 쓰는 roomRepo 함수 테스트.
 * Firebase SDK를 가짜로 바꿔서 저장 경로와 필드만 확인한다.
 * 실제 규칙이 동작하는지는 이 테스트로 알 수 없다. (docs/SECURITY.md "배포 전 확인")
 */
const m = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn() },
  updateDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => {
  class Timestamp {
    constructor(private readonly date: Date) {}
    static fromDate(date: Date) {
      return new Timestamp(date);
    }
    toDate() {
      return this.date;
    }
  }
  return {
    Timestamp,
    serverTimestamp: () => "SERVER_TIMESTAMP",
    doc: (_first: unknown, ...segments: string[]) => ({
      id: segments[segments.length - 1],
      path: segments.join("/"),
    }),
    writeBatch: () => m.batch,
    updateDoc: m.updateDoc,
  };
});

vi.mock("firebase/storage", () => ({}));

vi.mock("./client", () => ({
  getFirebase: () => ({ db: { kind: "db" }, storage: { kind: "storage" } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.batch.commit.mockResolvedValue(undefined);
  m.updateDoc.mockResolvedValue(undefined);
});

describe("게임 설정", () => {
  it("게임 시작은 설정 단계로 넘어간다 (playing이라 새 참가는 막힌다)", async () => {
    await startSettingsPhase("room1");

    expect(m.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { status: "playing", phase: "settings" },
    );
  });

  it("설정은 settings 하위 필드만 바꾼다", async () => {
    await updateRoomSettings("room1", { assigner: "players", scope: "same" });

    expect(m.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { "settings.assigner": "players", "settings.scope": "same" },
    );
  });

  it("바꿀 값이 없으면 저장하지 않는다", async () => {
    await updateRoomSettings("room1", {});
    expect(m.updateDoc).not.toHaveBeenCalled();
  });

  it("결과 공개 시각은 Timestamp로 저장한다", async () => {
    const date = new Date("2026-10-30T12:00:00Z");
    await updateResultAt("room1", date);

    const [refArg, data] = m.updateDoc.mock.calls[0];
    expect(refArg.path).toBe("rooms/room1");
    expect(data.resultAt).toBeInstanceOf(Timestamp);
    expect(data.resultAt.toDate().getTime()).toBe(date.getTime());
  });

  it("설정을 마치면 미션지정 단계로 넘어간다", async () => {
    await finishSettingsPhase("room1");

    expect(m.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { phase: "assign" },
    );
  });
});

describe("assignRandomMissions의 scope", () => {
  it("scope가 same이면 모두에게 같은 미션을 준다", async () => {
    await assignRandomMissions("room1", ["u1", "u2", "u3"], "same");

    const assignments = m.batch.set.mock.calls.slice(1).map(([, data]) => data);
    expect(assignments.map((a) => a.receiverId)).toEqual(["u1", "u2", "u3"]);
    expect(new Set(assignments.map((a) => a.missionId)).size).toBe(1);
  });

  it("scope를 생략하면 서로 다른 미션을 준다", async () => {
    await assignRandomMissions("room1", ["u1", "u2", "u3"]);

    const assignments = m.batch.set.mock.calls.slice(1).map(([, data]) => data);
    expect(new Set(assignments.map((a) => a.missionId)).size).toBe(3);
  });
});
