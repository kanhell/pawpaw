/**
 * 미션을 직접 정해줄 때 누가 누구에게 주는지 정한다. (docs/MISSION_ASSIGN.md)
 * 참가한 순서대로 줄을 세우고, 각자 다음 사람에게 준다. 마지막 사람은 첫 사람에게 준다.
 * (docs/PLANNING.md "오른쪽 사람의 미션을 내가 정해주기")
 * 모든 기기가 같은 순서를 계산해야 하므로 참가 시각, 같으면 id 순으로 정렬한다.
 */
export function ringOrder<T extends { id: string; joinedAt: string }>(
  players: readonly T[],
): T[] {
  return [...players].sort((a, b) => {
    if (a.joinedAt !== b.joinedAt) return a.joinedAt < b.joinedAt ? -1 : 1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

/** 줄 선 순서(ordered)에서 giverId가 미션을 정해줄 사람. 목록에 없으면 null. 혼자면 자기 자신이다. */
export function receiverOf<T extends { id: string }>(
  ordered: readonly T[],
  giverId: string,
): T | null {
  const index = ordered.findIndex((player) => player.id === giverId);
  if (index === -1) return null;
  return ordered[(index + 1) % ordered.length];
}
