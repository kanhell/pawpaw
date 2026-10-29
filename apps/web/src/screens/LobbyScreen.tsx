"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import ScreenShell from "../components/ScreenShell";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import {
  useLatestInvite,
  useMembers,
  useNow,
  useRoom,
} from "../lib/firebase/hooks";
import { renewInvite, revokeInvites } from "../lib/firebase/roomRepo";
import { useBrowserInfo } from "../lib/invite/useBrowserInfo";

// 대기실: 참가자를 실시간으로 보여주고, 방장은 초대 링크를 만들어 공유한다.
export default function LobbyScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const auth = useAuthState();
  const uid = auth.status === "signedIn" ? auth.uid : null;
  const room = useRoom(roomId, uid);
  const members = useMembers(roomId, uid);
  const isHost = room.status === "ready" && room.data?.hostId === uid;
  const invite = useLatestInvite(roomId, uid, isHost);
  const now = useNow();
  const { origin } = useBrowserInfo();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 게임이 시작되면(미션이 부여되면) 모두 미션 화면으로 이동한다.
  const started = room.status === "ready" && room.data?.status === "playing";
  useEffect(() => {
    if (started) router.replace(ROUTES.assign(roomId));
  }, [started, roomId, router]);

  if (auth.status === "error") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">로그인하지 못했어요.</p>
        <p className="text-sm text-ink-subtle">{auth.message}</p>
      </ScreenShell>
    );
  }
  const failed = [room, members].find((r) => r.status === "error");
  if (failed && failed.status === "error") {
    return (
      <ScreenShell>
        <div className="text-6xl">🚪</div>
        <p className="text-ink-muted">{failed.message}</p>
        <Link href={ROUTES.roomNew} className="text-sm text-ink-subtle underline">
          새 방 만들기
        </Link>
      </ScreenShell>
    );
  }
  if (
    auth.status === "loading" ||
    room.status !== "ready" ||
    members.status !== "ready" ||
    room.data === null
  ) {
    return (
      <ScreenShell>
        <p className="text-ink-muted">불러오는 중…</p>
      </ScreenShell>
    );
  }

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
    <ScreenShell>
      <div className="text-6xl">🏠</div>
      <h1 className="text-2xl font-bold">대기실</h1>

      <ul className="flex flex-wrap justify-center gap-2">
        {members.data.map(({ player, nickname }) => (
          <li
            key={player.id}
            className="rounded-full bg-surface px-4 py-2 shadow-card"
          >
            {player.animal} {nickname}
            {player.isHost ? " 👑" : ""}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">참가자 {members.data.length}명</p>

      {isHost ? (
        <div className="flex w-full flex-col items-center gap-3 rounded-sheet bg-surface p-5 shadow-card">
          <p className="font-bold">친구 초대하기</p>

          {invite.status === "loading" && (
            <p className="text-sm text-ink-muted">초대 링크를 불러오는 중…</p>
          )}
          {invite.status === "error" && (
            <p className="text-sm text-primary">{invite.message}</p>
          )}

          {invite.status === "ready" && !activeInvite && (
            <button
              onClick={() => run(async () => void (await renewInvite(roomId, uid ?? "")))}
              disabled={busy}
              className="rounded-full bg-primary px-6 py-2 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
            >
              초대 링크 만들기
            </button>
          )}

          {activeInvite && inviteUrl && (
            <>
              <p className="w-full break-all rounded-card bg-canvas p-3 text-xs text-ink-muted">
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
                  className="rounded-full bg-canvas px-6 py-2 font-bold text-ink active:scale-95 disabled:opacity-50"
                >
                  복사
                </button>
              </div>
              <div className="flex gap-4 text-xs text-ink-subtle">
                <button
                  onClick={() => run(async () => void (await renewInvite(roomId, uid ?? "")))}
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
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          방장이 시작하면 자동으로 넘어가요.
        </p>
      )}

      {isHost && (
        <Link
          href={ROUTES.assign(roomId)}
          className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95"
        >
          게임 시작
        </Link>
      )}
    </ScreenShell>
  );
}
