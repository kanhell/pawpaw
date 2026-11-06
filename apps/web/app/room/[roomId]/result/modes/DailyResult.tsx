"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import ShareCard from "../components/ShareCard";
import { dailyBoard } from "../logic";
import type { RoomData } from "../types";

export default function DailyResult({ data }: { data: RoomData }) {
  const { days, rows } = useMemo(() => dailyBoard(data), [data]);
  const [showCard, setShowCard] = useState(false);
  const mine = rows.find((r) => r.player.id === data.me);
  const dayList = Array.from({ length: days }, (_, i) => i + 1);

  if (showCard) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-amber-50 p-6 text-center">
        <ShareCard
          title={`${days}일 미션 기록`}
          rows={rows.map((r) => ({
            emoji: r.player.emoji,
            name: r.player.nickname,
            value: `${r.count} / ${days}일`,
          }))}
        />
        <button onClick={() => setShowCard(false)} className="mt-3 text-sm text-gray-500 underline">돌아가기</button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-amber-50 p-6 text-center">
      <h2 className="text-2xl font-bold">매일 미션 기록</h2>
      {mine && (
        <p className="rounded-xl bg-white px-4 py-2 font-bold shadow">
          나는 {days}일 중 {mine.count}일 수행했어요
        </p>
      )}

      <ul className="max-h-[60dvh] w-full space-y-3 overflow-y-auto p-1">
        {rows.map((r, i) => (
          <motion.li
            key={r.player.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`rounded-2xl bg-white p-3 text-left shadow ${
              r.player.id === data.me ? "ring-2 ring-red-400" : ""
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold">
                {r.player.emoji} {r.player.nickname}
              </span>
              <span className="text-sm text-gray-600">
                {r.count} / {days}일
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dayList.map((day) => {
                const done = r.doneDays.has(day);
                return (
                  <span
                    key={day}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"
                    }`}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
          </motion.li>
        ))}
      </ul>

      <button onClick={() => setShowCard(true)} className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95">
        결과 카드 만들기
      </button>
    </main>
  );
}