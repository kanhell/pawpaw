"use client";

import { useState } from "react";
import { ROUTES } from "@pawpaw/shared";
import Popup from "../../components/Popup";
import { describeError } from "../../lib/firebase/errors";
import { useLatestInvite, useNow } from "../../lib/firebase/hooks";
import { renewInvite, revokeInvites } from "../../lib/firebase/roomRepo";
import { useBrowserInfo } from "../../lib/invite/useBrowserInfo";

// 초대 팝업 (방장만, 게임 시작 전): 초대 링크를 만들고 공유한다.
export default function InvitePopup({
  roomId,
  uid,
  onClose,
}: {
  roomId: string;
  uid: string;
  onClose: () => void;
}) {
  const invite = useLatestInvite(roomId, uid, true);
  const now = useNow();
  const { origin } = useBrowserInfo();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeInvite = invite.status === "ready" ? invite.data : null;
  const inviteUrl =
    activeInvite && origin ? `${origin}${ROUTES.invite(roomId, activeInvite.code)}` : null;
  const expiresAtMs = activeInvite ? new Date(activeInvite.expiresAt).getTime() : 0;
  const expired = activeInvite !== null && expiresAtMs <= now;

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("링크를 복사했어요.");
    } catch {
      setError("복사하지 못했어요. 링크를 길게 눌러 직접 복사해 주세요.");
    }
  }

  async function handleShare() {
    if (!inviteUrl) return;
    if (typeof navigator.share !== "function") {
      await handleCopy();
      return;
    }
    try {
      await navigator.share({
        title: "포포 초대",
        text: "포포에 초대할게요! 링크를 눌러 참가해 주세요.",
        url: inviteUrl,
      });
    } catch (e) {
      // 사용자가 공유창을 닫은 경우는 오류로 보지 않는다.
      if ((e as { name?: string }).name !== "AbortError") {
        setError("공유하지 못했어요. 링크를 복사해서 보내 주세요.");
      }
    }
  }

  return (
    <Popup title="친구 초대하기" onClose={onClose}>
      {invite.status === "loading" && (
        <p className="text-sm text-ink-muted">초대 링크를 불러오는 중…</p>
      )}
      {invite.status === "error" && <p className="text-sm text-primary">{invite.message}</p>}

      {invite.status === "ready" && !activeInvite && (
        <button
          onClick={() => run(async () => void (await renewInvite(roomId, uid)))}
          disabled={busy}
          className="rounded-full bg-primary px-6 py-2 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
        >
          초대 링크 만들기
        </button>
      )}

      {activeInvite && inviteUrl && (
        <>
          <p className="w-full break-all rounded-card bg-surface p-3 text-xs text-ink-muted shadow-card">
            {inviteUrl}
          </p>
          <p className="text-xs text-ink-subtle">
            {expired
              ? "링크가 만료됐어요. 새 링크를 만들어 주세요."
              : `${new Date(activeInvite.expiresAt).toLocaleString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}까지 유효해요.`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              disabled={busy || expired}
              className="rounded-full bg-primary px-6 py-2 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
            >
              공유하기
            </button>
            <button
              onClick={handleCopy}
              disabled={busy || expired}
              className="rounded-full bg-surface px-6 py-2 font-bold text-ink shadow-card active:scale-95 disabled:opacity-50"
            >
              복사
            </button>
          </div>
          <div className="flex gap-4 text-xs text-ink-subtle">
            <button
              onClick={() => run(async () => void (await renewInvite(roomId, uid)))}
              disabled={busy}
              className="underline"
            >
              새 링크 만들기
            </button>
            <button
              onClick={() => run(() => revokeInvites(roomId))}
              disabled={busy}
              className="underline"
            >
              링크 폐기
            </button>
          </div>
        </>
      )}

      {notice && <p className="text-xs text-ink-muted">{notice}</p>}
      {error && <p className="text-xs text-primary">{error}</p>}
    </Popup>
  );
}
