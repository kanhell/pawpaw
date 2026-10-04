"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// ---------- 타입 (나중에 친구가 만든 모델로 교체) ----------
type Award = {
  id: string;
  title: string; // 시상 항목 이름
  winner: string; // 수상자 닉네임
  emoji: string; // 동물 캐릭터 대용
  comment: string;
};

type PlayerScore = {
  nickname: string;
  emoji: string;
  score: number;
};

// ---------- mock 데이터 ----------
const MOCK_AWARDS: Award[] = [
  { id: "a1", title: "최고의 사진상", winner: "코알라", emoji: "🐨", comment: "구도가 예술이었어요" },
  { id: "a2", title: "번개 완료상", winner: "토끼", emoji: "🐰", comment: "가장 먼저 미션을 끝냈어요" },
  { id: "a3", title: "도전 정신상", winner: "여우", emoji: "🦊", comment: "가장 어려운 미션에 도전했어요" },
];

const MOCK_RANKING: PlayerScore[] = [
  { nickname: "토끼", emoji: "🐰", score: 95 },
  { nickname: "코알라", emoji: "🐨", score: 88 },
  { nickname: "여우", emoji: "🦊", score: 80 },
  { nickname: "곰", emoji: "🐻", score: 72 },
];

// ---------- 화면 ----------
export default function ResultPage() {
  // step 0: 오프닝, 1~N: 시상 항목, N+1: 최종 순위, N+2: 공유
  const [step, setStep] = useState(0);
  const awardCount = MOCK_AWARDS.length;
  const rankingStep = awardCount + 1;
  const shareStep = awardCount + 2;

  const next = () => setStep((s) => Math.min(s + 1, shareStep));
  const restart = () => setStep(0);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center overflow-hidden bg-amber-50 p-6 text-center">
      <AnimatePresence mode="wait">
        {/* 0. 오프닝 */}
        {step === 0 && (
          <motion.section
            key="opening"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="text-7xl">✉️</div>
            <h1 className="text-3xl font-bold">결과를 공개합니다</h1>
            <p className="text-gray-600">두근두근, 누가 상을 받을까요?</p>
            <button
              onClick={next}
              className="rounded-full bg-red-500 px-8 py-3 text-lg font-bold text-white active:scale-95"
            >
              편지 열기
            </button>
          </motion.section>
        )}

        {/* 1 ~ N. 시상 항목 */}
        {step >= 1 && step <= awardCount && (
          <motion.section
            key={`award-${step}`}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="flex flex-col items-center gap-4"
          >
            <p className="text-sm text-gray-500">
              {step} / {awardCount}
            </p>
            <h2 className="text-2xl font-bold">{MOCK_AWARDS[step - 1].title}</h2>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: "spring" }}
              className="text-8xl"
            >
              {MOCK_AWARDS[step - 1].emoji}
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl font-bold"
            >
              {MOCK_AWARDS[step - 1].winner}
            </motion.p>
            <p className="text-gray-600">{MOCK_AWARDS[step - 1].comment}</p>
            <button
              onClick={next}
              className="mt-4 rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95"
            >
              다음
            </button>
          </motion.section>
        )}

        {/* N+1. 최종 순위 */}
        {step === rankingStep && (
          <motion.section
            key="ranking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full flex-col items-center gap-4"
          >
            <h2 className="text-2xl font-bold">최종 순위</h2>
            <ul className="w-full space-y-3">
              {MOCK_RANKING.map((p, i) => (
                <motion.li
                  key={p.nickname}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.2 }}
                  className="flex items-center justify-between rounded-2xl bg-white px-5 py-4 shadow"
                >
                  <span className="text-lg font-bold">
                    {i + 1}등 {p.emoji} {p.nickname}
                  </span>
                  <span className="text-gray-600">{p.score}점</span>
                </motion.li>
              ))}
            </ul>
            <button
              onClick={next}
              className="mt-4 rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95"
            >
              결과 카드 만들기
            </button>
          </motion.section>
        )}

        {/* N+2. 공유 카드 */}
        {step === shareStep && (
          <motion.section
            key="share"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex w-full flex-col items-center gap-4"
          >
            <div className="w-full rounded-3xl bg-white p-6 shadow-lg">
              <p className="text-sm text-gray-500">파파야 미션 결과</p>
              <p className="mt-2 text-6xl">{MOCK_RANKING[0].emoji}</p>
              <p className="mt-2 text-2xl font-bold">
                1등 {MOCK_RANKING[0].nickname}
              </p>
            </div>
            <button
              onClick={() => alert("이미지 저장은 나중에 연결해요")}
              className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95"
            >
              이미지 저장
            </button>
            <button onClick={restart} className="text-sm text-gray-500 underline">
              처음부터 다시 보기
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}