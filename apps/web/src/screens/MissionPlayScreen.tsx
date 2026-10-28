"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import ScreenShell from "../components/ScreenShell";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import {
  useMyAssignment,
  useMySubmission,
  useStoragePhoto,
} from "../lib/firebase/hooks";
import { submitPhoto } from "../lib/firebase/roomRepo";
import { fileToResizedBlob } from "../lib/image";
import { getMission } from "../lib/missions";

interface PendingPhoto {
  blob: Blob;
  url: string; // 미리보기용 임시 주소
}

export default function MissionPlayScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const auth = useAuthState();
  const uid = auth.status === "signedIn" ? auth.uid : null;
  const assignment = useMyAssignment(roomId, uid);
  const submission = useMySubmission(roomId, uid);
  const savedSubmission = submission.status === "ready" ? submission.data : null;
  const saved = useStoragePhoto(
    savedSubmission?.photoPath ?? null,
    savedSubmission?.submittedAt ?? null,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto | null>(null); // 아직 제출 전인 사진
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미리보기 임시 주소는 사진이 바뀌거나 화면을 떠날 때 해제한다.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  if (auth.status === "error") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">로그인하지 못했어요.</p>
        <p className="text-sm text-ink-subtle">{auth.message}</p>
      </ScreenShell>
    );
  }
  if (assignment.status === "error" || submission.status === "error") {
    const message =
      assignment.status === "error"
        ? assignment.message
        : submission.status === "error"
          ? submission.message
          : "";
    return (
      <ScreenShell>
        <div className="text-6xl">🚪</div>
        <p className="text-ink-muted">{message}</p>
        <Link href={ROUTES.roomNew} className="text-sm text-ink-subtle underline">
          새 방 만들기
        </Link>
      </ScreenShell>
    );
  }
  if (
    auth.status === "loading" ||
    assignment.status !== "ready" ||
    submission.status !== "ready"
  ) {
    return (
      <ScreenShell>
        <p className="text-ink-muted">불러오는 중…</p>
      </ScreenShell>
    );
  }

  const mine = assignment.data;
  const mission = mine ? getMission(mine.missionId) : undefined;

  if (!mine || !mission) {
    return (
      <ScreenShell>
        <div className="text-6xl">📭</div>
        <h1 className="text-2xl font-bold">아직 받은 미션이 없어요</h1>
        <Link
          href={ROUTES.assign(roomId)}
          className="rounded-full bg-primary px-8 py-3 font-bold text-primary-foreground active:scale-95"
        >
          미션 받으러 가기
        </Link>
      </ScreenShell>
    );
  }

  const shownPhoto = pending?.url ?? saved.url;

  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 사진을 다시 골라도 동작하도록 초기화
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await fileToResizedBlob(file);
      setPending({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!pending || !uid || !mine) return;
    setError(null);
    setBusy(true);
    try {
      await submitPhoto(roomId, uid, mine.id, pending.blob);
      setPending(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
        <p className="text-sm text-ink-subtle">
          내 미션 · {mission.category} · {"★".repeat(mission.difficulty)}
        </p>
        <p className="mt-3 text-xl font-bold">{mission.text}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />

      {shownPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shownPhoto}
          alt="미션 인증 사진"
          className="w-full rounded-card object-cover shadow-card"
        />
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-ink-subtle text-ink-muted active:scale-95 disabled:opacity-50"
        >
          <span className="text-4xl">📷</span>
          <span className="font-bold">
            {savedSubmission && !saved.failed
              ? "사진을 불러오는 중…"
              : savedSubmission && saved.failed
                ? "사진을 불러오지 못했어요"
                : busy
                  ? "불러오는 중…"
                  : "인증 사진 올리기"}
          </span>
        </button>
      )}

      {error && <p className="text-sm text-primary">{error}</p>}

      {pending ? (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
          >
            {busy ? "올리는 중…" : "제출하기"}
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-sm text-ink-subtle underline"
          >
            다른 사진 고르기
          </button>
        </div>
      ) : savedSubmission ? (
        <div className="flex flex-col items-center gap-3">
          <p className="font-bold">
            제출 완료 ✅{" "}
            <span className="text-sm font-normal text-ink-subtle">
              {new Date(savedSubmission.submittedAt).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-sm text-ink-subtle underline"
          >
            사진 바꾸기
          </button>
        </div>
      ) : null}
    </ScreenShell>
  );
}
