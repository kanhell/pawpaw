import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { markSubmitted, revealResultsNow, subscribeMembers } from "./roomRepo";

/**
 * 제출 현황과 결과 공개(docs/RESULT_REVEAL.md)에서 쓰는 roomRepo 함수 테스트.
 * Firebase SDK를 가짜로 바꿔서 저장 경로와 필드만 확인한다.
 * 실제 규칙이 동작하는지는 이 테스트로 알 수 없다. (docs/RESULT_REVEAL.md "배포 전 확인")
 */
const m = vi.hoisted(() => ({
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
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
    updateDoc: m.updateDoc,
    onSnapshot: m.onSnapshot,
    getDoc: m.getDoc,
  };
});

vi.mock("firebase/storage", () => ({}));

vi.mock("./client", () => ({
  getFirebase: () => ({ db: { kind: "db" }, storage: { kind: "storage" } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.updateDoc.mockResolvedValue(undefined);
});

describe("markSubmitted", () => {
  it("내 멤버 문서에 제출했다는 표시만 남긴다", async () => {
    await markSubmitted("room1", "u1");

    const [ref, data] = m.updateDoc.mock.calls[0];
    expect(ref.path).toBe("rooms/room1/members/u1");
    // 사진 경로나 시각 같은 정보는 담지 않는다.
    expect(Object.keys(data)).toEqual(["submitted"]);
    expect(data.submitted).toBe(true);
  });
});

describe("revealResultsNow", () => {
  it("결과 시각과 마감 시각을 지금으로 바꾸고 방을 종료 상태로 만든다", async () => {
    await revealResultsNow("room1");

    expect(m.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      {
        status: "finished",
        phase: null,
        resultAt: "SERVER_TIMESTAMP",
        deadlineAt: "SERVER_TIMESTAMP",
      },
    );
  });
});

describe("subscribeMembers의 제출 표시", () => {
  it("제출한 멤버만 submitted가 true이고, 아닌 멤버에는 값이 없다", async () => {
    m.getDoc.mockResolvedValue({ data: () => ({ nickname: "헤리" }) });
    const onData = vi.fn();
    subscribeMembers("room1", onData, vi.fn());
    const [, onNext] = m.onSnapshot.mock.calls[0];

    const joinedAt = Timestamp.fromDate(new Date("2026-10-30T01:00:00Z"));
    await onNext({
      docs: [
        {
          id: "u1",
          data: () => ({ userId: "u1", animal: "🐻", isHost: true, joinedAt, submitted: true }),
        },
        {
          id: "u2",
          data: () => ({ userId: "u2", animal: "🐰", isHost: false, joinedAt }),
        },
      ],
    });

    const profiles = onData.mock.calls[0][0];
    expect(profiles[0].player.submitted).toBe(true);
    expect(profiles[1].player).not.toHaveProperty("submitted");
  });
});
