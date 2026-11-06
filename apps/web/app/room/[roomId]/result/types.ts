import type { GameMode } from "@pawpaw/shared";

export type { GameMode };

export type Player = { id: string; nickname: string; emoji: string };

export type Submission = {
  id: string;
  playerId: string; // 제출한 사람
  photoPath: string; // Storage 경로 (mock은 빈 문자열)
  assignmentId: string;
  submittedAt: number; // ms
};

export type VoteCategory = "funny" | "hard";
// { funny: { 투표한사람id: 고른 제출물id }, hard: { ... } }
export type Votes = Record<VoteCategory, Record<string, string>>;

export type RoomData = {
  me: string;
  hostId: string;
  mode: GameMode;
  players: Player[]; // 인원 수 제한 없음
  submissions: Submission[];
  votes: Votes;
  objections: Record<string, string[]>; // 제출물id → 반대한 사람 id들
  objectionDone: string[]; // 이의제기를 끝낸 사람 id들
  missionTexts: Record<string, string>; // 제출물id → 미션 문구
};