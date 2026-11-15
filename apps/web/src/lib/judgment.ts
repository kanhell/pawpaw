// 미션 구경의 '인정 투표' 판정. (docs/RESULT_REVEAL.md)
// - 붐따가 그 친구를 뺀 멤버의 30% 이상이면 인정 투표가 열린다. (붐따는 자기 자신에게 누를 수 없다)
// - 인정 투표는 본인을 포함한 모든 멤버가 한다.
// - 불인정이 과반이면 미션 실패, 인정이 절반 이상이면 인정이다.
// - 결과 화면에 들어온 사람이 모두 투표했는데도 갈리지 않으면 인정으로 본다. (안 들어온 친구 때문에 멈추지 않게)

export const BOOM_THRESHOLD = 0.3;

export type JudgmentState =
  | "none" // 붐따가 모자라 인정 투표가 열리지 않았다
  | "voting" // 인정 투표 중
  | "failed" // 미션 실패
  | "accepted"; // 인정

export interface JudgmentCounts {
  boomBase: number; // 붐따를 누를 수 있는 사람 수 (그 친구를 뺀 멤버 수)
  voterCount: number; // 인정 투표를 하는 사람 수 (본인 포함 모든 멤버)
  booms: number;
  accepts: number;
  rejects: number;
  allPresentVoted: boolean; // 결과 화면에 들어온 사람이 모두 투표했는가
}

// 인정 투표가 열리는 붐따 수
export function boomsNeeded(boomBase: number): number {
  return Math.max(1, Math.ceil(boomBase * BOOM_THRESHOLD));
}

export function judgmentState(c: JudgmentCounts): JudgmentState {
  if (c.boomBase <= 0 || c.booms < boomsNeeded(c.boomBase)) return "none";
  if (c.rejects * 2 > c.voterCount) return "failed";
  if (c.accepts * 2 >= c.voterCount) return "accepted";
  if (c.allPresentVoted) return "accepted";
  return "voting";
}

export interface JudgmentRecord {
  targetId: string;
  voterId: string;
  accept: boolean;
}

// 친구 한 명의 판정에 필요한 숫자를 모은다.
export function countFor(
  targetId: string,
  playerIds: readonly string[],
  enteredIds: ReadonlySet<string>,
  booms: readonly { targetId: string }[],
  judgments: readonly JudgmentRecord[],
): JudgmentCounts {
  const mine = judgments.filter((j) => j.targetId === targetId && playerIds.includes(j.voterId));
  const votedIds = new Set(mine.map((j) => j.voterId));
  return {
    boomBase: playerIds.filter((id) => id !== targetId).length,
    voterCount: playerIds.length,
    booms: booms.filter((b) => b.targetId === targetId).length,
    accepts: mine.filter((j) => j.accept).length,
    rejects: mine.filter((j) => !j.accept).length,
    allPresentVoted: playerIds.filter((id) => enteredIds.has(id)).every((id) => votedIds.has(id)),
  };
}
