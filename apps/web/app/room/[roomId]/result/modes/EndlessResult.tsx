"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Photo from "../components/Photo";
import ObjectionStage from "../components/ObjectionStage";
import ShareCard from "../components/ShareCard";
import { allObjectionDone, endlessRanking, failedIds } from "../logic";
import { makeObjectionActions, usePolling } from "../flow";
import type { RoomData } from "../types";

type Phase = "objection" | "objWait" | "ranking" | "card";

function phaseFor(d: RoomData, hasOthers: boolean): Phase {
  if (!hasOthers) return "ranking";
  if (!d.objectionDone.includes(d.me)) return "objection";
  return allObjectionDone(d) ? "ranking" : "objWait";
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default function EndlessResult({
  roomId,
  data,
  onReload,
}: {
  roomId: string;
  data: RoomData;
  onReload: () => Promise<RoomData | null>;
}) {
  // 한 사람씩, 미션 순서대로 쭉 확인
  const others = useMemo(() => {
    const idx = (id: string) => data.players.findIndex((p) => p.id === id);
    return data.submissions
      .filter((s) => s.playerId !== data.me)
      .sort((a, b) => idx(a.playerId) - idx(b.playerId) || a.order - b.order);
  }, [data]);

  const [phase, setPhase] = useState<Phase>(() => phaseFor(data, others.length > 0));
  const [openId, setOpenId] = useState<string | null>(null);

  const failed = useMemo(() => failedIds(data), [data]);
  const ranking = useMemo(() => endlessRanking(data, failed), [data, failed]);
  const actions = makeObjectionActions(roomId, data, onReload);

  usePolling(phase === "objWait", onReload);
  const objDone = allObjectionDone(data);
  useEffect(() => {
    if (phase === "objWait" && objDone) setPhase("ranking");
  }, [phase, objDone]);

  const objDoneCount = data.players.filter((p) => data.objectionDone.includes(p.id)).length;
  const solo = data.players.length === 1;

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

        {phase === "ranking" && (
          <motion.section key="ranking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-4">
            <h2 className="text-2xl font-bold">{solo ? "내 기록" : "수행 순위"}</h2>
            <ul className="max-h-[60dvh] w-full space-y-2 overflow-y-auto p-1">
              {ranking.map((r, i) => (
                <motion.li
                  key={r.player.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.15 }}
                  className="rounded-2xl bg-white p-3 shadow"
                >
                  <button
                    onClick={() => setOpenId(openId === r.player.id ? null : r.player.id)}
                    className="flex w-full items-center justify-between"
                  >
                    <span className="text-lg font-bold">
                      {MEDAL[i] ?? `${i + 1}등`} {r.player.emoji} {r.player.nickname}
                    </span>
                    <span className="text-gray-600">{r.count}개</span>
                  </button>
                  {openId === r.player.id && (
                    <ul className="mt-3 grid grid-cols-3 gap-2">
                      {r.subs.map((s) => (
                        <li key={s.id} className="flex flex-col gap-1">
                          <Photo s={s} className="aspect-square w-full rounded-lg" />
                          <span className="text-[10px] leading-tight text-gray-500">
                            {s.order}. {data.missionTexts[s.id]}
                          </span>
                        </li>
                      ))}
                      {r.subs.length === 0 && <li className="col-span-3 text-sm text-gray-500">인정된 미션이 없어요</li>}
                    </ul>
                  )}
                </motion.li>
              ))}
            </ul>
            <button onClick={() => setPhase("card")} className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95">
              결과 카드 만들기
            </button>
          </motion.section>
        )}

        {phase === "card" && (
          <motion.section key="card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex w-full flex-col items-center gap-3">
            <ShareCard
              title={solo ? "내 기록" : "수행 순위"}
              rows={ranking.map((r, i) => ({
                emoji: r.player.emoji,
                name: `${MEDAL[i] ?? `${i + 1}등`} ${r.player.nickname}`,
                value: `${r.count}개`,
              }))}
            />
            <button onClick={() => setPhase("ranking")} className="text-sm text-gray-500 underline">돌아가기</button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}