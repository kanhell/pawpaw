"use client";

import { useRef } from "react";
import { toPng } from "html-to-image";

export type CardRow = { emoji: string; name: string; value: string };

export default function ShareCard({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle?: string;
  rows: CardRow[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  const save = async () => {
    if (!ref.current) return;
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = "pawpaw-result.png";
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error(e);
      alert("이미지 저장에 실패했어요. 다시 시도해 주세요.");
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        ref={ref}
        className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl bg-amber-100 p-6"
      >
        <p className="text-sm text-gray-600">파파야 미션 결과</p>
        <h2 className="text-2xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        <ul className="mt-2 w-full space-y-2">
          {rows.slice(0, 6).map((r, i) => (
            <li key={i} className="flex items-center justify-between rounded-xl bg-white px-4 py-2">
              <span className="font-bold">
                {r.emoji} {r.name}
              </span>
              <span className="text-gray-600">{r.value}</span>
            </li>
          ))}
        </ul>
        {rows.length > 6 && <p className="text-xs text-gray-500">외 {rows.length - 6}명</p>}
      </div>
      <button onClick={save} className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95">
        이미지 저장
      </button>
    </div>
  );
}