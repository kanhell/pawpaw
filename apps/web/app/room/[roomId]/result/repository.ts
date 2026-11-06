import {
  collection,
  doc,
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
import type { RoomData, VoteCategory } from "./types";

// 결과 공개 전이거나 방 멤버가 아니라서 규칙이 막은 경우
export const RESULTS_NOT_OPEN = "RESULTS_NOT_OPEN";

// ---------- 인터페이스 ----------
export interface ResultRepository {
  getRoomData(roomId: string, me: string): Promise<RoomData>;
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
      const [members, subSnap, voteSnap] = await Promise.all([
        fetchMembers(roomId),
        getDocs(collection(db, "rooms", roomId, "submissions")),
        getDocs(collection(db, "rooms", roomId, "votes")),
      ]);

      const players = members.map((m) => ({
        id: m.player.id, // Firebase Auth uid
        nickname: m.nickname,
        emoji: m.player.animal, // 지금은 이모지. 캐릭터 이미지로 바뀌면 여기만 교체
      }));

      const submissions = subSnap.docs.map((d) => {
        const data = d.data({ serverTimestamps: "estimate" });
        return {
          playerId: data.ownerId as string,
          submittedAt:
            data.submittedAt instanceof Timestamp
              ? data.submittedAt.toMillis()
              : Date.now(),
        };
      });

      const votes: RoomData["votes"] = { funny: {}, hard: {} };
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
    await setDoc(doc(db, "rooms", roomId, "votes", voteId), {
      id: voteId,
      voterId,
      category,
      targetId,
      createdAt: serverTimestamp(),
    });
  },
};

// =====================================================
// mock 구현 (서버 없이 화면만 테스트할 때)
// =====================================================
const MOCK_PLAYER_COUNT = 7; // 이 숫자만 바꿔서 인원 수 테스트 (제한 없음)
const NAMES: [string, string][] = [
  ["토끼", "🐰"], ["코알라", "🐨"], ["여우", "🦊"], ["곰", "🐻"],
  ["펭귄", "🐧"], ["판다", "🐼"], ["호랑이", "🐯"], ["고양이", "🐱"],
  ["강아지", "🐶"], ["개구리", "🐸"], ["사자", "🦁"], ["돼지", "🐷"],
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
  const submissions = players.map((p, i) => ({
    playerId: p.id,
    submittedAt: BASE + ((i * 7) % 11) * 60_000 + i * 1000,
  }));
  const me = players[0].id;

  const votes: RoomData["votes"] = { funny: {}, hard: {} };
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