import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRoomSettings } from "../modes";
import { clearResultAt, createRoom, updateRoomSettings } from "./roomRepo";

/**
 * 모드(docs/MODES.md)와 관련된 roomRepo 함수 테스트.
 * Firebase SDK를 가짜로 바꿔서 저장 경로와 필드만 확인한다.
 * 실제 규칙이 동작하는지는 이 테스트로 알 수 없다. (docs/SECURITY.md "배포 전 확인")
 */
const m = vi.hoisted(() => ({
  batch: { set: vi.fn(), commit: vi.fn() },
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
    collection: (_db: unknown, ...segments: string[]) => ({
      kind: "collection",
      path: segments.join("/"),
    }),
    doc: (first: { kind?: string; path?: string }, ...segments: string[]) => {
      if (first.kind === "collection" && segments.length === 0) {
        return { id: "auto-room-id", path: `${first.path}/auto-room-id` };
      }
      return { id: segments[segments.length - 1], path: segments.join("/") };
    },
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

function savedRoom() {
  return m.batch.set.mock.calls.find(([ref]) => ref.path === "rooms/auto-room-id")?.[1];
}

describe("createRoom의 모드", () => {
  it("고른 모드와 그 모드의 기본 설정으로 방을 만든다", async () => {
    await createRoom("u1", { nickname: "헤리", animal: "🐻" }, "race");

    expect(savedRoom().settings).toEqual(buildRoomSettings("race"));
    expect(savedRoom().settings.mode).toBe("race");
    expect(savedRoom()).toMatchObject({ hostId: "u1", status: "waiting" });
  });

  it("모드를 생략하면 일회성으로 만든다", async () => {
    await createRoom("u1", { nickname: "헤리", animal: "🐻" });
    expect(savedRoom().settings.mode).toBe("oneshot");
  });

  it("추가 설정(진행 일수, 제한 시간)의 기본값이 저장된다", async () => {
    await createRoom("u1", { nickname: "헤리", animal: "🐻" }, "daily");
    expect(savedRoom().settings.durationDays).toBe(7);

    m.batch.set.mockClear();
    await createRoom("u1", { nickname: "헤리", animal: "🐻" }, "endless");
    expect(savedRoom().settings.timeLimitSec).toBe(180);
  });
});

describe("updateRoomSettings의 숫자 설정", () => {
  it("진행 일수와 제한 시간도 settings 하위 필드로 저장한다", async () => {
    await updateRoomSettings("room1", { durationDays: 10 });
    expect(m.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { "settings.durationDays": 10 },
    );

    await updateRoomSettings("room1", { timeLimitSec: 240 });
    expect(m.updateDoc).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { "settings.timeLimitSec": 240 },
    );
  });
});

describe("정하지 않는 값 저장", () => {
  it("진행 일수를 정하지 않으면 null로 저장한다", async () => {
    await updateRoomSettings("room1", { durationDays: null });
    expect(m.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { "settings.durationDays": null },
    );
  });

  it("결과 공개 시각을 비운다", async () => {
    await clearResultAt("room1");
    expect(m.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { resultAt: null },
    );
  });
});
