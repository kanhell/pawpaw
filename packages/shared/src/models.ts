export type Timestamp = string; // ISO 8601

export type AnimalCharacter = string; // 목록 확정 시 union으로 교체

// ---------- 열거형 ----------
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

// 투표로 정하는 시상 항목: 가장 웃긴 미션 / 가장 어려운 미션
export type VoteCategory = 'funny' | 'hard';

// ---------- 엔티티 ----------
export interface User {
  id: string;
  nickname: string;
  animal: AnimalCharacter; // 기본 캐릭터
  createdAt: Timestamp;
}

// 결과 공개 방식: 정해진 시각(6·8·10시) / 직접 정한 시각 / 방장이 직접 공개 (resultAt 없음)
export type ResultMode = "preset" | "custom" | "host";

export interface RoomSettings {
  assigner: MissionAssigner;
  visibility: MissionVisibility;
  scope: MissionScope;
  resultMode?: ResultMode; // 없으면 아직 고르지 않았다
}

export interface Room {
  id: string;
  hostId: string; // 방장의 User.id (= Firebase Auth uid)
  settings: RoomSettings;
  status: RoomStatus;
  phase: RoomPhase | null;
  deadlineAt: Timestamp | null; // 미션 수행 마감
  resultAt: Timestamp | null; // 결과 공개 시각. 방장이 직접 공개하는 방식이면 공개할 때까지 null
  createdAt: Timestamp;
  // 참가한 멤버 수. 방장 1명으로 시작해 참가할 때마다 1씩 는다. (멤버는 나갈 수 없다)
  // 규칙은 멤버 수를 직접 셀 수 없어서, 게임 시작 인원(MIN_PLAYERS)을 이 값으로 확인한다.
  memberCount?: number;
  // 결과 화면의 '미션 구경'에서 지금 보여주는 친구 순번(0부터). 방장이 넘긴다.
  // 없으면 아직 시작 전(모두 들어오길 기다리는 중), 사진을 낸 친구 수 이상이면 구경이 끝나고 투표가 시작된다.
  showcaseIndex?: number;
  // 결과 화면의 시상식에서 지금 보여주는 상 순번(0부터). 방장이 넘기고 모두 같이 본다.
  // 없으면 아직 공개 전, 상 개수 이상이면 시상이 끝나고 결과 카드를 본다.
  awardIndex?: number;
}

/** 게임을 시작할 수 있는 최소 인원. 2명 이하로는 시작할 수 없다. (firestore.rules에도 같은 값) */
export const MIN_PLAYERS = 3;

export interface Player {
  id: string;
  roomId: string;
  userId: string;
  animal: AnimalCharacter; // 방에서 선택한 캐릭터
  isHost: boolean;
  joinedAt: Timestamp;
  assignmentDone?: boolean; // 직접 부여 단계에서 내가 정해줄 미션을 모두 정했는지. 없으면 false
  submitted?: boolean; // 미션 사진을 제출했는지. 다른 멤버에게도 보인다(사진은 아님). 없으면 false
  resultEntered?: boolean; // 결과가 열린 뒤 결과 화면에 들어왔는지. 모두 들어와야 미션 구경을 시작한다. 없으면 false
  // 미션 구경에서 '다음으로 넘기자'고 한 구경 순번(Room.showcaseIndex). 지금 순번과 같을 때만 센다.
  // 방장을 뺀 멤버의 과반이 넘기자고 해야 방장이 다음 친구로 넘길 수 있다.
  showcaseNext?: number;
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

// 문서 ID는 `${voterId}_${category}`로 고정해서 한 항목에 한 번만 투표할 수 있다.
export interface Vote {
  id: string;
  voterId: string; // 투표한 Player.id
  category: VoteCategory;
  targetId: string; // 고른 Player.id
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
  createdAt: Timestamp; // 만료 시각은 없다. 게임을 시작하면 폐기된다.
}
