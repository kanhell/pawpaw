"use client";

import { useEffect } from "react";
import { resultRepository } from "./repository";
import type { RoomData } from "./types";

// active가 true인 동안 3초마다 fn 실행 (친구들을 기다리는 화면용)
export function usePolling(active: boolean, fn: () => unknown, ms = 3000) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }, [active, fn, ms]);
}

// 이의제기 저장 동작 (모드마다 같은 코드를 쓴다)
export function makeObjectionActions(
  roomId: string,
  data: RoomData,
  onReload: () => Promise<RoomData | null>
) {
  return {
    objectTo: async (submissionId: string) => {
      await resultRepository.submitObjection(roomId, data.me, submissionId);
      await onReload();
    },
    finish: async (): Promise<boolean> => {
      try {
        await resultRepository.submitObjectionDone(roomId, data.me);
        await onReload();
        return true;
      } catch (e) {
        console.error(e);
        alert("저장에 실패했어요. 다시 시도해 주세요.");
        return false;
      }
    },
  };
}