import type { RoomData, VoteCategory } from "./types";

// ---------- 인터페이스: 친구가 Firebase로 구현할 부분 ----------
export interface ResultRepository {
  getRoomData(roomId: string): Promise<RoomData>;
  submitVote(
    roomId: string,
    voterId: string,
    category: VoteCategory,
    targetId: string
  ): Promise<void>;
}

// ---------- mock 구현 (서버 연결 전까지 사용) ----------
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

  // 나를 뺀 친구들은 이미 투표했다고 가정 (자기 자신 제외, 서로 다르게 분산)
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

let store = createMockStore();

export const resultRepository: ResultRepository = {
  async getRoomData() {
    return structuredClone(store);
  },
  async submitVote(_roomId, voterId, category, targetId) {
    store = {
      ...store,
      votes: {
        ...store.votes,
        [category]: { ...store.votes[category], [voterId]: targetId },
      },
    };
  },
};