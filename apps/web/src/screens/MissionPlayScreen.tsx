"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import ScreenShell from "../components/ScreenShell";
import SubmissionStatus from "../components/SubmissionStatus";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import {
  useMembers,
  useMyAssignment,
  useMySubmission,
  useNow,
  useRoom,
  useStoragePhoto,
} from "../lib/firebase/hooks";
import {
  markSubmitted,
  revealResultsNow,
  submitPhoto,
} from "../lib/firebase/roomRepo";
import { fileToResizedBlob } from "../lib/image";
import { describeAssignmentMission } from "../lib/missions";

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

  // 방 정보와 멤버별 제출 현황 (제출 여부만 보인다. 사진은 보이지 않는다)
  const room = useRoom(roomId, uid);
  const members = useMembers(roomId, uid);
  const now = useNow();
  const myProfile =
    members.status === "ready"
      ? members.data.find((member) => member.player.id === uid)
      : undefined;
  // 제출했는데 '제출했어요' 표시가 아직 없으면 남긴다. (제출 직후, 또는 표시를 남기지 못했던 경우)
  const needsMark =
    savedSubmission !== null && myProfile !== undefined && myProfile.player.submitted !== true;

  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto | null>(null); // 아직 제출 전인 사진
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false); // 방장의 결과 공개 확인 중

  // 미리보기 임시 주소는 사진이 바뀌거나 화면을 떠날 때 해제한다.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  useEffect(() => {
    if (needsMark && uid) markSubmitted(roomId, uid).catch(() => {});
  }, [needsMark, roomId, uid]);

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
  // 기본 제공 미션과 친구가 직접 정해준 미션을 모두 보여준다.
  const mission = mine ? describeAssignmentMission(mine) : undefined;

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

  // 결과 공개: 방장이 먼저 열었거나(finished) 정해 둔 시각이 지났을 때
  const roomData = room.status === "ready" ? room.data : null;
  const isHost = roomData !== null && roomData.hostId === uid;
  const closed = roomData?.status === "finished"; // 방장이 결과를 열면 더 이상 제출할 수 없다
  const resultAtMs = roomData?.resultAt ? new Date(roomData.resultAt).getTime() : null;
  const resultOpen = closed || (resultAtMs !== null && resultAtMs <= now);
  const waitingCount =
    members.status === "ready"
      ? members.data.filter((member) => member.player.submitted !== true).length
      : 0;
  const scheduledText = roomData?.resultAt
    ? new Date(roomData.resultAt).toLocaleString("ko-KR", {
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
      await revealResultsNow(roomId);
      setConfirming(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

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
        <p className="text-sm text-ink-subtle">내 미션 · {mission.label}</p>
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
      ) : closed && !savedSubmission ? (
        <p className="rounded-card bg-surface px-4 py-6 text-ink-muted shadow-card">
          제출이 마감됐어요.
        </p>
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
          {!closed && (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="text-sm text-ink-subtle underline"
            >
              사진 바꾸기
            </button>
          )}
        </div>
      ) : null}

      {resultOpen && (
        <Link
          href={ROUTES.result(roomId)}
          className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95"
        >
          🎉 결과 보러 가기
        </Link>
      )}

      {members.status === "ready" && (
        <SubmissionStatus profiles={members.data} myId={uid} />
      )}

      {isHost && !resultOpen && (
        <div className="flex w-full flex-col items-center gap-3 rounded-sheet bg-surface p-5 shadow-card">
          {confirming ? (
            <>
              <p className="text-sm text-ink-muted">
                {waitingCount > 0 ? `아직 ${waitingCount}명이 제출하지 않았어요. ` : ""}
                공개하면 모두의 사진이 보이고 더 이상 제출할 수 없어요. 공개할까요?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleReveal}
                  disabled={busy}
                  className="rounded-full bg-primary px-6 py-2 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
                >
                  {busy ? "공개하는 중…" : "공개하기"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="rounded-full bg-canvas px-6 py-2 font-bold text-ink active:scale-95 disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirming(true)}
                className="rounded-full bg-canvas px-6 py-2 font-bold text-ink active:scale-95"
              >
                지금 결과 공개하기
              </button>
              <p className="text-xs text-ink-subtle">
                {scheduledText
                  ? `정해 둔 시각(${scheduledText}) 전에도 공개할 수 있어요.`
                  : "결과 공개 시각을 정하지 않았어요. 준비되면 직접 공개해 주세요."}
              </p>
            </>
          )}
        </div>
      )}
    </ScreenShell>
  );
}
