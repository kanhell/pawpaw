import type { Assignment, Mission } from "@pawpaw/shared";

// 직접 정한 미션 본문의 최대 길이. firestore.rules의 missionText 길이 제한(60)과 같아야 한다.
export const MISSION_TEXT_MAX = 60;

// 임시 미션 목록 (docs/PLANNING.md의 미션 예시 기반)
// 백엔드가 생기면 서버에서 내려받는 데이터로 교체한다.
export const PRESET_MISSIONS: Mission[] = [
  { id: "m01", text: "친구에게 몰래 칭찬하기", category: "소통", difficulty: 2, source: "preset", createdBy: null },
  { id: "m02", text: "카페에서 특이한 이름을 가진 메뉴 찾기", category: "카페", difficulty: 1, source: "preset", createdBy: null },
  { id: "m03", text: "꽃 사진 찍기", category: "사진", difficulty: 1, source: "preset", createdBy: null },
  { id: "m04", text: "노란색 옷 입기", category: "패션", difficulty: 1, source: "preset", createdBy: null },
  { id: "m05", text: "평소에 안 가던 길로 학교나 집 가기", category: "탐험", difficulty: 2, source: "preset", createdBy: null },
  { id: "m06", text: "새로 생긴 카페 가보기", category: "카페", difficulty: 2, source: "preset", createdBy: null },
  { id: "m07", text: "카페에서 이름이 제일 신기한 메뉴 먹기", category: "카페", difficulty: 2, source: "preset", createdBy: null },
  { id: "m08", text: "오늘 본 예쁜 것 사진 찍기", category: "사진", difficulty: 1, source: "preset", createdBy: null },
  { id: "m09", text: "평소와 다른 옷 스타일 입어보기 + 액세서리", category: "패션", difficulty: 3, source: "preset", createdBy: null },
  { id: "m10", text: "주변에서 특이하게 생긴 것 찾기", category: "탐험", difficulty: 1, source: "preset", createdBy: null },
  { id: "m11", text: "10분 산책하기", category: "일상", difficulty: 1, source: "preset", createdBy: null },
  { id: "m12", text: "하늘 사진 찍기", category: "사진", difficulty: 1, source: "preset", createdBy: null },
  { id: "m13", text: "친해지고 싶었던 사람에게 말 걸기", category: "소통", difficulty: 3, source: "preset", createdBy: null },
];

export function getMission(missionId: string): Mission | undefined {
  return PRESET_MISSIONS.find((m) => m.id === missionId);
}

// 미션을 화면에 보여줄 형태로 바꾼다. 기본 제공 미션과 직접 정한 미션을 함께 다룬다.
export interface MissionView {
  text: string;
  label: string; // 미션 위에 작게 보여줄 분류
}

export function describeAssignmentMission(
  assignment: Pick<Assignment, "missionId" | "missionText">,
): MissionView | undefined {
  if (assignment.missionText) {
    return { text: assignment.missionText, label: "직접 정한 미션" };
  }
  const mission = assignment.missionId ? getMission(assignment.missionId) : undefined;
  if (!mission) return undefined;
  return {
    text: mission.text,
    label: `${mission.category} · ${"★".repeat(mission.difficulty)}`,
  };
}

// 서로 다른 미션을 줄 수 없을 만큼 미션이 모자란 경우
export class MissionPoolError extends Error {
  readonly available: number;

  constructor(available: number) {
    super(`미션이 ${available}개뿐이라 서로 다른 미션을 더 줄 수 없어요.`);
    this.name = "MissionPoolError";
    this.available = available;
  }
}

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 서로 다른 미션을 count개 뽑는다. 미션 수보다 많이 필요하면 처음부터 다시 돌려 쓴다. (겹칠 수 있다)
export function pickRandomMissions(count: number): Mission[] {
  const pool = shuffled(PRESET_MISSIONS);
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

// 서로 겹치지 않는 미션을 count개 뽑는다. 미션이 모자라면 MissionPoolError를 던진다.
export function pickDistinctMissions(count: number): Mission[] {
  if (count > PRESET_MISSIONS.length) {
    throw new MissionPoolError(PRESET_MISSIONS.length);
  }
  return shuffled(PRESET_MISSIONS).slice(0, count);
}
