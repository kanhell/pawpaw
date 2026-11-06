"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Player } from "../types";

export default function RevealStage({
  title,
  winner,
  detail,
  isLast,
  onNext,
}: {
  title: string;
  winner: Player;
  detail: string;
  isLast: boolean;
  onNext: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      {!revealed ? (
        <motion.p
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 0.6 }}
          className="py-20 text-3xl font-bold text-gray-500"
        >
          두구두구두구...
        </motion.p>
      ) : (
        <>
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 12 }}
            className="text-9xl"
          >
            {winner.emoji}
          </motion.div>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-3xl font-bold">
            {winner.nickname}
          </motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-gray-600">
            {detail}
          </motion.p>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            onClick={onNext}
            className="mt-4 rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95"
          >
            {isLast ? "결과 카드 보기" : "확인"}
          </motion.button>
        </>
      )}
    </motion.section>
  );
}