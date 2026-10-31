export type Player = { id: string; nickname: string; emoji: string };
export type Submission = { playerId: string; submittedAt: number };
export type VoteCategory = "funny" | "hard";
// { funny: { 투표한사람id: 고른사람id }, hard: { ... } }
export type Votes = Record<VoteCategory, Record<string, string>>;

export type RoomData = {
  me: string; // 지금 접속한 사람 id
  players: Player[]; // 인원 수 제한 없음
  submissions: Submission[];
  votes: Votes;
};