"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toPng } from "html-to-image";
import { useStoragePhoto } from "../../../../../src/lib/firebase/hooks";
import { resultRepository } from "../repository";
import type { Player, RoomData, Submission, VoteCategory } from "../types";

const CATEGORY_TEXT: Record<VoteCategory, { title: string; question: string }> = {
  funny: { title: "가장 웃긴 미션", question: "가장 웃긴 미션을 골라주세요" },
  hard: { title: "가장 어려운 미션", question: "가장 어려운 미션을 골라주세요" },
};

// ---------- 계산 함수 (인원 수와 상관없이 동작) ----------
// 반대 수가 참가자 전체의 절반을 넘으면 실패
function failedIds(d: RoomData): Set<string> {
  const failed = new Set<string>();
  Object.entries(d.objections).forEach(([subId, list]) => {
    if (new Set(list).size * 2 > d.players.length) failed.add(subId);
  });
  return failed;
}

const playerOf = (d: RoomData, id: string) => d.players.find((p) => p.id === id);

function getFastest(d: RoomData, failed: Set<string>): Player | null {
  const first = d.submissions
    .filter((s) => !failed.has(s.id))
    .sort((a, b) => a.submittedAt - b.submittedAt)[0];
  return first ? playerOf(d, first.playerId) ?? null : null;
}

// 최다 득표 제출물 (실패 처리된 제출물 표는 무시, 동점이면 먼저 제출한 쪽)
function getVoteWinner(d: RoomData, category: VoteCategory, failed: Set<string>) {
  const counts: Record<string, number> = {};
  Object.values(d.votes[category]).forEach((subId) => {
    if (!failed.has(subId)) counts[subId] = (counts[subId] ?? 0) + 1;
  });
  const at = (id: string) => d.submissions.find((s) => s.id === id)?.submittedAt ?? Infinity;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || at(a[0]) - at(b[0]))[0];
  if (!top) return null;
  const sub = d.submissions.find((s) => s.id === top[0]);
  const player = sub && playerOf(d, sub.playerId);
  return player ? { player, count: top[1] } : null;
}

const allObjectionDone = (d: RoomData) => d.players.every((p) => d.objectionDone.includes(p.id));
const allVoted = (d: RoomData) =>
  d.players.every((p) => d.votes.funny[p.id] && d.votes.hard[p.id]);

// ---------- 사진 ----------
function Photo({ s, className }: { s: Submission; className?: string }) {
  const { url, failed } = useStoragePhoto(s.photoPath || null, String(s.submittedAt));
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="제출한 사진" className={`object-cover ${className ?? ""}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gray-200 text-sm text-gray-500 ${className ?? ""}`}>
      {failed ? "사진을 못 불러왔어요" : s.photoPath ? "불러오는 중..." : "📷"}
    </div>
  );
}

// ---------- 이의제기 ----------
function ObjectionStage({
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

// ---------- 투표 ----------
function VoteScreen({
  category,
  stepLabel,
  candidates,
  data,
  onVote,
}: {
  category: VoteCategory;
  stepLabel: string;
  candidates: Submission[];
  data: RoomData;
  onVote: (submissionId: string) => void;
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

      <ul className="grid max-h-[50dvh] w-full grid-cols-2 gap-3 overflow-y-auto p-1">
        {candidates.map((s) => {
          const owner = playerOf(data, s.playerId);
          return (
            <li key={s.id}>
              <button
                onClick={() => setSelected(s.id)}
                className={`flex w-full flex-col items-center gap-1 rounded-2xl border-2 bg-white p-2 shadow active:scale-95 ${
                  selected === s.id ? "border-red-500" : "border-transparent"
                }`}
              >
                <Photo s={s} className="aspect-square w-full rounded-xl" />
                <span className="text-xs text-gray-500">{data.missionTexts[s.id]}</span>
                <span className="font-bold">
                  {owner?.emoji} {owner?.nickname}
                </span>
              </button>
            </li>
          );
        })}
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

// ---------- 발표 (빰!) ----------
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

// ---------- 전체 흐름 ----------
type Phase = "objection" | "objWait" | "voteFunny" | "voteHard" | "waiting" | "reveal" | "share";

function phaseFor(d: RoomData): Phase {
  if (!d.objectionDone.includes(d.me)) return "objection";
  if (!d.votes.funny[d.me]) return allObjectionDone(d) ? "voteFunny" : "objWait";
  if (!d.votes.hard[d.me]) return "voteHard";
  return "waiting";
}

export default function OneshotResult({
  roomId,
  data,
  onReload,
}: {
  roomId: string;
  data: RoomData;
  onReload: () => Promise<RoomData | null>;
}) {
  const [phase, setPhase] = useState<Phase>(() => phaseFor(data));
  const [revealIndex, setRevealIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const failed = useMemo(() => failedIds(data), [data]);
  const others = data.submissions.filter((s) => s.playerId !== data.me);
  const candidates = others.filter((s) => !failed.has(s.id)); // 실패한 미션은 후보 제외

  // 대기 화면에서는 3초마다 새로고침
  useEffect(() => {
    if (phase !== "objWait" && phase !== "waiting") return;
    const t = setInterval(onReload, 3000);
    return () => clearInterval(t);
  }, [phase, onReload]);

  // 모두 이의제기를 끝내면 투표로
  const objDone = allObjectionDone(data);
  useEffect(() => {
    if (phase === "objWait" && objDone) setPhase("voteFunny");
  }, [phase, objDone]);

  const revealList = useMemo(() => {
    const funny = getVoteWinner(data, "funny", failed);
    const fastest = getFastest(data, failed);
    const hard = getVoteWinner(data, "hard", failed);
    // 발표 순서: 웃긴 → 빠른 → 어려운
    return [
      funny && { title: "가장 웃긴 미션", winner: funny.player, detail: `${funny.count}표를 받았어요` },
      fastest && { title: "가장 빠른 미션", winner: fastest, detail: "가장 먼저 미션을 제출했어요" },
      hard && { title: "가장 어려운 미션", winner: hard.player, detail: `${hard.count}표를 받았어요` },
    ].filter((x): x is { title: string; winner: Player; detail: string } => Boolean(x));
  }, [data, failed]);

  const objectTo = async (submissionId: string) => {
    await resultRepository.submitObjection(roomId, data.me, submissionId);
    await onReload();
  };

  const finishObjection = async () => {
    try {
      await resultRepository.submitObjectionDone(roomId, data.me);
      await onReload();
      setPhase("objWait");
    } catch (e) {
      console.error(e);
      alert("저장에 실패했어요. 다시 시도해 주세요.");
    }
  };

  const vote = async (category: VoteCategory, submissionId: string, nextPhase: Phase) => {
    try {
      await resultRepository.submitVote(roomId, data.me, category, submissionId);
      await onReload();
      setPhase(nextPhase);
    } catch (e) {
      console.error(e);
      alert("투표에 실패했어요. 다시 시도해 주세요.");
    }
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

  const votedCount = data.players.filter((p) => data.votes.funny[p.id] && data.votes.hard[p.id]).length;
  const objDoneCount = data.players.filter((p) => data.objectionDone.includes(p.id)).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center overflow-hidden bg-amber-50 p-6 text-center">
      <AnimatePresence mode="wait">
        {phase === "objection" && (
          <ObjectionStage key="objection" items={others} data={data} onObject={objectTo} onFinish={finishObjection} />
        )}

        {phase === "objWait" && (
          <motion.section key="objWait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
            <div className="text-7xl">🧐</div>
            <h1 className="text-2xl font-bold">이의제기 완료!</h1>
            <p className="text-gray-600">
              친구들을 기다리는 중... ({objDoneCount} / {data.players.length}명)
            </p>
          </motion.section>
        )}

        {phase === "voteFunny" &&
          (candidates.length === 0 ? (
            <p key="none" className="text-gray-600">투표할 미션이 없어요.</p>
          ) : (
            <VoteScreen
              key="voteFunny"
              category="funny"
              stepLabel="투표 1 / 2"
              candidates={candidates}
              data={data}
              onVote={(id) => vote("funny", id, "voteHard")}
            />
          ))}

        {phase === "voteHard" && (
          <VoteScreen
            key="voteHard"
            category="hard"
            stepLabel="투표 2 / 2"
            candidates={candidates}
            data={data}
            onVote={(id) => vote("hard", id, "waiting")}
          />
        )}

        {phase === "waiting" && (
          <motion.section key="waiting" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6">
            <div className="text-7xl">✉️</div>
            <h1 className="text-3xl font-bold">투표 완료!</h1>
            <p className="text-gray-600">
              {allVoted(data)
                ? "모두 투표를 마쳤어요"
                : `친구들을 기다리는 중... (${votedCount} / ${data.players.length}명)`}
            </p>
            <button
              disabled={!allVoted(data)}
              onClick={() => {
                setRevealIndex(0);
                setPhase("reveal");
              }}
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
              revealIndex === revealList.length - 1 ? setPhase("share") : setRevealIndex((i) => i + 1)
            }
          />
        )}

        {phase === "share" && (
          <motion.section key="share" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex w-full flex-col items-center gap-4">
            <div ref={cardRef} className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-5 rounded-3xl bg-amber-100 p-6">
              <p className="text-sm text-gray-600">파파야 미션 결과</p>
              {revealList.map((r) => (
                <div key={r.title} className="flex w-full flex-col items-center rounded-2xl bg-white py-3">
                  <p className="text-sm text-gray-500">{r.title}</p>
                  <p className="text-4xl">{r.winner.emoji}</p>
                  <p className="text-xl font-bold">{r.winner.nickname}</p>
                </div>
              ))}
            </div>
            <button onClick={saveImage} className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95">
              이미지 저장
            </button>
            <button
              onClick={() => {
                setRevealIndex(0);
                setPhase("reveal");
              }}
              className="text-sm text-gray-500 underline"
            >
              발표 다시 보기
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}