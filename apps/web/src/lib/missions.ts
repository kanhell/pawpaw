import type { Mission } from "@pawpaw/shared";

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

// 서로 다른 미션을 count개 뽑는다. 미션 수보다 많이 필요하면 처음부터 다시 돌려 쓴다.
export function pickRandomMissions(count: number): Mission[] {
  const shuffled = [...PRESET_MISSIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);
}
