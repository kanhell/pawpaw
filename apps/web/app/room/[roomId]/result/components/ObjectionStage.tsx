"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Photo from "./Photo";
import { playerOf } from "../logic";
import type { RoomData, Submission } from "../types";

export default function ObjectionStage({
  items,
  data,
  onObject,
  onFinish,
}: {
  items: Submission[];
  data: RoomData;
  onObject: (submissionId: string) => Promise<void>;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = items[index];

  if (!current) {
    return (
      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold">이의제기 끝!</h2>
        <p className="text-gray-600">모든 사진을 확인했어요</p>
        <button onClick={onFinish} className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95">
          확인
        </button>
      </motion.section>
    );
  }

  const owner = playerOf(data, current.playerId);
  const objectedByMe = (data.objections[current.id] ?? []).includes(data.me);
  const next = () => setIndex((i) => i + 1);

  return (
    <motion.section
      key={current.id}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="flex w-full flex-col items-center gap-3"
    >
      <p className="text-sm text-gray-500">
        이의제기 {index + 1} / {items.length}
        {current.order > 1 ? ` · ${current.order}번째 미션` : ""}
      </p>
      <p className="rounded-xl bg-white px-4 py-2 font-bold shadow">
        {data.missionTexts[current.id] ?? "미션"}
      </p>
      <Photo s={current} className="aspect-[3/4] w-full rounded-2xl" />
      <p className="font-bold">
        {owner?.emoji} {owner?.nickname}
      </p>
      <p className="text-sm text-gray-500">미션을 제대로 안 했다면 반대를 눌러요</p>
      <div className="flex gap-3">
        <button
          disabled={busy}
          onClick={next}
          className="rounded-full bg-green-500 px-8 py-3 font-bold text-white active:scale-95 disabled:bg-gray-300"
        >
          인정
        </button>
        <button
          disabled={busy || objectedByMe}
          onClick={async () => {
            setBusy(true);
            try {
              await onObject(current.id);
              next();
            } catch (e) {
              console.error(e);
              alert("반대하지 못했어요. 다시 시도해 주세요.");
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95 disabled:bg-gray-300"
        >
          반대
        </button>
      </div>
    </motion.section>
  );
}