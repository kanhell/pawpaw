import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { getMission } from "../missions";
import { isValidInviteCode } from "../invite/code";
import {
  assignRandomMissions,
  checkMembership,
  createRoom,
  joinRoom,
  loadPhoto,
  renewInvite,
  revokeInvites,
  submitPhoto,
  subscribeLatestInvite,
  subscribeMembers,
  subscribeMyAssignment,
  subscribeMySubmission,
  subscribeRoom,
} from "./roomRepo";

/**
 * Firebase SDK를 가짜로 바꿔서, roomRepo가 규칙(firestore.rules / storage.rules)이
 * 기대하는 경로와 필드로 저장하고 조회하는지 확인한다.
 * 실제 규칙이 동작하는지는 이 테스트로 알 수 없다. (docs/SECURITY.md "배포 전 확인")
 */
const m = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() },
  onSnapshot: vi.fn(),
  orderBy: vi.fn((...args: unknown[]) => ({ kind: "orderBy", args })),
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => ({ kind: "query", args })),
  where: vi.fn((...args: unknown[]) => ({ kind: "where", args })),
  limit: vi.fn((count: number) => ({ kind: "limit", count })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  uploadBytes: vi.fn(),
  getBlob: vi.fn(),
  calls: [] as string[],
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
      if (first.kind === "collection" && segments.length === 1) {
        return { id: segments[0], path: `${first.path}/${segments[0]}` };
      }
      if (first.kind === "collection") {
        const id = "auto-room-id";
        return { id, path: `${first.path}/${id}` };
      }
      return { id: segments[segments.length - 1], path: segments.join("/") };
    },
    writeBatch: () => m.batch,
    query: m.query,
    where: m.where,
    limit: m.limit,
    orderBy: m.orderBy,
    getDocs: m.getDocs,
    onSnapshot: m.onSnapshot,
    setDoc: m.setDoc,
    getDoc: m.getDoc,
  };
});

vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => ({ kind: "ref", path }),
  uploadBytes: m.uploadBytes,
  getBlob: m.getBlob,
}));

vi.mock("./client", () => ({
  getFirebase: () => ({ db: { kind: "db" }, storage: { kind: "storage" } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  m.getDoc.mockReset();
  m.getDocs.mockReset();
  m.calls.length = 0;
  m.batch.commit.mockResolvedValue(undefined);
  m.uploadBytes.mockImplementation(async () => {
    m.calls.push("upload");
  });
  m.setDoc.mockImplementation(async () => {
    m.calls.push("setDoc");
  });
});

describe("createRoom", () => {
  it("사용자, 방, 방장 멤버 문서를 한 번에 만든다", async () => {
    const roomId = await createRoom("u1", { nickname: "헤리", animal: "🐻" });

    expect(roomId).toBe("auto-room-id");
    const written = Object.fromEntries(
      m.batch.set.mock.calls.map(([ref, data]) => [ref.path, data]),
    );
    expect(Object.keys(written).sort()).toEqual([
      "rooms/auto-room-id",
      "rooms/auto-room-id/members/u1",
      "users/u1",
    ]);
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });

  it("규칙이 요구하는 값(방장 id, waiting 상태)으로 방을 만든다", async () => {
    await createRoom("u1", { nickname: "헤리", animal: "🐻" });
    const room = m.batch.set.mock.calls.find(
      ([ref]) => ref.path === "rooms/auto-room-id",
    )?.[1];

    expect(room).toMatchObject({
      hostId: "u1",
      status: "waiting",
      phase: null,
      deadlineAt: null,
      resultAt: null,
    });
  });

  it("방장 멤버 문서의 id는 uid와 같고 isHost가 true다", async () => {
    await createRoom("u1", { nickname: "헤리", animal: "🐻" });
    const member = m.batch.set.mock.calls.find(
      ([ref]) => ref.path === "rooms/auto-room-id/members/u1",
    )?.[1];

    expect(member).toMatchObject({
      id: "u1",
      userId: "u1",
      animal: "🐻",
      isHost: true,
    });
  });

  it("사용자 문서는 merge로 써서 기존 프로필을 통째로 덮어쓰지 않는다", async () => {
    await createRoom("u1", { nickname: "헤리", animal: "🐻" });
    const call = m.batch.set.mock.calls.find(([ref]) => ref.path === "users/u1");

    expect(call?.[1]).toMatchObject({ id: "u1", nickname: "헤리", animal: "🐻" });
    expect(call?.[2]).toEqual({ merge: true });
  });
});

describe("assignRandomMissions", () => {
  it("멤버마다 서로 다른 미션을 하나씩 만든다", async () => {
    await assignRandomMissions("room1", ["u1", "u2", "u3"]);

    const sets = m.batch.set.mock.calls;
    expect(sets.map(([ref]) => ref.path)).toEqual([
      "rooms/room1/rounds/r1",
      "rooms/room1/assignments/a-u1",
      "rooms/room1/assignments/a-u2",
      "rooms/room1/assignments/a-u3",
    ]);

    const assignments = sets.slice(1).map(([, data]) => data);
    expect(assignments.map((a) => a.receiverId)).toEqual(["u1", "u2", "u3"]);
    for (const assignment of assignments) {
      expect(assignment.giverId).toBeNull(); // 앱이 정한 미션
      expect(assignment.roundId).toBe("r1");
      expect(assignment.order).toBe(1);
      expect(getMission(assignment.missionId)).toBeDefined();
    }
    expect(new Set(assignments.map((a) => a.missionId)).size).toBe(3);
  });

  it("방을 진행 상태로 바꾸고 한 번에 저장한다", async () => {
    await assignRandomMissions("room1", ["u1"]);

    expect(m.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1" }),
      { status: "playing", phase: "play" },
    );
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("submitPhoto", () => {
  const photo = new Blob(["x"], { type: "image/jpeg" });

  it("사진을 먼저 올리고 그다음 제출 문서를 만든다", async () => {
    await submitPhoto("room1", "u1", "a-u1", photo);
    expect(m.calls).toEqual(["upload", "setDoc"]);
  });

  it("본인 uid 폴더에 JPEG로 올린다", async () => {
    await submitPhoto("room1", "u1", "a-u1", photo);

    const [storageRef, uploaded, metadata] = m.uploadBytes.mock.calls[0];
    expect(storageRef.path).toBe("rooms/room1/submissions/u1/s-a-u1.jpg");
    expect(uploaded).toBe(photo);
    expect(metadata).toEqual({ contentType: "image/jpeg" });
  });

  it("규칙이 허용하는 필드만으로 제출 문서를 만든다", async () => {
    await submitPhoto("room1", "u1", "a-u1", photo);

    const [docRef, data] = m.setDoc.mock.calls[0];
    expect(docRef.path).toBe("rooms/room1/submissions/s-a-u1");
    expect(Object.keys(data).sort()).toEqual([
      "assignmentId",
      "id",
      "ownerId",
      "photoPath",
      "submittedAt",
    ]);
    expect(data).toEqual({
      id: "s-a-u1",
      assignmentId: "a-u1",
      ownerId: "u1",
      photoPath: "rooms/room1/submissions/u1/s-a-u1.jpg",
      submittedAt: "SERVER_TIMESTAMP",
    });
  });

  it("다운로드 URL이 아니라 저장 경로만 기록한다", async () => {
    await submitPhoto("room1", "u1", "a-u1", photo);

    const data = m.setDoc.mock.calls[0][1];
    expect(data).not.toHaveProperty("photoUrl");
    expect(data.photoPath).not.toMatch(/^https?:/);
  });

  it("업로드가 실패하면 제출 문서를 만들지 않는다", async () => {
    m.uploadBytes.mockRejectedValueOnce(new Error("upload failed"));

    await expect(submitPhoto("room1", "u1", "a-u1", photo)).rejects.toThrow(
      "upload failed",
    );
    expect(m.setDoc).not.toHaveBeenCalled();
  });
});

describe("loadPhoto", () => {
  it("다운로드 URL 대신 getBlob으로 경로의 사진을 받는다", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    m.getBlob.mockResolvedValue(blob);

    const result = await loadPhoto("rooms/room1/submissions/u1/s-a-u1.jpg");

    expect(m.getBlob).toHaveBeenCalledWith(
      expect.objectContaining({ path: "rooms/room1/submissions/u1/s-a-u1.jpg" }),
    );
    expect(result).toBe(blob);
  });
});

describe("subscribeMyAssignment", () => {
  it("규칙에 맞게 receiverId가 내 uid인 문서만 조회한다", () => {
    subscribeMyAssignment("room1", "u1", vi.fn(), vi.fn());

    expect(m.where).toHaveBeenCalledWith("receiverId", "==", "u1");
    expect(m.limit).toHaveBeenCalledWith(1);
    const [queryArg] = m.onSnapshot.mock.calls[0];
    expect(queryArg.args[0]).toEqual({
      kind: "collection",
      path: "rooms/room1/assignments",
    });
  });

  it("문서를 Assignment 모델로 바꾸고, 없으면 null을 돌려준다", () => {
    const onData = vi.fn();
    subscribeMyAssignment("room1", "u1", onData, vi.fn());
    const [, onNext] = m.onSnapshot.mock.calls[0];

    onNext({
      docs: [
        {
          id: "a-u1",
          data: () => ({
            roomId: "room1",
            roundId: "r1",
            receiverId: "u1",
            missionId: "m03",
            createdAt: Timestamp.fromDate(new Date("2026-10-27T01:00:00Z")),
          }),
        },
      ],
    });
    expect(onData).toHaveBeenLastCalledWith({
      id: "a-u1",
      roomId: "room1",
      roundId: "r1",
      giverId: null,
      receiverId: "u1",
      missionId: "m03",
      order: 1,
      createdAt: "2026-10-27T01:00:00.000Z",
    });

    onNext({ docs: [] });
    expect(onData).toHaveBeenLastCalledWith(null);
  });
});

describe("subscribeMySubmission", () => {
  it("규칙에 맞게 ownerId가 내 uid인 문서만 조회한다", () => {
    subscribeMySubmission("room1", "u1", vi.fn(), vi.fn());

    expect(m.where).toHaveBeenCalledWith("ownerId", "==", "u1");
    const [queryArg] = m.onSnapshot.mock.calls[0];
    expect(queryArg.args[0]).toEqual({
      kind: "collection",
      path: "rooms/room1/submissions",
    });
  });

  it("문서를 Submission 모델로 바꾼다", () => {
    const onData = vi.fn();
    subscribeMySubmission("room1", "u1", onData, vi.fn());
    const [, onNext] = m.onSnapshot.mock.calls[0];

    onNext({
      docs: [
        {
          id: "s-a-u1",
          data: () => ({
            assignmentId: "a-u1",
            ownerId: "u1",
            photoPath: "rooms/room1/submissions/u1/s-a-u1.jpg",
            submittedAt: Timestamp.fromDate(new Date("2026-10-27T02:30:00Z")),
          }),
        },
      ],
    });

    expect(onData).toHaveBeenCalledWith({
      id: "s-a-u1",
      assignmentId: "a-u1",
      ownerId: "u1",
      photoPath: "rooms/room1/submissions/u1/s-a-u1.jpg",
      submittedAt: "2026-10-27T02:30:00.000Z",
    });
  });
});

describe("subscribeRoom", () => {
  it("Room 문서를 모델로 바꾸고, 시각 필드는 ISO 문자열이나 null이 된다", () => {
    const onData = vi.fn();
    subscribeRoom("room1", onData, vi.fn());
    const [refArg, onNext] = m.onSnapshot.mock.calls[0];
    expect(refArg.path).toBe("rooms/room1");

    onNext({
      exists: () => true,
      id: "room1",
      data: () => ({
        hostId: "u1",
        settings: { mode: "oneshot" },
        status: "waiting",
        deadlineAt: null,
        resultAt: Timestamp.fromDate(new Date("2026-10-28T09:00:00Z")),
        createdAt: Timestamp.fromDate(new Date("2026-10-27T01:00:00Z")),
      }),
    });

    expect(onData).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: "room1",
        hostId: "u1",
        phase: null,
        deadlineAt: null,
        resultAt: "2026-10-28T09:00:00.000Z",
        createdAt: "2026-10-27T01:00:00.000Z",
      }),
    );

    onNext({ exists: () => false });
    expect(onData).toHaveBeenLastCalledWith(null);
  });
});

describe("subscribeMembers", () => {
  const snapshotOf = (uid: string) => ({
    docs: [
      {
        id: uid,
        data: () => ({
          userId: uid,
          animal: "🐻",
          isHost: true,
          joinedAt: Timestamp.fromDate(new Date("2026-10-27T01:00:00Z")),
        }),
      },
    ],
  });

  it("멤버와 닉네임을 함께 돌려준다", async () => {
    m.getDoc.mockResolvedValue({ data: () => ({ nickname: "헤리" }) });
    const onData = vi.fn();
    subscribeMembers("room1", onData, vi.fn());
    const [, onNext] = m.onSnapshot.mock.calls[0];

    await onNext(snapshotOf("u1"));

    expect(onData).toHaveBeenCalledWith([
      {
        player: {
          id: "u1",
          roomId: "room1",
          userId: "u1",
          animal: "🐻",
          isHost: true,
          joinedAt: "2026-10-27T01:00:00.000Z",
        },
        nickname: "헤리",
      },
    ]);
  });

  it("사용자 문서가 없으면 닉네임을 '알 수 없음'으로 둔다", async () => {
    m.getDoc.mockResolvedValue({ data: () => undefined });
    const onData = vi.fn();
    subscribeMembers("room1", onData, vi.fn());
    const [, onNext] = m.onSnapshot.mock.calls[0];

    await onNext(snapshotOf("u1"));

    expect(onData.mock.calls[0][0][0].nickname).toBe("알 수 없음");
  });

  it("늦게 도착한 이전 결과가 최신 결과를 덮어쓰지 않는다", async () => {
    let releaseFirst: () => void = () => {};
    m.getDoc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve({ data: () => ({ nickname: "예전" }) });
        }),
    );
    m.getDoc.mockResolvedValueOnce({ data: () => ({ nickname: "최신" }) });

    const onData = vi.fn();
    subscribeMembers("room1", onData, vi.fn());
    const [, onNext] = m.onSnapshot.mock.calls[0];

    const first = onNext(snapshotOf("u1"));
    const second = onNext(snapshotOf("u2"));
    await second;
    releaseFirst();
    await first;

    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData.mock.calls[0][0][0].nickname).toBe("최신");
  });

  it("조회 중 오류가 나면 onError로 알린다", async () => {
    m.getDoc.mockRejectedValue(new Error("denied"));
    const onError = vi.fn();
    subscribeMembers("room1", vi.fn(), onError);
    const [, onNext] = m.onSnapshot.mock.calls[0];

    await onNext(snapshotOf("u1"));

    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("renewInvite", () => {
  const oldInvite = { ref: { path: "rooms/room1/invites/OLDCODE" } };

  beforeEach(() => {
    m.getDocs.mockResolvedValue({ docs: [oldInvite] });
  });

  it("규칙이 요구하는 형식의 코드와 필드로 초대 문서를 만든다", async () => {
    const code = await renewInvite("room1", "u1");

    expect(isValidInviteCode(code)).toBe(true);
    const [ref, data] = m.batch.set.mock.calls[0];
    expect(ref.path).toBe(`rooms/room1/invites/${code}`);
    expect(Object.keys(data).sort()).toEqual([
      "code",
      "createdAt",
      "createdBy",
      "expiresAt",
    ]);
    expect(data.code).toBe(code);
    expect(data.createdBy).toBe("u1");
    expect(data.createdAt).toBe("SERVER_TIMESTAMP");
  });

  it("만료 시각은 지금부터 24시간 뒤다 (규칙의 최대 7일 이내)", async () => {
    const before = Date.now();
    await renewInvite("room1", "u1");
    const after = Date.now();

    const expiresAt = m.batch.set.mock.calls[0][1].expiresAt.toDate().getTime();
    const day = 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + day);
    expect(expiresAt).toBeLessThanOrEqual(after + day);
  });

  it("이전 초대 링크는 폐기하고 한 번에 저장한다", async () => {
    await renewInvite("room1", "u1");

    expect(m.batch.delete).toHaveBeenCalledWith(oldInvite.ref);
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });

  it("호출할 때마다 다른 코드를 만든다", async () => {
    const first = await renewInvite("room1", "u1");
    const second = await renewInvite("room1", "u1");
    expect(first).not.toBe(second);
  });
});

describe("revokeInvites", () => {
  it("모든 초대 문서를 삭제한다", async () => {
    const a = { ref: { path: "rooms/room1/invites/A" } };
    const b = { ref: { path: "rooms/room1/invites/B" } };
    m.getDocs.mockResolvedValue({ docs: [a, b] });

    await revokeInvites("room1");

    expect(m.batch.delete).toHaveBeenCalledTimes(2);
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeLatestInvite", () => {
  it("가장 최근에 만든 초대 하나만 조회한다", () => {
    subscribeLatestInvite("room1", vi.fn(), vi.fn());

    expect(m.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(m.limit).toHaveBeenCalledWith(1);
    const [queryArg] = m.onSnapshot.mock.calls[0];
    expect(queryArg.args[0]).toEqual({
      kind: "collection",
      path: "rooms/room1/invites",
    });
  });

  it("문서를 Invite 모델로 바꾸고, 없으면 null을 돌려준다", () => {
    const onData = vi.fn();
    subscribeLatestInvite("room1", onData, vi.fn());
    const [, onNext] = m.onSnapshot.mock.calls[0];

    onNext({
      docs: [
        {
          id: "A".repeat(24),
          data: () => ({
            createdBy: "u1",
            createdAt: Timestamp.fromDate(new Date("2026-10-27T01:00:00Z")),
            expiresAt: Timestamp.fromDate(new Date("2026-10-28T01:00:00Z")),
          }),
        },
      ],
    });
    expect(onData).toHaveBeenLastCalledWith({
      code: "A".repeat(24),
      createdBy: "u1",
      createdAt: "2026-10-27T01:00:00.000Z",
      expiresAt: "2026-10-28T01:00:00.000Z",
    });

    onNext({ docs: [] });
    expect(onData).toHaveBeenLastCalledWith(null);
  });
});

describe("joinRoom", () => {
  const code = "aB3".repeat(8);

  it("규칙이 허용하는 필드만으로 멤버 문서를 만든다", async () => {
    await joinRoom("u2", "room1", code, { nickname: "친구", animal: "🐰" });

    const call = m.batch.set.mock.calls.find(
      ([ref]) => ref.path === "rooms/room1/members/u2",
    );
    const data = call?.[1];
    expect(Object.keys(data).sort()).toEqual([
      "animal",
      "id",
      "inviteCode",
      "isHost",
      "joinedAt",
      "roomId",
      "userId",
    ]);
    expect(data).toEqual({
      id: "u2",
      roomId: "room1",
      userId: "u2",
      animal: "🐰",
      isHost: false,
      joinedAt: "SERVER_TIMESTAMP",
      inviteCode: code,
    });
  });

  it("방장 권한(isHost)은 절대 true로 보내지 않는다", async () => {
    await joinRoom("u2", "room1", code, { nickname: "친구", animal: "🐰" });
    const member = m.batch.set.mock.calls.find(
      ([ref]) => ref.path === "rooms/room1/members/u2",
    )?.[1];
    expect(member.isHost).toBe(false);
  });

  it("사용자 프로필을 merge로 저장하고 한 번에 커밋한다", async () => {
    await joinRoom("u2", "room1", code, { nickname: "친구", animal: "🐰" });

    const user = m.batch.set.mock.calls.find(([ref]) => ref.path === "users/u2");
    expect(user?.[1]).toMatchObject({ id: "u2", nickname: "친구", animal: "🐰" });
    expect(user?.[2]).toEqual({ merge: true });
    expect(m.batch.commit).toHaveBeenCalledTimes(1);
  });

  it("규칙이 거부하면 오류를 그대로 전달한다", async () => {
    m.batch.commit.mockRejectedValueOnce({ code: "permission-denied" });
    await expect(
      joinRoom("u2", "room1", code, { nickname: "친구", animal: "🐰" }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("checkMembership", () => {
  it("멤버 문서가 있으면 true다", async () => {
    m.getDoc.mockResolvedValue({ exists: () => true });
    await expect(checkMembership("room1", "u1")).resolves.toBe(true);
  });

  it("멤버 문서가 없으면 false다", async () => {
    m.getDoc.mockResolvedValue({ exists: () => false });
    await expect(checkMembership("room1", "u1")).resolves.toBe(false);
  });

  it("멤버가 아니라서 규칙이 읽기를 막으면 false로 취급한다", async () => {
    m.getDoc.mockRejectedValue({ code: "permission-denied" });
    await expect(checkMembership("room1", "u1")).resolves.toBe(false);
  });

  it("그 밖의 오류는 그대로 던진다", async () => {
    m.getDoc.mockRejectedValue({ code: "unavailable" });
    await expect(checkMembership("room1", "u1")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});
