"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Photo from "../components/Photo";
import ObjectionStage from "../components/ObjectionStage";
import ShareCard from "../components/ShareCard";
import { allObjectionDone, failedIds, raceOutcome } from "../logic";
import { makeObjectionActions, usePolling } from "../flow";
import type { RoomData } from "../types";

type Phase = "objection" | "objWait" | "result" | "photos" | "card" | "next";
type Target = "survivors" | "losers" | "custom";

function phaseFor(d: RoomData, hasOthers: boolean): Phase {
  if (!hasOthers) return "result";
  if (!d.objectionDone.includes(d.me)) return "objection";
  return allObjectionDone(d) ? "result" : "objWait";
}

const btn = "rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95 disabled:bg-gray-300";

export default function RaceResult({
  roomId,
  data,
  onReload,
}: {
  roomId: string;
  data: RoomData;
  onReload: () => Promise<RoomData | null>;
}) {
  // 제출한 순서대로 한 장씩 확인
  const others = useMemo(
    () => data.submissions.filter((s) => s.playerId !== data.me).sort((a, b) => a.submittedAt - b.submittedAt),
    [data]
  );
  const [phase, setPhase] = useState<Phase>(() => phaseFor(data, others.length > 0));
  const [target, setTarget] = useState<Target | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const failed = useMemo(() => failedIds(data), [data]);
  const { survivors, losers } = useMemo(() => raceOutcome(data, failed), [data, failed]);
  const actions = makeObjectionActions(roomId, data, onReload);

  usePolling(phase === "objWait", onReload);
  const objDone = allObjectionDone(data);
  useEffect(() => {
    if (phase === "objWait" && objDone) setPhase("result");
  }, [phase, objDone]);

  const isSurvivor = survivors.some((s) => s.player.id === data.me);
  const isHost = data.me === data.hostId;
  const chosenIds =
    target === "survivors"
      ? survivors.map((s) => s.player.id)
      : target === "losers"
        ? losers.map((p) => p.id)
        : picked;

  const togglePick = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

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

        {phase === "result" && (
          <motion.section key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-4">
            <h2 className="text-3xl font-bold">{isSurvivor ? "🎉 생존!" : "😭 탈락..."}</h2>
            <p className="font-bold text-green-600">생존자 {survivors.length}명</p>
            <ul className="w-full space-y-2">
              {survivors.map((s, i) => (
                <motion.li
                  key={s.player.id}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.3 }}
                  className="flex justify-between rounded-2xl bg-white px-5 py-3 shadow"
                >
                  <span className="font-bold">
                    {i + 1}등 {s.player.emoji} {s.player.nickname}
                  </span>
                </motion.li>
              ))}
            </ul>
            <p className="mt-2 font-bold text-gray-500">탈락자 {losers.length}명</p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: survivors.length * 0.3 + 0.3 }}
              className="text-gray-600"
            >
              {losers.length === 0 ? "탈락자가 없어요" : losers.map((p) => `${p.emoji}${p.nickname}`).join("  ")}
            </motion.p>
            <button onClick={() => setPhase("photos")} className={`${btn} mt-2`}>
              생존자 사진 보기
            </button>
          </motion.section>
        )}

        {phase === "photos" && (
          <motion.section key="photos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-4">
            <h2 className="text-2xl font-bold">생존자 사진</h2>
            <ul className="grid max-h-[55dvh] w-full grid-cols-2 gap-3 overflow-y-auto p-1">
              {survivors.map((s, i) => (
                <li key={s.player.id} className="flex flex-col items-center gap-1 rounded-2xl bg-white p-2 shadow">
                  <Photo s={s.submission} className="aspect-square w-full rounded-xl" />
                  <span className="text-xs text-gray-500">{data.missionTexts[s.submission.id]}</span>
                  <span className="font-bold">
                    {i + 1}등 {s.player.emoji} {s.player.nickname}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button onClick={() => setPhase("card")} className={btn}>결과 카드</button>
              <button onClick={() => setPhase("next")} className={btn}>다음 라운드</button>
            </div>
          </motion.section>
        )}

        {phase === "card" && (
          <motion.section key="card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex w-full flex-col items-center gap-3">
            <ShareCard
              title="생존자"
              subtitle={`탈락 ${losers.length}명`}
              rows={survivors.map((s, i) => ({
                emoji: s.player.emoji,
                name: s.player.nickname,
                value: `${i + 1}등`,
              }))}
            />
            <button onClick={() => setPhase("photos")} className="text-sm text-gray-500 underline">돌아가기</button>
          </motion.section>
        )}

        {phase === "next" && (
          <motion.section key="next" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center gap-4">
            <h2 className="text-2xl font-bold">다음 라운드</h2>
            {!isHost ? (
              <p className="text-gray-600">방장이 다음 라운드 참가자를 정해요</p>
            ) : (
              <>
                <p className="text-gray-600">누구와 이어서 할까요?</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {(
                    [
                      ["survivors", `생존자끼리 (${survivors.length}명)`],
                      ["losers", `탈락자끼리 (${losers.length}명)`],
                      ["custom", "직접 선택"],
                    ] as [Target, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setTarget(key);
                        setConfirmed(false);
                      }}
                      className={`rounded-full border-2 px-4 py-2 font-bold ${
                        target === key ? "border-red-500 bg-white" : "border-transparent bg-white/60"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {target === "custom" && (
                  <ul className="grid max-h-[35dvh] w-full grid-cols-2 gap-2 overflow-y-auto p-1">
                    {data.players.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => togglePick(p.id)}
                          className={`w-full rounded-xl border-2 bg-white px-3 py-2 font-bold ${
                            picked.includes(p.id) ? "border-red-500" : "border-transparent"
                          }`}
                        >
                          {p.emoji} {p.nickname}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button disabled={!target || chosenIds.length === 0} onClick={() => setConfirmed(true)} className={btn}>
                  {chosenIds.length}명으로 정하기
                </button>
                {confirmed && (
                  <p className="text-sm text-gray-500">
                    선택을 저장했어요. 다음 라운드 시작은 서버 연결 후에 가능해요.
                  </p>
                )}
              </>
            )}
            <button onClick={() => setPhase("photos")} className="text-sm text-gray-500 underline">돌아가기</button>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}