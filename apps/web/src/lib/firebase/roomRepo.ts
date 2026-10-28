import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { getBlob, ref, uploadBytes } from "firebase/storage";
import type {
  Assignment,
  Invite,
  Player,
  Room,
  RoomSettings,
  Submission,
} from "@pawpaw/shared";
import { generateInviteCode } from "../invite/code";
import { pickRandomMissions } from "../missions";
import { getFirebase } from "./client";

/**
 * Firestore / Cloud Storage 접근을 모아 둔 곳. (구조: docs/DATA_MODEL.md)
 * 화면은 이 파일의 함수와 hooks.ts만 사용한다.
 */

export interface MemberProfile {
  player: Player;
  nickname: string;
}

type OnData<T> = (data: T) => void;
type OnError = (error: Error) => void;

// ---------- 변환 (Firestore 문서 → 공유 모델) ----------
const READ_OPTIONS = { serverTimestamps: "estimate" } as const;

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function isoOrNow(value: unknown): string {
  return iso(value) ?? new Date().toISOString();
}

function toRoom(id: string, d: DocumentData): Room {
  return {
    id,
    hostId: d.hostId,
    settings: d.settings,
    status: d.status,
    phase: d.phase ?? null,
    deadlineAt: iso(d.deadlineAt),
    resultAt: iso(d.resultAt),
    createdAt: isoOrNow(d.createdAt),
  };
}

function toPlayer(uid: string, roomId: string, d: DocumentData): Player {
  return {
    id: uid,
    roomId,
    userId: d.userId ?? uid,
    animal: d.animal,
    isHost: d.isHost === true,
    joinedAt: isoOrNow(d.joinedAt),
  };
}

function toAssignment(id: string, d: DocumentData): Assignment {
  return {
    id,
    roomId: d.roomId,
    roundId: d.roundId,
    giverId: d.giverId ?? null,
    receiverId: d.receiverId,
    missionId: d.missionId,
    order: d.order ?? 1,
    createdAt: isoOrNow(d.createdAt),
  };
}

function toSubmission(id: string, d: DocumentData): Submission {
  return {
    id,
    assignmentId: d.assignmentId,
    ownerId: d.ownerId,
    photoPath: d.photoPath,
    submittedAt: isoOrNow(d.submittedAt),
  };
}

function toInvite(code: string, d: DocumentData): Invite {
  return {
    code,
    createdBy: d.createdBy,
    createdAt: isoOrNow(d.createdAt),
    expiresAt: isoOrNow(d.expiresAt),
  };
}

// ---------- 방 만들기 ----------
export async function createRoom(
  uid: string,
  profile: { nickname: string; animal: string },
): Promise<string> {
  const { db } = getFirebase();
  const roomRef = doc(collection(db, "rooms"));
  const roomId = roomRef.id;

  const settings: RoomSettings = {
    mode: "oneshot",
    assigner: "app",
    visibility: "private",
    scope: "different",
    durationDays: null,
    timeLimitSec: null,
  };

  // 사용자, 방, 방장 멤버를 한 번에 만든다. (모두 성공하거나 모두 실패)
  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", uid),
    {
      id: uid,
      nickname: profile.nickname,
      animal: profile.animal,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(roomRef, {
    id: roomId,
    hostId: uid,
    settings,
    status: "waiting",
    phase: null,
    deadlineAt: null,
    resultAt: null,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "rooms", roomId, "members", uid), {
    id: uid,
    roomId,
    userId: uid,
    animal: profile.animal,
    isHost: true,
    joinedAt: serverTimestamp(),
  });
  await batch.commit();
  return roomId;
}

// ---------- 구독 ----------
export function subscribeRoom(
  roomId: string,
  onData: OnData<Room | null>,
  onError: OnError,
): Unsubscribe {
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, "rooms", roomId),
    (snap) =>
      onData(snap.exists() ? toRoom(snap.id, snap.data(READ_OPTIONS)) : null),
    onError,
  );
}

export function subscribeMembers(
  roomId: string,
  onData: OnData<MemberProfile[]>,
  onError: OnError,
): Unsubscribe {
  const { db } = getFirebase();
  let latest = 0; // 늦게 도착한 이전 결과가 최신 결과를 덮어쓰지 않게 한다.
  return onSnapshot(
    collection(db, "rooms", roomId, "members"),
    async (snap) => {
      const mine = ++latest;
      try {
        const players = snap.docs.map((d) =>
          toPlayer(d.id, roomId, d.data(READ_OPTIONS)),
        );
        const profiles = await Promise.all(
          players.map(async (player) => {
            const userSnap = await getDoc(doc(db, "users", player.userId));
            const nickname = userSnap.data()?.nickname;
            return {
              player,
              nickname: typeof nickname === "string" ? nickname : "알 수 없음",
            };
          }),
        );
        if (mine === latest) onData(profiles);
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    },
    onError,
  );
}

// 규칙은 필터가 아니므로 where 조건이 규칙과 맞아야 조회된다.
export function subscribeMyAssignment(
  roomId: string,
  uid: string,
  onData: OnData<Assignment | null>,
  onError: OnError,
): Unsubscribe {
  const { db } = getFirebase();
  const q = query(
    collection(db, "rooms", roomId, "assignments"),
    where("receiverId", "==", uid),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      const d = snap.docs[0];
      onData(d ? toAssignment(d.id, d.data(READ_OPTIONS)) : null);
    },
    onError,
  );
}

export function subscribeMySubmission(
  roomId: string,
  uid: string,
  onData: OnData<Submission | null>,
  onError: OnError,
): Unsubscribe {
  const { db } = getFirebase();
  const q = query(
    collection(db, "rooms", roomId, "submissions"),
    where("ownerId", "==", uid),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      const d = snap.docs[0];
      onData(d ? toSubmission(d.id, d.data(READ_OPTIONS)) : null);
    },
    onError,
  );
}

// ---------- 미션 부여 (방장) ----------
// 모든 멤버에게 서로 다른 임의 미션을 부여한다. (앱이 정하는 방식: giverId = null)
export async function assignRandomMissions(
  roomId: string,
  memberIds: string[],
): Promise<void> {
  const { db } = getFirebase();
  const missions = pickRandomMissions(memberIds.length);
  const roundId = "r1";

  const batch = writeBatch(db);
  batch.set(doc(db, "rooms", roomId, "rounds", roundId), {
    id: roundId,
    roomId,
    index: 1,
    startsAt: serverTimestamp(),
    endsAt: null,
  });
  memberIds.forEach((memberId, index) => {
    const assignmentId = `a-${memberId}`;
    batch.set(doc(db, "rooms", roomId, "assignments", assignmentId), {
      id: assignmentId,
      roomId,
      roundId,
      giverId: null,
      receiverId: memberId,
      missionId: missions[index].id,
      order: 1,
      createdAt: serverTimestamp(),
    });
  });
  batch.update(doc(db, "rooms", roomId), { status: "playing", phase: "play" });
  await batch.commit();
}

// ---------- 초대 ----------
const INVITE_LIFETIME_MS = 24 * 60 * 60 * 1000; // 초대 링크 유효 시간: 24시간

// 방장만 호출한다. 이전 초대 링크는 모두 폐기하고 새 링크 코드를 만든다.
export async function renewInvite(roomId: string, uid: string): Promise<string> {
  const { db } = getFirebase();
  const invitesRef = collection(db, "rooms", roomId, "invites");
  const previous = await getDocs(invitesRef);
  const code = generateInviteCode();

  const batch = writeBatch(db);
  previous.docs.forEach((old) => batch.delete(old.ref));
  batch.set(doc(invitesRef, code), {
    code,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + INVITE_LIFETIME_MS)),
  });
  await batch.commit();
  return code;
}

// 방장만 호출한다. 모든 초대 링크를 폐기한다.
export async function revokeInvites(roomId: string): Promise<void> {
  const { db } = getFirebase();
  const previous = await getDocs(collection(db, "rooms", roomId, "invites"));
  const batch = writeBatch(db);
  previous.docs.forEach((old) => batch.delete(old.ref));
  await batch.commit();
}

// 가장 최근에 만든 초대 링크를 구독한다. (방장만 읽을 수 있다)
export function subscribeLatestInvite(
  roomId: string,
  onData: OnData<Invite | null>,
  onError: OnError,
): Unsubscribe {
  const { db } = getFirebase();
  const q = query(
    collection(db, "rooms", roomId, "invites"),
    orderBy("createdAt", "desc"),
    limit(1),
  );
  return onSnapshot(
    q,
    (snap) => {
      const d = snap.docs[0];
      onData(d ? toInvite(d.id, d.data(READ_OPTIONS)) : null);
    },
    onError,
  );
}

// 이미 방 멤버인지 확인한다. 멤버가 아니면 규칙이 읽기를 막으므로 false로 취급한다.
export async function checkMembership(
  roomId: string,
  uid: string,
): Promise<boolean> {
  const { db } = getFirebase();
  try {
    const snap = await getDoc(doc(db, "rooms", roomId, "members", uid));
    return snap.exists();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code.includes("permission-denied")) return false;
    throw error;
  }
}

// 초대 링크의 코드로 방에 참가한다.
// 코드가 틀렸거나 만료됐거나 이미 시작된 방이면 규칙이 거부한다. (permission-denied)
export async function joinRoom(
  uid: string,
  roomId: string,
  inviteCode: string,
  profile: { nickname: string; animal: string },
): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", uid),
    {
      id: uid,
      nickname: profile.nickname,
      animal: profile.animal,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(doc(db, "rooms", roomId, "members", uid), {
    id: uid,
    roomId,
    userId: uid,
    animal: profile.animal,
    isHost: false,
    joinedAt: serverTimestamp(),
    inviteCode,
  });
  await batch.commit();
}

// ---------- 사진 ----------
// 사진을 Storage에 올린 뒤 제출 문서를 만든다. 이미 제출했다면 같은 경로에 덮어써서 교체한다.
export async function submitPhoto(
  roomId: string,
  uid: string,
  assignmentId: string,
  photo: Blob,
): Promise<void> {
  const { db, storage } = getFirebase();
  const submissionId = `s-${assignmentId}`;
  const photoPath = `rooms/${roomId}/submissions/${uid}/${submissionId}.jpg`;

  await uploadBytes(ref(storage, photoPath), photo, {
    contentType: "image/jpeg",
  });
  await setDoc(doc(db, "rooms", roomId, "submissions", submissionId), {
    id: submissionId,
    assignmentId,
    ownerId: uid,
    photoPath,
    submittedAt: serverTimestamp(),
  });
}

// 다운로드 URL을 쓰지 않고, 로그인한 상태로 규칙을 거쳐 사진 데이터를 받는다.
export async function loadPhoto(photoPath: string): Promise<Blob> {
  const { storage } = getFirebase();
  return getBlob(ref(storage, photoPath));
}
