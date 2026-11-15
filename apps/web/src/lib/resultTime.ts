// 결과 공개 시각 고르기 (게임 설정 팝업)
// - 정해진 시각: 오후 6시·8시·10시 중 하나. 오늘 그 시각이 지났으면 내일 그 시각이다. 기본값은 6시.
// - 직접 설정: 시각은 30분씩, 날짜는 하루씩 버튼으로 옮긴다.

export const RESULT_PRESET_HOURS = [18, 20, 22] as const;
export const DEFAULT_RESULT_HOUR = 18;
export const TIME_STEP_MINUTES = 30;

/** 오늘 hour:minute. 이미 지났으면(같은 시각 포함) 내일 같은 시각. */
export function nextOccurrence(hour: number, minute: number, now: Date): Date {
  const date = new Date(now);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
  return date;
}

/** date와 같은 시각으로, 오늘(지났으면 내일). 직접 설정에서 날짜를 고르지 않을 때 쓴다. */
export function atNextSameTime(date: Date, now: Date): Date {
  return nextOccurrence(date.getHours(), date.getMinutes(), now);
}

/** 시각을 30분 단위로 옮긴다. (자정을 넘으면 날짜도 바뀐다) */
export function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** 같은 시각으로 날짜만 하루 단위로 옮긴다. */
export function shiftDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** 정해진 시각 버튼에 맞는 시각인가 (정각이고 6·8·10시) */
export function presetHourOf(date: Date): number | null {
  const hour = date.getHours();
  return date.getMinutes() === 0 && (RESULT_PRESET_HOURS as readonly number[]).includes(hour)
    ? hour
    : null;
}

function daysFrom(date: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

/** "오후 6:30" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

const RELATIVE_DAYS = ["오늘", "내일", "모레"];

/** "오늘", "내일", "모레", 그 뒤로는 "11월 20일 금요일 (5일 뒤)" */
export function formatDay(date: Date, now: Date): string {
  const days = daysFrom(date, now);
  if (days >= 0 && days < RELATIVE_DAYS.length) return RELATIVE_DAYS[days];
  const day = date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
  return days > 0 ? `${day} (${days}일 뒤)` : day;
}

/** "오늘 오후 6:00", "모레 오후 8:00", "11월 20일 금요일 (5일 뒤) 오후 10:00" */
export function formatResultTime(date: Date, now: Date): string {
  return `${formatDay(date, now)} ${formatTime(date)}`;
}
