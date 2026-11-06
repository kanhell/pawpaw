import type {
  GameMode,
  MissionAssigner,
  MissionScope,
  MissionVisibility,
  RoomSettings,
} from "@pawpaw/shared";

// ---------- 설정 선택지 (게임 설정 화면과 모드 카드가 함께 쓴다) ----------
export interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

// 미션 부여 방법 (docs/PLANNING.md "미션 부여 방법 결정")
export const ASSIGNER_OPTIONS: Option<MissionAssigner>[] = [
  { value: "players", label: "서로 정해주기", description: "친구들끼리 서로의 미션을 정해줘요." },
  { value: "app", label: "앱이 정해주기", description: "앱이 알아서 미션을 뽑아줘요." },
];

export const VISIBILITY_OPTIONS: Option<MissionVisibility>[] = [
  { value: "public", label: "미리 전체 공개", description: "모두의 미션을 미리 볼 수 있어요." },
  { value: "private", label: "본인만 확인", description: "내 미션은 나만 볼 수 있어요." },
];

export const SCOPE_OPTIONS: Option<MissionScope>[] = [
  { value: "same", label: "모두 같은 미션", description: "전체가 같은 미션을 수행해요." },
  { value: "different", label: "각자 다른 미션", description: "모두 서로 다른 미션을 수행해요." },
];

// ---------- 모드가 허용하는 값 ----------
// options: 고를 수 있는 값. 2개 이상이면 선택 가능, 1개면 고정, 비어 있으면 해당 없음(화면에서 숨김).
// default: 방을 만들 때 들어가는 값 (options가 있으면 그 안에 있어야 한다)
export interface Choice<T extends string> {
  default: T;
  options: readonly T[];
}

// 첫 번째 값이 기본값이고, 나머지도 선택할 수 있다.
function choose<T extends string>(first: T, ...others: T[]): Choice<T> {
  return { default: first, options: [first, ...others] };
}

function fixed<T extends string>(value: T): Choice<T> {
  return { default: value, options: [value] };
}

function notApplicable<T extends string>(value: T): Choice<T> {
  return { default: value, options: [] };
}

// 모드별로 방장이 숫자로 정하는 추가 설정 (진행 일수, 제한 시간)
export interface ModeExtra {
  key: "durationDays" | "timeLimitSec";
  title: string;
  description: string;
  default: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  // 있으면 값을 정하지 않을 수도 있다. (저장 값은 null)
  optional?: { on: string; off: string };
}

// 미션 수행 현황을 어떻게 보여주나: 누가 제출했는지 / 몇 개 했는지 / 보여주지 않음
export type ModeProgress = "status" | "count" | "none";

// 결과 공개 시각을 어떻게 다루나
// - "none"   (A): 정하지 않는다. 시각 없이 방장이 직접 공개하고, 제한 시간이 있으면 제한 시간이 끝날 때 공개한다.
// - "choice" (B): 방장이 정할지 말지 고른다. 정하지 않으면 방장이 직접 공개한다.
export type ResultAtPolicy = "none" | "choice";

const noResultAt = (): ResultAtPolicy => "none";
const chooseResultAt = (): ResultAtPolicy => "choice";

export interface ModeDefinition {
  id: GameMode;
  emoji: string;
  label: string;
  description: string;
  assigner: Choice<MissionAssigner>;
  scope: Choice<MissionScope>;
  visibility: Choice<MissionVisibility>;
  progress: ModeProgress;
  extras: readonly ModeExtra[];
  // 결과 공개 시각 정책. 현재 설정에 따라 달라질 수 있어서 함수다. (정하지 않으면 Room.resultAt = null)
  resultAt: (settings: RoomSettings) => ResultAtPolicy;
  invite: boolean; // 친구 초대가 필요한 모드인가
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}초`;
  return seconds === 0 ? `${minutes}분` : `${minutes}분 ${seconds}초`;
}

const DURATION_DAYS: ModeExtra = {
  key: "durationDays",
  title: "진행 일수",
  description: "며칠 동안 매일 미션을 할지 정해요. 기간 없이 일상을 계속 공유할 수도 있어요.",
  default: 7,
  min: 2,
  max: 30,
  step: 1,
  format: (value) => `${value}일`,
  optional: { on: "기간 정하기", off: "기간 없이 계속하기" },
};

const TIME_LIMIT_SEC: ModeExtra = {
  key: "timeLimitSec",
  title: "제한 시간",
  description: "이 시간 안에 최대한 많은 미션을 깨요.",
  default: 180,
  min: 60,
  max: 600,
  step: 30,
  format: formatSeconds,
};

// ---------- 모드 정의 (docs/PLANNING.md "모드") ----------
export const DEFAULT_MODE: GameMode = "oneshot";

export const MODES: Record<GameMode, ModeDefinition> = {
  daily: {
    id: "daily",
    emoji: "📅",
    label: "매일매일",
    description: "매일 미션을 받고, 누가 가장 많이 해내는지 겨뤄요.",
    assigner: choose("app", "players"),
    scope: fixed("same"),
    visibility: fixed("public"),
    progress: "status",
    extras: [DURATION_DAYS],
    // 진행 일수가 있으면 방장이 고르고(B), 기간 없이 계속하면 정하지 않는다(A)
    resultAt: (settings) =>
      (settings.durationDays ?? null) === null ? "none" : "choice",
    invite: true,
  },
  oneshot: {
    id: "oneshot",
    emoji: "🎲",
    label: "일회성",
    description: "하루만! 친구끼리 서로의 미션을 정해줘요.",
    assigner: choose("players", "app"),
    scope: choose("different", "same"),
    visibility: choose("private", "public"),
    progress: "status",
    extras: [],
    resultAt: chooseResultAt,
    invite: true,
  },
  race: {
    id: "race",
    emoji: "🏁",
    label: "선착순",
    description: "같은 미션을 가장 먼저 해내는 한 명이 살아남아요.",
    assigner: fixed("app"),
    scope: fixed("same"),
    visibility: fixed("public"),
    progress: "status",
    extras: [],
    resultAt: noResultAt,
    invite: true,
  },
  solo: {
    id: "solo",
    emoji: "🙋",
    label: "1인모드",
    description: "혼자서 오늘의 미션을 하고 캐릭터를 키워요.",
    assigner: fixed("app"),
    scope: notApplicable("different"),
    visibility: notApplicable("private"),
    progress: "none",
    extras: [],
    resultAt: noResultAt,
    invite: false,
  },
  endless: {
    id: "endless",
    emoji: "♾️",
    label: "무한미션",
    description: "미션을 깰 때마다 다음 미션이 나와요. 제한 시간 안에 많이 깨보세요.",
    assigner: fixed("app"),
    scope: choose("same", "different"),
    visibility: choose("public", "private"),
    progress: "count",
    extras: [TIME_LIMIT_SEC],
    resultAt: noResultAt,
    invite: true,
  },
};

// 모드 선택 화면에 보이는 순서
export const MODE_LIST: readonly ModeDefinition[] = [
  MODES.daily,
  MODES.oneshot,
  MODES.race,
  MODES.solo,
  MODES.endless,
];

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MODES, value);
}

// 알 수 없는 값이면 기본 모드로 취급한다.
export function getMode(mode: string | null | undefined): ModeDefinition {
  return isGameMode(mode) ? MODES[mode] : MODES[DEFAULT_MODE];
}

// 방을 만들 때 저장할 기본 설정
export function buildRoomSettings(mode: GameMode): RoomSettings {
  const definition = MODES[mode];
  const extra = (key: ModeExtra["key"]) =>
    definition.extras.find((item) => item.key === key)?.default ?? null;
  return {
    mode,
    assigner: definition.assigner.default,
    visibility: definition.visibility.default,
    scope: definition.scope.default,
    durationDays: extra("durationDays"),
    timeLimitSec: extra("timeLimitSec"),
  };
}

// ---------- 결과 공개 시각 문구 ----------
// 방장이 정할지 말지 고르는 경우(B)의 선택지 이름
export const RESULT_AT_OPTIONAL = {
  on: "시각 정하기",
  off: "정하지 않기",
} as const;

// 결과 공개 시각이 없을 때 결과가 언제 열리는지 안내한다. (docs/RESULT_REVEAL.md)
export function describeResultAtNone(settings: RoomSettings): string {
  return (settings.timeLimitSec ?? null) !== null
    ? "제한 시간이 끝나면 결과가 공개돼요."
    : "정해 둔 시각 없이, 방장이 준비되면 직접 결과를 공개해요.";
}

// ---------- 같은 미션 / 공개 범위 규칙 ----------
// '모두 같은 미션'이면 공개 여부는 묻지 않고 '미리 전체 공개'로 정한다.
// '각자 다른 미션'으로 돌아오면 공개 범위는 모드의 기본값으로 되돌린다.
export function scopePatch(
  mode: ModeDefinition,
  scope: MissionScope,
): Pick<RoomSettings, "scope" | "visibility"> {
  return {
    scope,
    visibility: scope === "same" ? "public" : mode.visibility.default,
  };
}
