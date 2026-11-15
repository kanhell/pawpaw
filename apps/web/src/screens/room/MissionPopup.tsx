"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Assignment, Room } from "@pawpaw/shared";
import ChoiceButtons from "../../components/ChoiceButtons";
import Popup from "../../components/Popup";
import { describeError } from "../../lib/firebase/errors";
import { useMySubmission, useStoragePhoto } from "../../lib/firebase/hooks";
import { markSubmitted, submitPhoto, type MemberProfile } from "../../lib/firebase/roomRepo";
import { fileToResizedBlob } from "../../lib/image";
import { describeAssignmentMission } from "../../lib/missions";

// 방금 고른 사진. 고르는 즉시 올리고, 올리는 동안과 올린 뒤에도 이 미리보기를 보여준다.
interface PendingPhoto {
  blob: Blob;
  url: string; // 미리보기용 임시 주소
  status: "uploading" | "failed" | "done";
}

// 미션 팝업 (게임 시작 후 '미션' 버튼): 내 미션을 보고 인증 사진을 올린다.
export default function MissionPopup({
  room,
  members,
  uid,
  assignment,
  onClose,
}: {
  room: Room;
  members: MemberProfile[];
  uid: string;
  assignment: Assignment;
  onClose: () => void;
}) {
  const roomId = room.id;
  const submission = useMySubmission(roomId, uid);
  const savedSubmission = submission.status === "ready" ? submission.data : null;
  const saved = useStoragePhoto(
    savedSubmission?.photoPath ?? null,
    savedSubmission?.submittedAt ?? null,
  );
  const myProfile = members.find((member) => member.player.id === uid);
  // 제출했는데 '제출했어요' 표시가 아직 없으면 남긴다. (제출 직후, 또는 표시를 남기지 못했던 경우)
  const needsMark =
    savedSubmission !== null && myProfile !== undefined && myProfile.player.submitted !== true;

  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmChange, setConfirmChange] = useState(false); // '사진 바꾸기' 확인 팝업

  // 미리보기 임시 주소는 사진이 바뀌거나 팝업을 닫을 때 해제한다.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  useEffect(() => {
    if (needsMark) markSubmitted(roomId, uid).catch(() => {});
  }, [needsMark, roomId, uid]);

  const mission = describeAssignmentMission(assignment);
  const closed = room.status === "finished"; // 결과가 열리면 더 이상 제출할 수 없다
  const shownPhoto = pending?.url ?? saved.url;

  // 사진을 올린다. 성공하면 그대로 제출 완료다. ('제출하기' 버튼 없이 고르는 즉시 올린다)
  async function upload(photo: Omit<PendingPhoto, "status">) {
    setError(null);
    setBusy(true);
    setPending({ ...photo, status: "uploading" });
    try {
      await submitPhoto(roomId, uid, assignment.id, photo.blob);
      setPending({ ...photo, status: "done" });
    } catch (e) {
      setPending({ ...photo, status: "failed" });
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
    let blob: Blob;
    try {
      blob = await fileToResizedBlob(file);
    } catch {
      setError("사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.");
      setBusy(false);
      return;
    }
    await upload({ blob, url: URL.createObjectURL(blob) });
  }

  return (
    <>
      <Popup title="미션" onClose={onClose}>
        <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
          <p className="text-xl font-bold">{mission?.text ?? "미션을 불러오지 못했어요"}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePick}
        />

        {submission.status === "error" ? (
          <p className="text-sm text-primary">{submission.message}</p>
        ) : shownPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownPhoto}
            alt="미션 인증 사진"
            className={`w-full rounded-card object-cover shadow-card ${
              pending?.status === "uploading" ? "opacity-50" : ""
            }`}
          />
        ) : closed && !savedSubmission ? (
          <p className="w-full rounded-card bg-surface px-4 py-6 text-ink-muted shadow-card">
            제출이 마감됐어요.
          </p>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy || submission.status === "loading"}
            className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-ink-subtle bg-surface/60 text-ink-muted active:scale-95 disabled:opacity-50"
          >
            <span className="text-4xl">📷</span>
            <span className="font-bold">
              {submission.status === "loading"
                ? "불러오는 중…"
                : savedSubmission && !saved.failed
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

        {pending?.status === "uploading" ? (
          <p className="font-bold text-ink-muted">올리는 중…</p>
        ) : pending?.status === "failed" ? (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => upload(pending)}
              disabled={busy}
              className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
            >
              다시 올리기
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
            <p className="font-bold text-success">
              제출 완료{" "}
              <span className="text-sm font-normal text-ink-subtle">
                {new Date(savedSubmission.submittedAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </p>
            {!closed && (
              <button
                onClick={() => setConfirmChange(true)}
                disabled={busy}
                className="text-sm text-ink-subtle underline"
              >
                사진 바꾸기
              </button>
            )}
          </div>
        ) : null}
      </Popup>

      {/* 사진을 바꾸면 다시 제출하는 것이라 제출 시각도 지금으로 바뀐다. */}
      {confirmChange && (
        <Popup
          title="사진을 바꿀까요?"
          onClose={() => setConfirmChange(false)}
        >
          <p className="text-sm text-ink-muted">
            사진을 바꾸면 제출 시각도 지금 시각으로 바뀌어요.
          </p>
          <ChoiceButtons
            confirmLabel="새 사진 고르기"
            onCancel={() => setConfirmChange(false)}
            onConfirm={() => {
              setConfirmChange(false);
              inputRef.current?.click(); // 누른 순간에 열어야 iOS에서도 사진 선택이 뜬다
            }}
          />
        </Popup>
      )}
    </>
  );
}
