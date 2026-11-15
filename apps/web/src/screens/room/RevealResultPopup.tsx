"use client";

import { useState } from "react";
import type { Room } from "@pawpaw/shared";
import Popup from "../../components/Popup";
import { describeError } from "../../lib/firebase/errors";
import { revealResultsNow } from "../../lib/firebase/roomRepo";

// 방장 전용: 정해 둔 시각 전에 결과를 지금 공개할지 확인한다. 되돌릴 수 없다.
export default function RevealResultPopup({
  room,
  waitingCount,
  onClose,
}: {
  room: Room;
  waitingCount: number; // 아직 제출하지 않은 멤버 수
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduledText = room.resultAt
    ? new Date(room.resultAt).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  async function handleReveal() {
    setError(null);
    setBusy(true);
    try {
      await revealResultsNow(room.id);
      onClose();
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <Popup title="🎉 결과를 지금 공개할까요?" onClose={busy ? undefined : onClose}>
      <p className="text-sm text-ink-muted">
        {scheduledText ? `정해 둔 시각은 ${scheduledText}이에요. ` : ""}
        {waitingCount > 0 ? `아직 ${waitingCount}명이 제출하지 않았어요. ` : ""}
        공개하면 모두의 사진이 보이고 더 이상 제출할 수 없어요.
      </p>
      {error && <p className="text-sm text-primary">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleReveal}
          disabled={busy}
          className="rounded-full bg-primary px-6 py-2 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
        >
          {busy ? "공개하는 중…" : "공개하기"}
        </button>
        <button
          onClick={onClose}
          disabled={busy}
          className="rounded-full bg-surface px-6 py-2 font-bold text-ink shadow-card active:scale-95 disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </Popup>
  );
}
