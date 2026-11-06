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
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { getBlob, ref, uploadBytes } from "firebase/storage";
import type {
  Assignment,
  GameMode,
  Invite,
  MissionScope,
  Player,
  Room,
  RoomSettings,
  Submission,
} from "@pawpaw/shared";
import { generateInviteCode } from "../invite/code";
import { MISSION_TEXT_MAX, pickDistinctMissions } from "../missions";
import { DEFAULT_MODE, buildRoomSettings } from "../modes";
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
    ...(d.assignmentDone === true ? { assignmentDone: true } : {}),
    ...(d.submitted === true ? { submitted: true } : {}),
  };
}

function toAssignment(id: string, d: DocumentData): Assignment {
  return {
    id,
    roomId: d.roomId,
    roundId: d.roundId,
    giverId: d.giverId ?? null,
    receiverId: d.receiverId,
    missionId: d.missionId ?? null,
    ...(typeof d.missionText === "string" ? { missionText: d.missionText } : {}),
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
// 모드는 방을 만들 때만 정해지고 이후에는 바꿀 수 없다. (규칙이 막는다)
export async function createRoom(
  uid: string,
  profile: { nickname: string; animal: string },
  mode: GameMode = DEFAULT_MODE,
): Promise<string> {
  const { db } = getFirebase();
  const roomRef = doc(collection(db, "rooms"));
  const roomId = roomRef.id;

  const settings: RoomSettings = buildRoomSettings(mode);

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

// ---------- 게임 설정 (방장) ----------
// mode는 바꿀 수 없으므로 포함하지 않는다.
export type RoomSettingsPatch = Partial<
  Pick<
    RoomSettings,
    "assigner" | "visibility" | "scope" | "durationDays" | "timeLimitSec"
  >
>;

// 게임 시작: 설정 단계로 들어간다. playing이 되면 새 참가는 받지 않는다. (규칙: 참가는 waiting일 때만)
export async function startSettingsPhase(roomId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "rooms", roomId), {
    status: "playing",
    phase: "settings",
  });
}

// 미션 부여 방법 같은 설정을 바꾼다. settings 하위 필드만 건드린다.
export async function updateRoomSettings(
  roomId: string,
  patch: RoomSettingsPatch,
): Promise<void> {
  const updates: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) updates[`settings.${key}`] = value;
  }
  if (Object.keys(updates).length === 0) return;
  const { db } = getFirebase();
  await updateDoc(doc(db, "rooms", roomId), updates);
}

// 결과 공개 시각. 규칙이 Timestamp 타입을 비교하므로 Timestamp로 저장한다.
export async function updateResultAt(
  roomId: string,
  resultAt: Date,
): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "rooms", roomId), {
    resultAt: Timestamp.fromDate(resultAt),
  });
}

// 결과 공개 시각을 비운다. (시각을 정하지 않는 모드에서만 쓴다. 비우면 방장이 직접 공개한다)
export async function clearResultAt(roomId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "rooms", roomId), { resultAt: null });
}

// 설정을 마치고 미션지정 단계로 넘어간다.
export async function finishSettingsPhase(roomId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "rooms", roomId), { phase: "assign" });
}

// ---------- 미션 부여 (방장) ----------
// 모든 멤버에게 임의 미션을 부여한다. (앱이 정하는 방식: giverId = null)
// scope가 'same'이면 모두에게 같은 미션 하나를, 'different'이면 서로 겹치지 않는 미션을 준다.
// 미션이 인원보다 모자라 겹칠 수밖에 없으면 MissionPoolError를 던진다. (아무것도 저장하지 않는다)
export async function assignRandomMissions(
  roomId: string,
  memberIds: string[],
  scope: MissionScope = "different",
): Promise<void> {
  const { db } = getFirebase();
  const missions = pickDistinctMissions(scope === "same" ? 1 : memberIds.length);
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
      missionId: missions[scope === "same" ? 0 : index].id,
      order: 1,
      createdAt: serverTimestamp(),
    });
  });
  batch.update(doc(db, "rooms", roomId), { status: "playing", phase: "play" });
  await batch.commit();
}

// ---------- 미션 직접 부여 (docs/MISSION_ASSIGN.md) ----------
const FIRST_ROUND_ID = "r1";

// 방 안의 모든 미션 배정을 구독한다. 미션을 전체 공개(public)로 정한 방에서만 규칙이 허용한다.
export function subscribeRoomAssignments(
  roomId: string,
  onData: OnData<Assignment[]>,
  onError: OnError,
): Unsubscribe {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, "rooms", roomId, "assignments"),
    (snap) =>
      onData(snap.docs.map((d) => toAssignment(d.id, d.data(READ_OPTIONS)))),
    onError,
  );
}

function cleanMissionText(text: string): string {
  const value = text.trim();
  if (value.length < 1 || value.length > MISSION_TEXT_MAX) {
    throw new Error(`미션은 1~${MISSION_TEXT_MAX}자로 적어 주세요.`);
  }
  return value;
}

// 내가 receiverId에게 줄 미션을 정한다. 정했다는 표시(assignmentDone)도 함께 저장한다.
export async function giveMission(
  roomId: string,
  giverId: string,
  receiverId: string,
  missionText: string,
): Promise<void> {
  const text = cleanMissionText(missionText);
  const { db } = getFirebase();
  const assignmentId = `a-${receiverId}`;

  const batch = writeBatch(db);
  batch.set(doc(db, "rooms", roomId, "assignments", assignmentId), {
    id: assignmentId,
    roomId,
    roundId: FIRST_ROUND_ID,
    giverId,
    receiverId,
    missionText: text,
    order: 1,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "rooms", roomId, "members", giverId), {
    assignmentDone: true,
  });
  await batch.commit();
}

// '모두 같은 미션'일 때 방장이 모두에게 줄 미션 하나를 정한다.
export async function giveMissionToAll(
  roomId: string,
  hostId: string,
  memberIds: string[],
  missionText: string,
): Promise<void> {
  const text = cleanMissionText(missionText);
  const { db } = getFirebase();

  const batch = writeBatch(db);
  memberIds.forEach((memberId) => {
    const assignmentId = `a-${memberId}`;
    batch.set(doc(db, "rooms", roomId, "assignments", assignmentId), {
      id: assignmentId,
      roomId,
      roundId: FIRST_ROUND_ID,
      giverId: hostId,
      receiverId: memberId,
      missionText: text,
      order: 1,
      createdAt: serverTimestamp(),
    });
  });
  batch.update(doc(db, "rooms", roomId, "members", hostId), {
    assignmentDone: true,
  });
  await batch.commit();
}

// 모두 정했으면 방장이 미션을 공개한다. (미션지정 → 미션 진행)
export async function revealMissions(roomId: string): Promise<void> {
  const { db } = getFirebase();
  const batch = writeBatch(db);
  batch.set(doc(db, "rooms", roomId, "rounds", FIRST_ROUND_ID), {
    id: FIRST_ROUND_ID,
    roomId,
    index: 1,
    startsAt: serverTimestamp(),
    endsAt: null,
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

// ---------- 제출 현황과 결과 공개 (docs/RESULT_REVEAL.md) ----------
// 내가 사진을 제출했다는 표시를 내 멤버 문서에 남긴다. 다른 멤버는 이 표시로 "제출했는지"만 알 수 있다.
// 사진이나 사진 경로는 담지 않는다. 규칙이 내 제출 문서가 있을 때만 허용한다.
export async function markSubmitted(roomId: string, uid: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "rooms", roomId, "members", uid), { submitted: true });
}

// 방장이 정해 둔 결과 시각(resultAt)이 되기 전에 결과를 먼저 공개한다.
// 결과 시각과 마감 시각을 지금으로 바꾸므로, 규칙에 따라 같은 방 멤버가 사진을 볼 수 있게 되고
// 더 이상 제출할 수 없다. 되돌릴 수 없다.
export async function revealResultsNow(roomId: string): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "rooms", roomId), {
    status: "finished",
    phase: null,
    resultAt: serverTimestamp(),
    deadlineAt: serverTimestamp(),
  });
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
