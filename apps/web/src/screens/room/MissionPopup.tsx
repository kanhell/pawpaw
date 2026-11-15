"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Assignment, Room } from "@pawpaw/shared";
import Popup from "../../components/Popup";
import { describeError } from "../../lib/firebase/errors";
import {
  useMySubmission,
  useRoomAssignments,
  useStoragePhoto,
} from "../../lib/firebase/hooks";
import { markSubmitted, submitPhoto, type MemberProfile } from "../../lib/firebase/roomRepo";
import { fileToResizedBlob } from "../../lib/image";
import { describeAssignmentMission } from "../../lib/missions";

interface PendingPhoto {
  blob: Blob;
  url: string; // 미리보기용 임시 주소
}

// 미션을 '미리 전체 공개'로 정한 방에서만 보이는 친구들의 미션
function FriendsMissions({
  roomId,
  uid,
  members,
}: {
  roomId: string;
  uid: string;
  members: MemberProfile[];
}) {
  const everyone = useRoomAssignments(roomId, uid, true);
  const byId = new Map(members.map((profile) => [profile.player.id, profile] as const));

  return (
    <section className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
      <p className="font-bold">친구들의 미션</p>
      {everyone.status === "loading" && <p className="mt-2 text-sm text-ink-muted">불러오는 중…</p>}
      {everyone.status === "error" && <p className="mt-2 text-sm text-primary">{everyone.message}</p>}
      {everyone.status === "ready" && (
        <ul className="mt-3 space-y-2">
          {everyone.data.map((item) => {
            const receiver = byId.get(item.receiverId);
            const giver = item.giverId ? byId.get(item.giverId) : undefined;
            const view = describeAssignmentMission(item);
            return (
              <li key={item.id} className="rounded-card bg-canvas px-4 py-3">
                <p className="text-sm text-ink-subtle">
                  {receiver ? `${receiver.player.animal} ${receiver.nickname}` : "알 수 없음"}
                  {giver ? ` · 정해준 사람: ${giver.nickname}` : ""}
                </p>
                <p className="font-bold">{view?.text ?? "미션을 불러오지 못했어요"}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
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
  const [pending, setPending] = useState<PendingPhoto | null>(null); // 아직 제출 전인 사진
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      await submitPhoto(roomId, uid, assignment.id, pending.blob);
      setPending(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup title="📮 내 미션" onClose={onClose}>
      <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
        <p className="text-sm text-ink-subtle">{mission?.label ?? "내 미션"}</p>
        <p className="mt-3 text-xl font-bold">{mission?.text ?? "미션을 불러오지 못했어요"}</p>
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
          className="w-full rounded-card object-cover shadow-card"
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

      {room.settings.visibility === "public" ? (
        <FriendsMissions roomId={roomId} uid={uid} members={members} />
      ) : (
        <p className="text-sm text-ink-muted">다른 친구들의 미션은 비밀이에요 🤫</p>
      )}
    </Popup>
  );
}
