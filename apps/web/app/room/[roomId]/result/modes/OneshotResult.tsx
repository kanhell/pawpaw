"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toPng } from "html-to-image";
import Photo from "../components/Photo";
import ObjectionStage from "../components/ObjectionStage";
import RevealStage from "../components/RevealStage";
import { allObjectionDone, failedIds, playerOf } from "../logic";
import { makeObjectionActions, usePolling } from "../flow";
import { resultRepository } from "../repository";
import type { Player, RoomData, Submission, VoteCategory } from "../types";

const CATEGORY_TEXT: Record<VoteCategory, { title: string; question: string }> = {
  funny: { title: "가장 웃긴 미션", question: "가장 웃긴 미션을 골라주세요" },
  hard: { title: "가장 어려운 미션", question: "가장 어려운 미션을 골라주세요" },
};

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

const allVoted = (d: RoomData) =>
  d.players.every((p) => d.votes.funny[p.id] && d.votes.hard[p.id]);

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

type Phase = "objection" | "objWait" | "voteFunny" | "voteHard" | "waiting" | "reveal" | "share";

function phaseFor(d: RoomData, hasOthers: boolean): Phase {
  if (hasOthers && !d.objectionDone.includes(d.me)) return "objection";
  if (!d.votes.funny[d.me]) return allObjectionDone(d) || !hasOthers ? "voteFunny" : "objWait";
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
  const others = useMemo(
    () => data.submissions.filter((s) => s.playerId !== data.me),
    [data]
  );
  const [phase, setPhase] = useState<Phase>(() => phaseFor(data, others.length > 0));
  const [revealIndex, setRevealIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const failed = useMemo(() => failedIds(data), [data]);
  const candidates = others.filter((s) => !failed.has(s.id)); // 실패한 미션은 후보 제외
  const actions = makeObjectionActions(roomId, data, onReload);

  usePolling(phase === "objWait" || phase === "waiting", onReload);

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
          <ObjectionStage
            key="objection"
            items={others}
            data={data}
            onObject={actions.objectTo}
            onFinish={async () => {
              if (await actions.finish()) setPhase("objWait");
            }}
          />
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