"use client";

import { useState } from "react";
import type { Room } from "@pawpaw/shared";
import BottomButton from "../../components/BottomButton";
import Popup from "../../components/Popup";
import { describeError } from "../../lib/firebase/errors";
import {
  giveMission,
  giveMissionToAll,
  revealMissions,
  type MemberProfile,
} from "../../lib/firebase/roomRepo";
import { MISSION_TEXT_MAX } from "../../lib/missions";
import { receiverOf, ringOrder } from "../../lib/pairing";

// 미션 설정 팝업 (phase = assign, assigner = players 동안 모두에게 뜨고 닫을 수 없다)
// - 각자 다른 미션: 참가 순서대로 다음 사람에게 줄 미션을 각자 적는다.
// - 모두 같은 미션: 방장이 모두가 할 미션 하나를 적는다.
// 모두 정하면 방장이 미션을 공개(phase = play)한다. (docs/MISSION_ASSIGN.md)
export default function MissionSetPopup({
  room,
  members,
  uid,
}: {
  room: Room;
  members: MemberProfile[];
  uid: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomId = room.id;
  const { scope } = room.settings;
  const hostId = room.hostId;
  const isHost = hostId === uid;

  const byId = new Map(members.map((profile) => [profile.player.id, profile] as const));
  const ordered = ringOrder(members.map((profile) => profile.player));
  const doneCount = ordered.filter((player) => player.assignmentDone === true).length;
  const iDone = ordered.find((player) => player.id === uid)?.assignmentDone === true;
  const hostDone = ordered.find((player) => player.id === hostId)?.assignmentDone === true;
  const allDone =
    scope === "same" ? hostDone : ordered.length > 0 && doneCount === ordered.length;
  const target = receiverOf(ordered, uid);
  const targetProfile = target ? byId.get(target.id) : undefined;
  const targetLabel = targetProfile
    ? target?.id === uid
      ? "나"
      : `${targetProfile.player.animal} ${targetProfile.nickname}`
    : "친구";
  // 보내기 버튼에 쓰는 받는 사람 이름. 버튼이 커지지 않도록 동물은 빼고 닉네임만 쓴다.
  const sendTo =
    scope === "same" ? "모두" : target?.id === uid ? "나" : (targetProfile?.nickname ?? "친구");

  // 성공하면 true를 돌려준다.
  async function run(action: () => Promise<void>): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleGive() {
    const value = text.trim();
    if (!value) {
      setError("미션을 입력해 주세요.");
      return;
    }
    let saved = false;
    if (scope === "same") {
      saved = await run(() =>
        giveMissionToAll(
          roomId,
          uid,
          ordered.map((player) => player.id),
          value,
        ),
      );
    } else if (target) {
      saved = await run(() => giveMission(roomId, uid, target.id, value));
    }
    if (saved) setText("");
  }

  const canType = scope === "different" ? !iDone && target !== null : isHost && !hostDone;
  const title =
    scope === "different"
      ? iDone
        ? "미션을 보냈어요"
        : `${targetLabel}의 미션을 정해주세요`
      : isHost
        ? hostDone
          ? "미션이 정해졌어요"
          : "모두가 할 미션을 정해주세요"
        : hostDone
          ? "미션이 정해졌어요"
          : "방장이 미션을 정하고 있어요";

  return (
    <Popup
      title={title}
      action={
        isHost && (
          <BottomButton
            onClick={() => run(() => revealMissions(roomId))}
            disabled={busy}
            blockedReason={
              allDone
                ? null
                : scope === "same"
                  ? "아직 미션을 정하지 않았어요."
                  : "아직 모두가 미션을 설정하지 않았어요."
            }
          >
            미션 공개하기
          </BottomButton>
        )
      }
    >
      {canType && (
        <div className="flex w-full flex-col items-center gap-3">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MISSION_TEXT_MAX}
            placeholder="예: 오늘 본 제일 예쁜 하늘 찍기"
            className="w-full rounded-card bg-surface px-4 py-3 text-center shadow-card outline-none"
          />
          <p className="text-xs text-ink-subtle">
            {text.length} / {MISSION_TEXT_MAX}
          </p>
          {/* 버튼 폭은 카드에 맞춰 고정하고, 긴 닉네임(최대 12자)은 말줄임으로 자른다. */}
          <button
            onClick={handleGive}
            disabled={busy}
            className="flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
          >
            {busy ? (
              "보내는 중…"
            ) : (
              <>
                <span className="min-w-0 truncate">{sendTo}</span>
                <span className="shrink-0">에게 미션 보내기</span>
              </>
            )}
          </button>
        </div>
      )}

      {!canType && scope === "different" && (
        <p className="text-sm text-ink-muted">다른 친구들이 정하는 중이에요.</p>
      )}
      {!canType && scope === "same" && !hostDone && (
        <p className="text-sm text-ink-muted">미션이 정해지면 방장이 공개해 줘요.</p>
      )}

      {/* 누가 정했는지는 보여주지 않고, 정한 인원수만 보여준다. */}
      {scope === "different" && (
        <p className="text-sm font-bold">
          {doneCount}/{ordered.length}명이 정했어요
        </p>
      )}

      {error && <p className="text-sm text-primary">{error}</p>}
    </Popup>
  );
}
