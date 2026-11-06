import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { getFirebase } from "../../../../src/lib/firebase/client";
import {
  subscribeMembers,
  type MemberProfile,
} from "../../../../src/lib/firebase/roomRepo";
import { getMission } from "../../../../src/lib/missions";
import type { GameMode, RoomData, Submission, VoteCategory } from "./types";

export const RESULTS_NOT_OPEN = "RESULTS_NOT_OPEN";

// ---------- 인터페이스 ----------
export interface ResultRepository {
  getRoomData(roomId: string, me: string): Promise<RoomData>;
  submitObjection(roomId: string, objectorId: string, submissionId: string): Promise<void>;
  submitObjectionDone(roomId: string, objectorId: string): Promise<void>;
  submitVote(
    roomId: string,
    voterId: string,
    category: VoteCategory,
    submissionId: string
  ): Promise<void>;
}

// 미션 id로 문구를 찾는다. 목록에 없으면(직접 작성한 미션 등) 기본 문구를 보여준다.
function missionTextOf(missionId: string): string {
  return getMission(missionId)?.text ?? "미션";
}

// =====================================================
// Firebase 구현
// votes:      rooms/{roomId}/votes/{voterId}_{funniest|hardest}
//             { id, roomId, voterId, awardType, submissionId, createdAt }
// objections: rooms/{roomId}/objections/{objectorId}_{submissionId}
//             { id, roomId, objectorId, submissionId, createdAt }
//             이의제기 완료 표시: {objectorId}_done  { id, roomId, objectorId, done: true, createdAt }
// =====================================================
const AWARD: Record<VoteCategory, "funniest" | "hardest"> = {
  funny: "funniest",
  hard: "hardest",
};

function isPermissionDenied(e: unknown) {
  return ((e as { code?: string }).code ?? "").includes("permission-denied");
}

function fetchMembers(roomId: string): Promise<MemberProfile[]> {
  return new Promise((resolve, reject) => {
    let done = false;
    const unsubscribe = subscribeMembers(
      roomId,
      (data) => {
        if (done) return;
        done = true;
        unsubscribe();
        resolve(data);
      },
      (error) => {
        if (done) return;
        done = true;
        unsubscribe();
        reject(error);
      }
    );
  });
}

const firebaseResultRepository: ResultRepository = {
  async getRoomData(roomId, me) {
    const { db } = getFirebase();
    try {
      const [roomSnap, members, subSnap, voteSnap, objSnap, asgSnap, roundSnap] =
        await Promise.all([
          getDoc(doc(db, "rooms", roomId)),
          fetchMembers(roomId),
          getDocs(collection(db, "rooms", roomId, "submissions")),
          getDocs(collection(db, "rooms", roomId, "votes")),
          getDocs(collection(db, "rooms", roomId, "objections")),
          getDocs(collection(db, "rooms", roomId, "assignments")),
          getDocs(collection(db, "rooms", roomId, "rounds")),
        ]);

      const room = roomSnap.data();
      const settings = (room?.settings ?? {}) as Record<string, unknown>;
      const mode = (settings.mode ?? "oneshot") as GameMode;
      const hostId = (room?.hostId ?? "") as string;
      // survivorCount는 아직 공용 모델에 없어서, 없으면 3으로 본다.
      const survivorCount =
        typeof settings.survivorCount === "number" ? settings.survivorCount : 3;
      const durationDays =
        typeof settings.durationDays === "number" ? settings.durationDays : null;

      const players = members.map((m) => ({
        id: m.player.id,
        nickname: m.nickname,
        emoji: m.player.animal,
      }));

      const roundIndexById: Record<string, number> = {};
      roundSnap.docs.forEach((d) => {
        roundIndexById[d.id] = Number(d.data().index ?? 1);
      });

      const asgInfo: Record<string, { missionId: string; roundId: string; order: number }> = {};
      asgSnap.docs.forEach((d) => {
        const a = d.data();
        asgInfo[d.id] = {
          missionId: a.missionId as string,
          roundId: a.roundId as string,
          order: Number(a.order ?? 1),
        };
      });

      const missionTexts: Record<string, string> = {};
      const submissions: Submission[] = subSnap.docs.map((d) => {
        const data = d.data({ serverTimestamps: "estimate" });
        const asg = asgInfo[data.assignmentId as string];
        missionTexts[d.id] = asg ? missionTextOf(asg.missionId) : "미션";
        return {
          id: d.id,
          playerId: data.ownerId as string,
          photoPath: data.photoPath as string,
          assignmentId: data.assignmentId as string,
          submittedAt:
            data.submittedAt instanceof Timestamp
              ? data.submittedAt.toMillis()
              : Date.now(),
          order: asg?.order ?? 1,
          roundIndex: asg ? roundIndexById[asg.roundId] ?? 1 : 1,
        };
      });

      const votes: RoomData["votes"] = { funny: {}, hard: {} };
      voteSnap.docs.forEach((d) => {
        const v = d.data();
        const category =
          v.awardType === "funniest" ? "funny" : v.awardType === "hardest" ? "hard" : null;
        if (category && typeof v.voterId === "string" && typeof v.submissionId === "string") {
          votes[category][v.voterId] = v.submissionId;
        }
      });

      const objections: RoomData["objections"] = {};
      const objectionDone: string[] = [];
      objSnap.docs.forEach((d) => {
        const o = d.data();
        if (typeof o.objectorId !== "string") return;
        if (o.done === true) {
          objectionDone.push(o.objectorId);
        } else if (typeof o.submissionId === "string") {
          (objections[o.submissionId] ??= []).push(o.objectorId);
        }
      });

      return {
        me, hostId, mode, players, submissions, votes, objections,
        objectionDone, missionTexts, survivorCount, durationDays,
      };
    } catch (e) {
      if (isPermissionDenied(e)) throw new Error(RESULTS_NOT_OPEN);
      throw e;
    }
  },

  async submitObjection(roomId, objectorId, submissionId) {
    const { db } = getFirebase();
    const id = `${objectorId}_${submissionId}`;
    await setDoc(doc(db, "rooms", roomId, "objections", id), {
      id,
      roomId,
      objectorId,
      submissionId,
      createdAt: serverTimestamp(),
    });
  },

  async submitObjectionDone(roomId, objectorId) {
    const { db } = getFirebase();
    const id = `${objectorId}_done`;
    await setDoc(doc(db, "rooms", roomId, "objections", id), {
      id,
      roomId,
      objectorId,
      done: true,
      createdAt: serverTimestamp(),
    });
  },

  async submitVote(roomId, voterId, category, submissionId) {
    const { db } = getFirebase();
    const awardType = AWARD[category];
    const id = `${voterId}_${awardType}`;
    await setDoc(doc(db, "rooms", roomId, "votes", id), {
      id,
      roomId,
      voterId,
      awardType,
      submissionId,
      createdAt: serverTimestamp(),
    });
  },
};

// =====================================================
// mock 구현 (서버 없이 화면만 테스트)
// 주소 뒤에 ?mode=race / ?mode=endless / ?mode=daily 를 붙이면 그 모드로 보인다.
// =====================================================
const MOCK_PLAYER_COUNT = 7; // 인원 수 테스트용 (제한 없음)
const NAMES: [string, string][] = [
  ["토끼", "🐰"], ["코알라", "🐨"], ["여우", "🦊"], ["곰", "🐻"],
  ["펭귄", "🐧"], ["판다", "🐼"], ["호랑이", "🐯"], ["고양이", "🐱"],
  ["강아지", "🐶"], ["개구리", "🐸"], ["사자", "🦁"], ["돼지", "🐷"],
];
const MOCK_MISSIONS = [
  "빨간 물건과 함께 사진 찍기", "처음 보는 간판 앞에서 포즈 취하기",
  "하늘이 나오게 점프 사진", "편의점 음료수 들고 건배", "그림자로 하트 만들기",
  "계단 위에서 승리 포즈", "나무와 셀카",
];
const BASE = 1_700_000_000_000;
const MODES: GameMode[] = ["daily", "oneshot", "race", "solo", "endless"];

function createMockStore(mode: GameMode): RoomData {
  const players = Array.from({ length: MOCK_PLAYER_COUNT }, (_, i) => {
    const [nickname, emoji] = NAMES[i % NAMES.length];
    return {
      id: `p${i + 1}`,
      nickname: i < NAMES.length ? nickname : `${nickname}${Math.floor(i / NAMES.length) + 1}`,
      emoji,
    };
  });
  const me = players[0].id;

  const submissions: Submission[] = [];
  const missionTexts: Record<string, string> = {};
  players.forEach((p, i) => {
    let steps = [1];
    if (mode === "endless") steps = Array.from({ length: 1 + ((i * 3) % 5) }, (_, k) => k + 1);
    if (mode === "daily") steps = [1, 2, 3, 4, 5, 6, 7].filter((day) => (i + day) % 4 !== 0);
    steps.forEach((step) => {
      const id = `s-${p.id}-${step}`;
      submissions.push({
        id,
        playerId: p.id,
        photoPath: "",
        assignmentId: `a-${p.id}-${step}`,
        submittedAt: BASE + ((i * 7) % 11) * 60_000 + i * 1000 + (step - 1) * 3_600_000,
        order: mode === "daily" ? 1 : step,
        roundIndex: mode === "daily" ? step : 1,
      });
      missionTexts[id] = MOCK_MISSIONS[(i + step) % MOCK_MISSIONS.length];
    });
  });

  // 데모: p5의 첫 제출물은 4명이 반대 → 과반(7명 중 4명)이라 실패 처리
  const objections: RoomData["objections"] =
    mode === "daily" ? {} : { "s-p5-1": ["p2", "p3", "p4", "p6"] };
  // 나를 뺀 모두 이의제기를 끝냈고 투표도 했다고 가정
  const objectionDone =
    mode === "daily" ? players.map((p) => p.id) : players.filter((p) => p.id !== me).map((p) => p.id);

  const votes: RoomData["votes"] = { funny: {}, hard: {} };
  players.forEach((voter, i) => {
    if (voter.id === me) return;
    const pool = submissions.filter((s) => s.playerId !== voter.id && s.id !== "s-p5-1");
    if (pool.length === 0) return;
    votes.funny[voter.id] = pool[(i * 3) % pool.length].id;
    votes.hard[voter.id] = pool[(i * 5) % pool.length].id;
  });

  return {
    me, hostId: me, mode, players, submissions, votes, objections,
    objectionDone, missionTexts, survivorCount: 3, durationDays: mode === "daily" ? 7 : null,
  };
}

const mockStores: Partial<Record<GameMode, RoomData>> = {};

function currentMode(): GameMode {
  if (typeof window === "undefined") return "oneshot";
  const m = new URLSearchParams(window.location.search).get("mode") as GameMode | null;
  return m && MODES.includes(m) ? m : "oneshot";
}
function getStore(): RoomData {
  const m = currentMode();
  return (mockStores[m] ??= createMockStore(m));
}
function setStore(next: RoomData) {
  mockStores[currentMode()] = next;
}

const mockResultRepository: ResultRepository = {
  async getRoomData() {
    return structuredClone(getStore());
  },
  async submitObjection(_r, objectorId, submissionId) {
    const s = getStore();
    const list = s.objections[submissionId] ?? [];
    if (!list.includes(objectorId)) {
      setStore({ ...s, objections: { ...s.objections, [submissionId]: [...list, objectorId] } });
    }
  },
  async submitObjectionDone(_r, objectorId) {
    const s = getStore();
    if (!s.objectionDone.includes(objectorId)) {
      setStore({ ...s, objectionDone: [...s.objectionDone, objectorId] });
    }
  },
  async submitVote(_r, voterId, category, submissionId) {
    const s = getStore();
    setStore({
      ...s,
      votes: { ...s.votes, [category]: { ...s.votes[category], [voterId]: submissionId } },
    });
  },
};

// .env.local에 NEXT_PUBLIC_USE_MOCK="true"를 넣으면 가짜 데이터로 동작
export const resultRepository: ResultRepository =
  process.env.NEXT_PUBLIC_USE_MOCK === "true"
    ? mockResultRepository
    : firebaseResultRepository;