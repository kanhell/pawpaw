"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toPng } from "html-to-image";
import { useAuthState } from "../../../../src/lib/firebase/auth";
import { RESULTS_NOT_OPEN, resultRepository } from "./repository";
import type { Player, RoomData, VoteCategory } from "./types";

const CATEGORY_TEXT: Record<VoteCategory, { title: string; question: string }> = {
  funny: { title: "가장 웃긴 미션", question: "가장 웃긴 미션을 한 친구를 골라주세요" },
  hard: { title: "가장 어려운 미션", question: "가장 어려운 미션을 한 친구를 골라주세요" },
};

// ---------- 계산 함수 (인원 수와 상관없이 동작) ----------
function getFastestWinner(data: RoomData): Player | null {
  const first = [...data.submissions].sort((a, b) => a.submittedAt - b.submittedAt)[0];
  return first ? data.players.find((p) => p.id === first.playerId) ?? null : null;
}

// 최다 득표자 (동점이면 먼저 제출한 사람)
function getVoteWinner(data: RoomData, category: VoteCategory) {
  const counts: Record<string, number> = {};
  Object.values(data.votes[category]).forEach((t) => {
    counts[t] = (counts[t] ?? 0) + 1;
  });
  const submittedAt = (id: string) =>
    data.submissions.find((s) => s.playerId === id)?.submittedAt ?? Infinity;
  const top = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || submittedAt(a[0]) - submittedAt(b[0])
  )[0];
  if (!top) return null;
  const player = data.players.find((p) => p.id === top[0]);
  return player ? { player, count: top[1] } : null;
}

// 모든 참가자가 두 투표를 모두 끝냈는지
function isAllVoted(data: RoomData) {
  return data.players.every((p) => data.votes.funny[p.id] && data.votes.hard[p.id]);
}

// ---------- 투표 화면 ----------
function VoteScreen({
  category,
  stepLabel,
  candidates,
  onVote,
}: {
  category: VoteCategory;
  stepLabel: string;
  candidates: Player[];
  onVote: (targetId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="flex w-full flex-col items-center gap-4"
    >
      <p className="text-sm text-gray-500">{stepLabel}</p>
      <h2 className="text-2xl font-bold">{CATEGORY_TEXT[category].title}</h2>
      <p className="text-gray-600">{CATEGORY_TEXT[category].question}</p>

      {/* 인원이 많아도 이 영역 안에서만 스크롤돼요 */}
      <ul className="grid max-h-[50dvh] w-full grid-cols-2 gap-3 overflow-y-auto p-1">
        {candidates.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setSelected(p.id)}
              className={`flex w-full flex-col items-center gap-1 rounded-2xl border-2 bg-white p-3 shadow active:scale-95 ${
                selected === p.id ? "border-red-500" : "border-transparent"
              }`}
            >
              <span className="text-5xl">{p.emoji}</span>
              <span className="font-bold">{p.nickname}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        disabled={!selected}
        onClick={() => selected && onVote(selected)}
        className="mt-2 rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95 disabled:bg-gray-300"
      >
        투표하기
      </button>
    </motion.section>
  );
}

// ---------- 발표 화면 (빰!) ----------
function RevealStage({
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
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex w-full flex-col items-center gap-4"
    >
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
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold"
          >
            {winner.nickname}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-gray-600"
          >
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

// ---------- 전체 화면 ----------
type Phase = "voteFunny" | "voteHard" | "waiting" | "reveal" | "share";

// 이미 투표한 적이 있으면 그 다음 단계부터 시작
function phaseFor(d: RoomData): Phase {
  const funny = d.votes.funny[d.me];
  const hard = d.votes.hard[d.me];
  if (funny && hard) return "waiting";
  if (funny) return "voteHard";
  return "voteFunny";
}

export default function ResultPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const auth = useAuthState(); // 익명 로그인 (친구의 auth.ts)
  const uid = auth.status === "signedIn" ? auth.uid : null;

  const [data, setData] = useState<RoomData | null>(null);
  const [error, setError] = useState<"notOpen" | "failed" | null>(null);
  const [phase, setPhase] = useState<Phase>("voteFunny");
  const [revealIndex, setRevealIndex] = useState(0);
  const initialized = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const load = async (): Promise<RoomData | null> => {
    if (!uid) return null;
    try {
      const d = await resultRepository.getRoomData(roomId, uid);
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.message === RESULTS_NOT_OPEN ? "notOpen" : "failed");
      return null;
    }
  };

  // 로그인되면 데이터를 불러오고, 처음 한 번만 내 투표 상태에 맞는 단계로 시작
  useEffect(() => {
    if (!uid) return;
    load().then((d) => {
      if (d && !initialized.current) {
        initialized.current = true;
        setPhase(phaseFor(d));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, uid]);

  // 대기 화면에서는 3초마다 다시 불러와서 "전원 투표 완료"를 확인
  useEffect(() => {
    if (phase !== "waiting") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roomId, uid]);

  const revealList = useMemo(() => {
    if (!data) return [];
    const funny = getVoteWinner(data, "funny");
    const fastest = getFastestWinner(data);
    const hard = getVoteWinner(data, "hard");
    // 발표 순서: 웃긴 → 빠른 → 어려운
    return [
      funny && { title: "가장 웃긴 미션", winner: funny.player, detail: `${funny.count}표를 받았어요` },
      fastest && { title: "가장 빠른 미션", winner: fastest, detail: "가장 먼저 미션을 제출했어요" },
      hard && { title: "가장 어려운 미션", winner: hard.player, detail: `${hard.count}표를 받았어요` },
    ].filter((x): x is { title: string; winner: Player; detail: string } => Boolean(x));
  }, [data]);

  const vote = async (category: VoteCategory, targetId: string, nextPhase: Phase) => {
    if (!data) return;
    try {
      await resultRepository.submitVote(roomId, data.me, category, targetId);
      await load();
      setPhase(nextPhase);
    } catch (e) {
      console.error(e);
      alert("투표에 실패했어요. 다시 시도해 주세요.");
    }
  };

  const replay = () => {
    setRevealIndex(0);
    setPhase("reveal");
  };

  const saveImage = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      link.download = "pawpaw-result.png";
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error(e);
      alert("이미지 저장에 실패했어요. 다시 시도해 주세요.");
    }
  };

  const shell = "mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-amber-50 p-6 text-center";

  if (auth.status === "error") {
    return (
      <main className={shell}>
        <p className="text-gray-600">로그인에 실패했어요.</p>
        <p className="mt-2 text-sm text-gray-400">{auth.message}</p>
      </main>
    );
  }
  if (error === "notOpen") {
    return (
      <main className={shell}>
        <p className="text-gray-600">아직 결과 공개 전이거나 이 방의 멤버가 아니에요.</p>
        <button onClick={load} className="mt-4 rounded-full bg-red-500 px-6 py-2 font-bold text-white">
          다시 확인
        </button>
      </main>
    );
  }
  if (error === "failed") {
    return (
      <main className={shell}>
        <p className="text-gray-600">데이터를 불러오지 못했어요.</p>
        <button onClick={load} className="mt-4 rounded-full bg-red-500 px-6 py-2 font-bold text-white">
          다시 시도
        </button>
      </main>
    );
  }
  if (!data) {
    return (
      <main className={shell}>
        <p className="text-gray-500">불러오는 중...</p>
      </main>
    );
  }

  // 사진을 제출한 친구만, 자기 자신은 제외하고 투표 후보로 보여준다
  const submittedIds = new Set(data.submissions.map((s) => s.playerId));
  const candidates = data.players.filter((p) => p.id !== data.me && submittedIds.has(p.id));
  if (candidates.length === 0 && phase.startsWith("vote")) {
    return (
      <main className={shell}>
        <p className="text-gray-600">투표할 친구가 아직 없어요.</p>
      </main>
    );
  }

  const allVoted = isAllVoted(data);
  const votedCount = data.players.filter((p) => data.votes.funny[p.id] && data.votes.hard[p.id]).length;

  return (
    <main className={`${shell} overflow-hidden`}>
      <AnimatePresence mode="wait">
        {phase === "voteFunny" && (
          <VoteScreen
            key="voteFunny"
            category="funny"
            stepLabel="투표 1 / 2"
            candidates={candidates}
            onVote={(id) => vote("funny", id, "voteHard")}
          />
        )}

        {phase === "voteHard" && (
          <VoteScreen
            key="voteHard"
            category="hard"
            stepLabel="투표 2 / 2"
            candidates={candidates}
            onVote={(id) => vote("hard", id, "waiting")}
          />
        )}

        {phase === "waiting" && (
          <motion.section
            key="waiting"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="text-7xl">✉️</div>
            <h1 className="text-3xl font-bold">투표 완료!</h1>
            <p className="text-gray-600">
              {allVoted
                ? "모두 투표를 마쳤어요"
                : `친구들을 기다리는 중... (${votedCount} / ${data.players.length}명)`}
            </p>
            <button
              disabled={!allVoted}
              onClick={() => setPhase("reveal")}
              className="rounded-full bg-red-500 px-8 py-3 text-lg font-bold text-white active:scale-95 disabled:bg-gray-300"
            >
              결과 공개
            </button>
          </motion.section>
        )}

        {phase === "reveal" && revealList[revealIndex] && (
          <RevealStage
            key={`reveal-${revealIndex}`}
            title={revealList[revealIndex].title}
            winner={revealList[revealIndex].winner}
            detail={revealList[revealIndex].detail}
            isLast={revealIndex === revealList.length - 1}
            onNext={() =>
              revealIndex === revealList.length - 1
                ? setPhase("share")
                : setRevealIndex((i) => i + 1)
            }
          />
        )}

        {phase === "share" && (
          <motion.section
            key="share"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex w-full flex-col items-center gap-4"
          >
            <div
              ref={cardRef}
              className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-5 rounded-3xl bg-amber-100 p-6"
            >
              <p className="text-sm text-gray-600">파파야 미션 결과</p>
              {revealList.map((r) => (
                <div key={r.title} className="flex w-full flex-col items-center rounded-2xl bg-white py-3">
                  <p className="text-sm text-gray-500">{r.title}</p>
                  <p className="text-4xl">{r.winner.emoji}</p>
                  <p className="text-xl font-bold">{r.winner.nickname}</p>
                </div>
              ))}
            </div>
            <button
              onClick={saveImage}
              className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95"
            >
              이미지 저장
            </button>
            <button onClick={replay} className="text-sm text-gray-500 underline">
              발표 다시 보기
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}