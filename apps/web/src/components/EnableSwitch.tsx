"use client";

interface EnableSwitchProps {
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  busy: boolean;
  onChange: (enabled: boolean) => void;
}

// 값을 정할지 말지 고르는 두 칸 선택 (방장만 쓴다)
// 진행 일수와 결과 공개 시각처럼 "정하지 않을 수 있는" 설정이 함께 쓴다.
export default function EnableSwitch({
  enabled,
  onLabel,
  offLabel,
  busy,
  onChange,
}: EnableSwitchProps) {
  const choices = [
    { value: true, label: onLabel },
    { value: false, label: offLabel },
  ];
  return (
    <div className="mt-3 flex gap-2">
      {choices.map((choice) => {
        const selected = choice.value === enabled;
        return (
          <button
            key={String(choice.value)}
            onClick={() => {
              if (!selected) onChange(choice.value);
            }}
            disabled={busy}
            aria-pressed={selected}
            className={`flex-1 rounded-card border-2 px-3 py-2 text-sm font-bold active:scale-95 disabled:opacity-50 ${
              selected ? "border-primary bg-surface" : "border-transparent bg-canvas"
            }`}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
