"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuthState } from "../../../../src/lib/firebase/auth";
import { RESULTS_NOT_OPEN, resultRepository } from "./repository";
import type { RoomData } from "./types";
import OneshotResult from "./modes/OneshotResult";
import RaceResult from "./modes/RaceResult";
import EndlessResult from "./modes/EndlessResult";
import DailyResult from "./modes/DailyResult";

const shell =
  "mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center bg-amber-50 p-6 text-center";

export default function ResultPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const auth = useAuthState();
  const uid = auth.status === "signedIn" ? auth.uid : null;

  const [data, setData] = useState<RoomData | null>(null);
  const [error, setError] = useState<"notOpen" | "failed" | null>(null);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const load = async (): Promise<RoomData | null> => {
    if (!uidRef.current) return null;
    try {
      const d = await resultRepository.getRoomData(roomId, uidRef.current);
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.message === RESULTS_NOT_OPEN ? "notOpen" : "failed");
      return null;
    }
  };

  useEffect(() => {
    if (uid) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, uid]);

  if (auth.status === "error") {
    return (
      <main className={shell}>
        <p className="text-gray-600">로그인에 실패했어요.</p>
        <p className="mt-2 text-sm text-gray-400">{auth.message}</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className={shell}>
        <p className="text-gray-600">
          {error === "notOpen"
            ? "아직 결과 공개 전이거나 이 방의 멤버가 아니에요."
            : "데이터를 불러오지 못했어요."}
        </p>
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

  // 모드별 결과 화면 연결
  switch (data.mode) {
    case "oneshot":
      return <OneshotResult roomId={roomId} data={data} onReload={load} />;
    case "race":
      return <RaceResult roomId={roomId} data={data} onReload={load} />;
    case "endless":
      return <EndlessResult roomId={roomId} data={data} onReload={load} />;
        case "daily":
    case "solo": // 1인 모드는 매일 모드에 합쳐져 있어요
      return <DailyResult data={data} />;
    default:
      return (
        <main className={shell}>
          <p className="text-gray-600">이 모드의 결과 화면은 준비 중이에요.</p>
          <p className="mt-2 text-sm text-gray-400">({data.mode})</p>
        </main>
      );
  }
}