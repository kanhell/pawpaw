
import type { GameMode, RoomData, VoteCategory } from "./types";

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

// 미션 문구 가져오기. 친구의 src/lib/missions.ts 구조를 확인하면 여기만 연결하면 돼요.
function missionTextOf(missionId: string): string {
  return `미션 (${missionId})`; // TODO: missions.ts에서 id로 문구 찾기
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
      const [roomSnap, members, subSnap, voteSnap, objSnap, asgSnap] = await Promise.all([
        getDoc(doc(db, "rooms", roomId)),
        fetchMembers(roomId),
        getDocs(collection(db, "rooms", roomId, "submissions")),
        getDocs(collection(db, "rooms", roomId, "votes")),
        getDocs(collection(db, "rooms", roomId, "objections")),
        getDocs(collection(db, "rooms", roomId, "assignments")),
      ]);

      const room = roomSnap.data();
      const mode = (room?.settings?.mode ?? "oneshot") as GameMode;
      const hostId = (room?.hostId ?? "") as string;

      const players = members.map((m) => ({
        id: m.player.id,
        nickname: m.nickname,
        emoji: m.player.animal,
      }));

      const missionIdByAssignment: Record<string, string> = {};
      asgSnap.docs.forEach((d) => {
        missionIdByAssignment[d.id] = d.data().missionId as string;
      });

      const missionTexts: Record<string, string> = {};
      const submissions = subSnap.docs.map((d) => {
        const data = d.data({ serverTimestamps: "estimate" });
        const missionId = missionIdByAssignment[data.assignmentId as string];
        missionTexts[d.id] = missionId ? missionTextOf(missionId) : "미션";
        return {
          id: d.id,
          playerId: data.ownerId as string,
          photoPath: data.photoPath as string,
          assignmentId: data.assignmentId as string,
          submittedAt:
            data.submittedAt instanceof Timestamp
              ? data.submittedAt.toMillis()
              : Date.now(),
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

      return { me, hostId, mode, players, submissions, votes, objections, objectionDone, missionTexts };
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

function createMockStore(): RoomData {
  const players = Array.from({ length: MOCK_PLAYER_COUNT }, (_, i) => {
    const [nickname, emoji] = NAMES[i % NAMES.length];
    return {
      id: `p${i + 1}`,
      nickname: i < NAMES.length ? nickname : `${nickname}${Math.floor(i / NAMES.length) + 1}`,
      emoji,
    };
  });
  const me = players[0].id;
  const submissions = players.map((p, i) => ({
    id: `s-${p.id}`,
    playerId: p.id,
    photoPath: "",
    assignmentId: `a-${p.id}`,
    submittedAt: BASE + ((i * 7) % 11) * 60_000 + i * 1000,
  }));
  const missionTexts: Record<string, string> = {};
  submissions.forEach((s, i) => (missionTexts[s.id] = MOCK_MISSIONS[i % MOCK_MISSIONS.length]));

  // 데모: p5의 제출물은 4명이 반대 → 과반(7명 중 4명)이라 실패 처리
  const objections: RoomData["objections"] = { "s-p5": ["p2", "p3", "p4", "p6"] };
  // 나를 뺀 모두 이의제기를 끝냈고 투표도 했다고 가정
  const objectionDone = players.filter((p) => p.id !== me).map((p) => p.id);

  const votes: RoomData["votes"] = { funny: {}, hard: {} };
  players.forEach((voter, i) => {
    if (voter.id === me) return;
    const others = submissions.filter((s) => s.playerId !== voter.id && s.id !== "s-p5");
    votes.funny[voter.id] = others[(i * 3) % others.length].id;
    votes.hard[voter.id] = others[(i * 5) % others.length].id;
  });

  return { me, hostId: me, mode: "oneshot", players, submissions, votes, objections, objectionDone, missionTexts };
}

let mockStore = createMockStore();

const mockResultRepository: ResultRepository = {
  async getRoomData() {
    return structuredClone(mockStore);
  },
  async submitObjection(_r, objectorId, submissionId) {
    const list = mockStore.objections[submissionId] ?? [];
    if (!list.includes(objectorId)) {
      mockStore = {
        ...mockStore,
        objections: { ...mockStore.objections, [submissionId]: [...list, objectorId] },
      };
    }
  },
  async submitObjectionDone(_r, objectorId) {
    if (!mockStore.objectionDone.includes(objectorId)) {
      mockStore = { ...mockStore, objectionDone: [...mockStore.objectionDone, objectorId] };
    }
  },
  async submitVote(_r, voterId, category, submissionId) {
    mockStore = {
      ...mockStore,
      votes: { ...mockStore.votes, [category]: { ...mockStore.votes[category], [voterId]: submissionId } },
    };
  },
};

// .env.local에 NEXT_PUBLIC_USE_MOCK="true"를 넣으면 가짜 데이터로 동작
export const resultRepository: ResultRepository =
  process.env.NEXT_PUBLIC_USE_MOCK === "true"
    ? mockResultRepository
    : firebaseResultRepository;