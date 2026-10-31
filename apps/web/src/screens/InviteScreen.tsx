"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import ProfileFields from "../components/ProfileFields";
import ScreenShell from "../components/ScreenShell";
import { ANIMALS } from "../lib/animals";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import { useMembership } from "../lib/firebase/hooks";
import { joinRoom } from "../lib/firebase/roomRepo";
import { isValidInviteCode } from "../lib/invite/code";
import { manualOpenGuide, planExternalOpen } from "../lib/invite/inAppBrowser";
import { useBrowserInfo } from "../lib/invite/useBrowserInfo";

// 초대 링크(/invite/{방ID}/{코드})로 들어온 사람이 보는 화면.
// 카카오톡 같은 인앱 브라우저에서 열렸다면 기본 브라우저로 옮기고, 그 뒤에 참가를 받는다.
export default function InviteScreen() {
  const { roomId, code } = useParams<{ roomId: string; code: string }>();
  const router = useRouter();
  const { userAgent, href } = useBrowserInfo();
  const plan = useMemo(
    () => (href ? planExternalOpen(userAgent, href) : ({ kind: "none" } as const)),
    [userAgent, href],
  );
  const inAppBrowser = plan.kind !== "none";

  // 인앱 브라우저에서는 로그인을 시작하지 않는다. (기본 브라우저에서 다시 열기 때문)
  // userAgent가 비어 있는 동안은 아직 브라우저 정보를 모르는 상태다.
  const auth = useAuthState(userAgent !== "" && !inAppBrowser);
  const uid = auth.status === "signedIn" ? auth.uid : null;
  const membership = useMembership(roomId, uid);

  const [nickname, setNickname] = useState("");
  const [animal, setAnimal] = useState(ANIMALS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 인앱 브라우저면 한 번만 자동으로 기본 브라우저를 열어 본다.
  useEffect(() => {
    if (plan.kind !== "redirect") return;
    const key = `pawpaw:external-open:${href}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // 저장소를 쓸 수 없으면 기록 없이 시도한다.
    }
    window.location.href = plan.href;
  }, [plan, href]);

  // 이미 참가한 사람이 링크를 다시 열면 대기실로 보낸다.
  useEffect(() => {
    if (membership.status === "ready" && membership.data) {
      router.replace(ROUTES.lobby(roomId));
    }
  }, [membership, roomId, router]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function handleJoin() {
    if (!uid) return;
    const name = nickname.trim();
    if (!name) {
      setError("닉네임을 입력해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await joinRoom(uid, roomId, code, { nickname: name, animal });
      router.replace(ROUTES.lobby(roomId));
    } catch (e) {
      const errorCode = (e as { code?: string }).code ?? "";
      setError(
        errorCode.includes("permission-denied")
          ? "참가할 수 없어요. 링크가 만료됐거나 이미 시작된 방일 수 있어요. 방장에게 새 링크를 받아 주세요."
          : describeError(e),
      );
      setBusy(false);
    }
  }

  if (!isValidInviteCode(code)) {
    return (
      <ScreenShell>
        <div className="text-6xl">🔗</div>
        <h1 className="text-2xl font-bold">초대 링크가 올바르지 않아요</h1>
        <p className="text-sm text-ink-muted">
          방장에게 링크를 다시 받아 주세요.
        </p>
      </ScreenShell>
    );
  }

  if (inAppBrowser) {
    return (
      <ScreenShell>
        <div className="text-6xl">🌐</div>
        <h1 className="text-2xl font-bold">기본 브라우저에서 열어 주세요</h1>
        <p className="text-sm text-ink-muted">
          앱 안의 브라우저에서는 참가가 불안정할 수 있어요.
        </p>
        {plan.kind === "redirect" && (
          <button
            onClick={() => {
              window.location.href = plan.href;
            }}
            className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95"
          >
            기본 브라우저로 열기
          </button>
        )}
        <p className="text-sm text-ink-muted">
          {manualOpenGuide(plan.browser, plan.os)}
        </p>
        <button
          onClick={handleCopy}
          className="text-sm text-ink-subtle underline"
        >
          {copied ? "링크를 복사했어요" : "링크 복사해서 직접 열기"}
        </button>
      </ScreenShell>
    );
  }

  if (auth.status === "error") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">로그인하지 못했어요.</p>
        <p className="text-sm text-ink-subtle">{auth.message}</p>
      </ScreenShell>
    );
  }
  if (auth.status === "loading" || membership.status === "loading") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">불러오는 중…</p>
      </ScreenShell>
    );
  }
  if (membership.status === "error") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">{membership.message}</p>
      </ScreenShell>
    );
  }
  if (membership.data) {
    return (
      <ScreenShell>
        <p className="text-ink-muted">대기실로 이동하는 중…</p>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <div className="text-6xl">💌</div>
      <h1 className="text-2xl font-bold">포포에 초대받았어요</h1>
      <p className="text-sm text-ink-muted">
        닉네임과 동물을 고르고 참가해 보세요.
      </p>

      <ProfileFields
        nickname={nickname}
        animal={animal}
        onNicknameChange={setNickname}
        onAnimalChange={setAnimal}
      />

      {error && <p className="text-sm text-primary">{error}</p>}

      <button
        onClick={handleJoin}
        disabled={busy}
        className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
      >
        {busy ? "참가하는 중…" : "참가하기"}
      </button>
    </ScreenShell>
  );
}
