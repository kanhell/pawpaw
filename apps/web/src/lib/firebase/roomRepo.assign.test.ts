import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  giveMission,
  giveMissionToAll,
  revealMissions,
  subscribeRoomAssignments,
} from "./roomRepo";

/**
 * 미션 직접 부여(docs/MISSION_ASSIGN.md)에서 쓰는 roomRepo 함수 테스트.
 * Firebase SDK를 가짜로 바꿔서 저장 경로와 필드가 규칙(firestore.rules)이 기대하는 모양인지 확인한다.
 * 실제 규칙이 동작하는지는 이 테스트로 알 수 없다. (docs/MISSION_ASSIGN.md "배포 전 확인")
 */
const m = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn() },
  onSnapshot: vi.fn(),
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
    doc: (_first: unknown, ...segments: string[]) => ({
      id: segments[segments.length - 1],
      path: segments.join("/"),
    }),
    writeBatch: () => m.batch,
    onSnapshot: m.onSnapshot,
  };
});

vi.mock("firebase/storage", () => ({}));

vi.mock("./client", () => ({
  getFirebase: () => ({ db: { kind: "db" }, storage: { kind: "storage" } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.batch.commit.mockResolvedValue(undefined);
});

describe("giveMission", () => {
  it("받는 사람의 배정 문서를 직접 정한 미션으로 만든다", async () => {
    await giveMission("room1", "u1", "u2", "  하늘 사진 찍기  ");

    expect(m.batch.set).toHaveBeenCalledTimes(1);
    const [ref, data] = m.batch.set.mock.calls[0];
    expect(ref.path).toBe("rooms/room1/assignments/a-u2");
    expect(data).toEqual({
      id: "a-u2",
      roomId: "room1",
      roundId: "r1",
      giverId: "u1",
      receiverId: "u2",
      missionText: "하늘 사진 찍기",
      order: 1,
      createdAt: "SERVER_TIMESTAMP",
    });
    expect(data).not.toHaveProperty("missionId");
  });

  it("정했다는 표시를 내 멤버 문서에 함께 저장하고 한 번에 커밋한다", async () => {
    await giveMission("room1", "u1", "u2", "꽃 사진 찍기");

    expect(m.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1/members/u1" }),
      { assignmentDone: true },
    );
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });

  it("비었거나 60자를 넘으면 저장하지 않는다", async () => {
    await expect(giveMission("room1", "u1", "u2", "   ")).rejects.toThrow();
    await expect(giveMission("room1", "u1", "u2", "가".repeat(61))).rejects.toThrow();

    expect(m.batch.set).not.toHaveBeenCalled();
    expect(m.batch.commit).not.toHaveBeenCalled();
  });

  it("60자까지는 저장한다", async () => {
    await giveMission("room1", "u1", "u2", "가".repeat(60));
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("giveMissionToAll", () => {
  it("모든 멤버에게 같은 미션을 방장이 정해준 것으로 만든다", async () => {
    await giveMissionToAll("room1", "host", ["host", "u2", "u3"], "10분 산책하기");

    const sets = m.batch.set.mock.calls;
    expect(sets.map(([ref]) => ref.path)).toEqual([
      "rooms/room1/assignments/a-host",
      "rooms/room1/assignments/a-u2",
      "rooms/room1/assignments/a-u3",
    ]);
    for (const [, data] of sets) {
      expect(data.giverId).toBe("host");
      expect(data.missionText).toBe("10분 산책하기");
      expect(data).not.toHaveProperty("missionId");
    }
    expect(m.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1/members/host" }),
      { assignmentDone: true },
    );
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });

  it("본문이 올바르지 않으면 저장하지 않는다", async () => {
    await expect(giveMissionToAll("room1", "host", ["host"], "")).rejects.toThrow();
    expect(m.batch.commit).not.toHaveBeenCalled();
  });
});

describe("revealMissions", () => {
  it("라운드를 만들고 미션 진행 단계로 넘어간다", async () => {
    await revealMissions("room1");

    const [roundRef, round] = m.batch.set.mock.calls[0];
    expect(roundRef.path).toBe("rooms/room1/rounds/r1");
    expect(round).toMatchObject({ id: "r1", roomId: "room1", index: 1, endsAt: null });
    expect(m.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { status: "playing", phase: "play" },
    );
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeRoomAssignments", () => {
  it("방의 모든 배정을 구독하고 모델로 바꾼다", () => {
    const onData = vi.fn();
    subscribeRoomAssignments("room1", onData, vi.fn());

    const [refArg, onNext] = m.onSnapshot.mock.calls[0];
    expect(refArg).toEqual({ kind: "collection", path: "rooms/room1/assignments" });

    const createdAt = Timestamp.fromDate(new Date("2026-10-30T01:00:00Z"));
    onNext({
      docs: [
        {
          id: "a-u1",
          data: () => ({
            roomId: "room1",
            roundId: "r1",
            giverId: "u2",
            receiverId: "u1",
            missionText: "하늘 사진 찍기",
            createdAt,
          }),
        },
        {
          id: "a-u2",
          data: () => ({
            roomId: "room1",
            roundId: "r1",
            giverId: null,
            receiverId: "u2",
            missionId: "m03",
            createdAt,
          }),
        },
      ],
    });

    expect(onData).toHaveBeenCalledWith([
      {
        id: "a-u1",
        roomId: "room1",
        roundId: "r1",
        giverId: "u2",
        receiverId: "u1",
        missionId: null,
        missionText: "하늘 사진 찍기",
        order: 1,
        createdAt: "2026-10-30T01:00:00.000Z",
      },
      {
        id: "a-u2",
        roomId: "room1",
        roundId: "r1",
        giverId: null,
        receiverId: "u2",
        missionId: "m03",
        order: 1,
        createdAt: "2026-10-30T01:00:00.000Z",
      },
    ]);
  });
});
