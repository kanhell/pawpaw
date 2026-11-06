"use client";

import EnableSwitch from "./EnableSwitch";

interface SettingStepperProps {
  title: string;
  description: string;
  value: number | null; // null이면 정하지 않은 상태 (optional일 때만)
  defaultValue: number; // '정하기'로 바꿀 때 처음 들어가는 값
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  optional?: { on: string; off: string }; // 있으면 값을 정하지 않을 수 있다
  editable: boolean; // 방장만 true
  busy: boolean;
  onChange: (value: number | null) => void;
}

// 숫자 설정 카드: 방장은 +/- 로 바꾸고, 참가자는 값만 본다.
// optional이면 방장이 '정하지 않기'를 고를 수 있다.
export default function SettingStepper({
  title,
  description,
  value,
  defaultValue,
  min,
  max,
  step,
  format,
  optional,
  editable,
  busy,
  onChange,
}: SettingStepperProps) {
  const isOff = value === null;
  const current = value ?? defaultValue;
  const buttonClass =
    "h-10 w-10 rounded-full bg-surface text-xl font-bold shadow-card active:scale-95 disabled:opacity-50";

  return (
    <section className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{description}</p>

      {optional && editable && (
        <EnableSwitch
          enabled={!isOff}
          onLabel={optional.on}
          offLabel={optional.off}
          busy={busy}
          onChange={(on) => onChange(on ? defaultValue : null)}
        />
      )}

      {(!isOff || !editable) && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-card bg-canvas px-4 py-3">
          {editable && !isOff && (
            <button
              aria-label={`${title} 줄이기`}
              onClick={() => onChange(Math.max(min, current - step))}
              disabled={busy || current <= min}
              className={buttonClass}
            >
              −
            </button>
          )}
          <span className="flex-1 text-center font-bold">
            {isOff ? (optional?.off ?? "-") : format(current)}
          </span>
          {editable && !isOff && (
            <button
              aria-label={`${title} 늘리기`}
              onClick={() => onChange(Math.min(max, current + step))}
              disabled={busy || current >= max}
              className={buttonClass}
            >
              +
            </button>
          )}
        </div>
      )}
    </section>
  );
}
