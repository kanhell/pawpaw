import { getMode } from "../lib/modes";

// 현재 방의 모드를 작게 보여준다.
export default function ModeBadge({ mode }: { mode: string }) {
  const definition = getMode(mode);
  return (
    <span className="rounded-full bg-surface px-3 py-1 text-sm font-bold shadow-card">
      {definition.emoji} {definition.label}
    </span>
  );
}
