const pad = (value: number) => String(value).padStart(2, "0");

/** ISO 문자열을 <input type="datetime-local">의 값("YYYY-MM-DDTHH:mm", 로컬 시각)으로 바꾼다. */
export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** datetime-local 값(로컬 시각)을 Date로 바꾼다. 비었거나 올바르지 않으면 null. */
export function fromDatetimeLocal(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
