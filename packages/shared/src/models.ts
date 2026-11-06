export type Timestamp = string; // ISO 8601

export type AnimalCharacter = string; // 목록 확정 시 union으로 교체

// ---------- 열거형 ----------
export type GameMode = 'daily' | 'oneshot' | 'race' | 'solo' | 'endless';
// 매일매일 / 일회성 / 선착순 / 1인모드 / 무한미션

export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type RoomPhase = 'settings' | 'assign' | 'reveal' | 'play' | 'waitResult'; // status가 playing일 때만

export type MissionAssigner = 'players' | 'app'; // 서로 정해주기 / 앱이 정해주기
export type MissionVisibility = 'public' | 'private'; // 미리 전체 공개 / 본인만 확인
export type MissionScope = 'same' | 'different'; // 전체 동일 / 각자 다름

// 시상 종류 (목록은 확정 아님)
export type AwardType =
  | 'podium'
  | 'fastest'
  | 'mostCompleted'
  | 'bestMission'
  | 'funniest'
  | 'hardest'
  | 'bestPhoto'
  | 'challenger';

export type AwardBasis = 'metric' | 'vote'; // 정량 결과 / 투표

// ---------- 엔티티 ----------
export interface User {
  id: string;
  nickname: string;
  animal: AnimalCharacter; // 기본 캐릭터
  createdAt: Timestamp;
}

export interface RoomSettings {
  mode: GameMode;
  assigner: MissionAssigner;
  visibility: MissionVisibility;
  scope: MissionScope;
  durationDays: number | null; // daily: 진행 일수
  timeLimitSec: number | null; // endless: 제한 시간
}

export interface Room {
  id: string;
  hostId: string; // 방장의 User.id (= Firebase Auth uid)
  settings: RoomSettings;
  status: RoomStatus;
  phase: RoomPhase | null;
  deadlineAt: Timestamp | null; // 미션 수행 마감
  resultAt: Timestamp | null; // 결과 공개 시각(n시)
  createdAt: Timestamp;
}

export interface Player {
  id: string;
  roomId: string;
  userId: string;
  animal: AnimalCharacter; // 방에서 선택한 캐릭터
  isHost: boolean;
  joinedAt: Timestamp;
  assignmentDone?: boolean; // 직접 부여 단계에서 내가 정해줄 미션을 모두 정했는지. 없으면 false
  submitted?: boolean; // 미션 사진을 제출했는지. 다른 멤버에게도 보인다(사진은 아님). 없으면 false
}

export interface Round {
  id: string;
  roomId: string;
  index: number; // 1부터
  startsAt: Timestamp;
  endsAt: Timestamp | null;
}

export interface Mission {
  id: string;
  text: string;
  category: string;
  difficulty: number;
  source: 'preset' | 'player';
  createdBy: string | null; // 직접 작성한 Player.id
}

export interface Assignment {
  id: string;
  roomId: string;
  roundId: string;
  giverId: string | null; // Player.id, 앱이 정한 경우 null. '모두 같은 미션'을 직접 정했다면 방장
  receiverId: string; // Player.id
  missionId: string | null; // 기본 제공 미션 id. 직접 정한 미션이면 null
  missionText?: string; // 직접 정한 미션 본문(1~60자). missionId와 둘 중 하나만 있다
  order: number; // 무한미션의 순서, 그 외는 1
  createdAt: Timestamp;
}

export interface Submission {
  id: string;
  assignmentId: string;
  ownerId: string; // 제출한 Player.id (= Firebase Auth uid)
  // 사진의 저장 경로. 다운로드 URL은 저장하지 않는다. (docs/SECURITY.md 참고)
  // 형식: rooms/{roomId}/submissions/{ownerId}/{submissionId}.jpg
  photoPath: string;
  submittedAt: Timestamp;
}

export interface Vote {
  id: string;
  roomId: string;
  voterId: string; // Player.id
  awardType: AwardType;
  submissionId: string;
  createdAt: Timestamp;
}

export interface Award {
  id: string;
  roomId: string;
  type: AwardType;
  playerId: string; // 수상자
  submissionId: string | null;
  basis: AwardBasis;
  rank: 1 | 2 | 3 | null; // podium일 때 등수
  comment: string | null;
  createdAt: Timestamp;
}

// 친구 초대 링크용 코드. 링크: /invite/{roomId}/{code}
// 코드는 24자 영숫자이며 방장만 만들고 조회·폐기할 수 있다.
export interface Invite {
  code: string;
  createdBy: string; // 방장의 User.id
  createdAt: Timestamp;
  expiresAt: Timestamp;
}
