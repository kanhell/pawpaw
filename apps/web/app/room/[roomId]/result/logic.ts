import type { Player, RoomData, Submission } from "./types";

export const playerOf = (d: RoomData, id: string): Player | undefined =>
  d.players.find((p) => p.id === id);

// 반대 수가 참가자 전체의 절반을 넘으면 실패
export function failedIds(d: RoomData): Set<string> {
  const failed = new Set<string>();
  Object.entries(d.objections).forEach(([subId, list]) => {
    if (new Set(list).size * 2 > d.players.length) failed.add(subId);
  });
  return failed;
}

export const allObjectionDone = (d: RoomData) =>
  d.players.every((p) => d.objectionDone.includes(p.id));

// ----- 선착순: 인정된 제출물 중 먼저 낸 순서로 생존자 수만큼이 생존 -----
export function raceOutcome(d: RoomData, failed: Set<string>) {
  const valid = d.submissions
    .filter((s) => !failed.has(s.id))
    .sort((a, b) => a.submittedAt - b.submittedAt);
  const seen = new Set<string>();
  const ordered: Submission[] = [];
  valid.forEach((s) => {
    if (!seen.has(s.playerId)) {
      seen.add(s.playerId);
      ordered.push(s);
    }
  });
  const survivorSubs = ordered.slice(0, d.survivorCount);
  const survivorIds = new Set(survivorSubs.map((s) => s.playerId));
  const survivors = survivorSubs.flatMap((s) => {
    const player = playerOf(d, s.playerId);
    return player ? [{ player, submission: s }] : [];
  });
  const losers = d.players.filter((p) => !survivorIds.has(p.id));
  return { survivors, losers };
}

// ----- 무한: 인정된 미션 개수가 많은 순 (동점이면 먼저 끝낸 사람) -----
export function endlessRanking(d: RoomData, failed: Set<string>) {
  return d.players
    .map((player) => {
      const subs = d.submissions
        .filter((s) => s.playerId === player.id && !failed.has(s.id))
        .sort((a, b) => a.order - b.order);
      const last = subs.reduce((m, s) => Math.max(m, s.submittedAt), 0);
      return { player, subs, count: subs.length, last };
    })
    .sort((a, b) => b.count - a.count || a.last - b.last);
}

// ----- 매일: 사람별로 어느 날 수행했는지 -----
export function dailyBoard(d: RoomData) {
  const maxRound = d.submissions.reduce((m, s) => Math.max(m, s.roundIndex), 0);
  const days = Math.max(d.durationDays ?? 0, maxRound, 1);
  const rows = d.players
    .map((player) => {
      const doneDays = new Set(
        d.submissions.filter((s) => s.playerId === player.id).map((s) => s.roundIndex)
      );
      return { player, doneDays, count: doneDays.size };
    })
    .sort((a, b) => b.count - a.count);
  return { days, rows };
}