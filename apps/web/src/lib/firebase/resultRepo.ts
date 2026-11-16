import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import type { Vote, VoteCategory } from "@pawpaw/shared";
import { describeAssignmentMission } from "../missions";
import { getFirebase } from "./client";
import { subscribeMembers, type MemberProfile } from "./roomRepo";

// ---------- 결과 화면용 타입 (저장 모델이 아니라 화면에서 쓰기 좋게 모은 형태) ----------
// mission: 이 친구가 받은 미션 본문 (투표할 때 사진과 함께 보여준다)
export type ResultPlayer = { id: string; nickname: string; animal: string; mission?: string }; // animal: 동물 id (lib/animals)
// photoPath: Storage의 인증 사진 경로. 결과가 열린 뒤에는 같은 방 멤버가 읽을 수 있다.
export type ResultSubmission = { playerId: string; submittedAt: number; photoPath?: string };
// { funny: { 투표한사람id: 고른사람id }, hard: { ... } }
export type ResultVotes = Record<VoteCategory, Record<string, string>>;

export type ResultData = {
  me: string; // 지금 접속한 사람 id
  players: ResultPlayer[]; // 인원 수 제한 없음
  submissions: ResultSubmission[];
  votes: ResultVotes;
};
// 결과 공개 전이거나 방 멤버가 아니라서 규칙이 막은 경우
export const RESULTS_NOT_OPEN = "RESULTS_NOT_OPEN";

// ---------- 인터페이스 ----------
export interface ResultRepository {
  getRoomData(roomId: string, me: string): Promise<ResultData>;
  submitVote(
    roomId: string,
    voterId: string,
    category: VoteCategory,
    targetId: string
  ): Promise<void>;
}

// =====================================================
// Firebase 구현 (실제 서버)
// 저장 위치: rooms/{roomId}/votes/{voterId}_{category}
//   { id, voterId, category, targetId, createdAt }
// =====================================================
function isPermissionDenied(e: unknown) {
  return ((e as { code?: string }).code ?? "").includes("permission-denied");
}

// 친구의 subscribeMembers를 한 번만 받아서 쓴다. (닉네임 포함)
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
      const [members, subSnap, voteSnap, assignSnap] = await Promise.all([
        fetchMembers(roomId),
        getDocs(collection(db, "rooms", roomId, "submissions")),
        getDocs(collection(db, "rooms", roomId, "votes")),
        getDocs(collection(db, "rooms", roomId, "assignments")),
      ]);

      // 받는 사람 id → 미션 본문
      const missionOf = new Map<string, string>();
      assignSnap.docs.forEach((d) => {
        const a = d.data();
        const view = describeAssignmentMission({
          missionId: a.missionId ?? null,
          missionText: typeof a.missionText === "string" ? a.missionText : undefined,
        });
        if (typeof a.receiverId === "string" && view) missionOf.set(a.receiverId, view.text);
      });

      const players = members.map((m) => ({
        id: m.player.id, // Firebase Auth uid
        nickname: m.nickname,
        animal: m.player.animal,
        mission: missionOf.get(m.player.id),
      }));

      const submissions = subSnap.docs.map((d) => {
        const data = d.data({ serverTimestamps: "estimate" });
        return {
          playerId: data.ownerId as string,
          photoPath: typeof data.photoPath === "string" ? data.photoPath : undefined,
          submittedAt:
            data.submittedAt instanceof Timestamp
              ? data.submittedAt.toMillis()
              : Date.now(),
        };
      });

      const votes: ResultData["votes"] = { funny: {}, hard: {} };
      voteSnap.docs.forEach((d) => {
        const v = d.data();
        if (
          (v.category === "funny" || v.category === "hard") &&
          typeof v.voterId === "string" &&
          typeof v.targetId === "string"
        ) {
          votes[v.category as VoteCategory][v.voterId] = v.targetId;
        }
      });

      return { me, players, submissions, votes };
    } catch (e) {
      if (isPermissionDenied(e)) throw new Error(RESULTS_NOT_OPEN);
      throw e;
    }
  },

  async submitVote(roomId, voterId, category, targetId) {
    const { db } = getFirebase();
    // 문서 ID를 고정해서 같은 항목에 두 번 투표할 수 없게 한다. (규칙상 수정 불가)
    const voteId = `${voterId}_${category}`;
    const vote = { id: voteId, voterId, category, targetId } satisfies Omit<Vote, "createdAt">;
    await setDoc(doc(db, "rooms", roomId, "votes", voteId), {
      ...vote,
      createdAt: serverTimestamp(),
    });
  },
};

// =====================================================
// mock 구현 (서버 없이 화면만 테스트할 때)
// =====================================================
const MOCK_PLAYER_COUNT = 7; // 이 숫자만 바꿔서 인원 수 테스트 (제한 없음)
// 닉네임과 동물 id. 동물은 lib/animals에 있는 10종을 쓴다.
const NAMES: [string, string][] = [
  ["다람이", "squirrel"], ["오리", "duck"], ["여우", "fox"], ["냥이", "cat"],
  ["멍멍", "dog"], ["펭귄", "penguin"], ["사슴", "deer"], ["호랑이", "tiger"],
  ["판다", "panda"], ["꿀꿀", "pig"],
];
const BASE = 1_700_000_000_000;

function createMockStore(): ResultData {
  const players = Array.from({ length: MOCK_PLAYER_COUNT }, (_, i) => {
    const [nickname, animal] = NAMES[i % NAMES.length];
    return {
      id: `p${i + 1}`,
      nickname: i < NAMES.length ? nickname : `${nickname}${Math.floor(i / NAMES.length) + 1}`,
      animal,
      mission: ["하늘 사진 찍기", "가장 웃긴 표정 짓기", "초록색 물건 찾기"][i % 3],
    };
  });
  const submissions = players.map((p, i) => ({
    playerId: p.id,
    submittedAt: BASE + ((i * 7) % 11) * 60_000 + i * 1000,
  }));
  const me = players[0].id;

  const votes: ResultData["votes"] = { funny: {}, hard: {} };
  players.forEach((voter, i) => {
    if (voter.id === me || players.length < 2) return;
    const pick = (offset: number) => {
      const others = players.filter((p) => p.id !== voter.id);
      return others[(i * offset) % others.length].id;
    };
    votes.funny[voter.id] = pick(3);
    votes.hard[voter.id] = pick(5);
  });

  return { me, players, submissions, votes };
}

let mockStore = createMockStore();

const mockResultRepository: ResultRepository = {
  async getRoomData() {
    return structuredClone(mockStore);
  },
  async submitVote(_roomId, voterId, category, targetId) {
    mockStore = {
      ...mockStore,
      votes: {
        ...mockStore.votes,
        [category]: { ...mockStore.votes[category], [voterId]: targetId },
      },
    };
  },
};

// .env.local에 NEXT_PUBLIC_USE_MOCK="true"를 넣으면 가짜 데이터로 동작한다.
export const resultRepository: ResultRepository =
  process.env.NEXT_PUBLIC_USE_MOCK === "true"
    ? mockResultRepository
    : firebaseResultRepository;