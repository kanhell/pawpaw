"use client";

import type { GameMode } from "@pawpaw/shared";
import { MODE_LIST } from "../lib/modes";

interface ModePickerProps {
  value: GameMode | null;
  onChange: (mode: GameMode) => void;
}

// 모드 선택 카드 (방 만들기에서 쓴다)
export default function ModePicker({ value, onChange }: ModePickerProps) {
  return (
    <ul className="flex w-full flex-col gap-3">
      {MODE_LIST.map((mode) => {
        const selected = mode.id === value;
        return (
          <li key={mode.id}>
            <button
              onClick={() => onChange(mode.id)}
              aria-pressed={selected}
              className={`w-full rounded-card border-2 bg-surface p-4 text-left shadow-card active:scale-95 ${
                selected ? "border-primary" : "border-transparent"
              }`}
            >
              <span className="block text-lg font-bold">
                {mode.emoji} {mode.label}
              </span>
              <span className="mt-1 block text-sm text-ink-muted">{mode.description}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
