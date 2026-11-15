"use client";

import { useState } from "react";
import type { Room } from "@pawpaw/shared";
import PhotoNotice from "../../components/PhotoNotice";
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

// 누가 미션을 정했는지 보여주는 현황
function ProgressList({ profiles }: { profiles: MemberProfile[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {profiles.map(({ player, nickname }) => (
        <li key={player.id} className="rounded-full bg-surface px-4 py-2 text-sm shadow-card">
          {player.assignmentDone ? "✅" : "⏳"} {player.animal} {nickname}
        </li>
      ))}
    </ul>
  );
}

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
  const orderedProfiles = ordered.flatMap((player) => byId.get(player.id) ?? []);
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
        ? "미션을 정해줬어요"
        : `${targetLabel}의 미션을 정해주세요`
      : isHost
        ? hostDone
          ? "미션이 정해졌어요"
          : "모두가 할 미션을 정해주세요"
        : hostDone
          ? "미션이 정해졌어요"
          : "방장이 미션을 정하고 있어요";

  return (
    <Popup title={`✍️ ${title}`}>
      <PhotoNotice />

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
          <button
            onClick={handleGive}
            disabled={busy}
            className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
          >
            {busy ? "저장하는 중…" : "정했어요"}
          </button>
        </div>
      )}

      {!canType && scope === "different" && (
        <p className="text-sm text-ink-muted">
          다른 친구들이 정하는 중이에요. ({doneCount}/{ordered.length})
        </p>
      )}
      {!canType && scope === "same" && !hostDone && (
        <p className="text-sm text-ink-muted">미션이 정해지면 방장이 공개해 줘요.</p>
      )}

      {scope === "different" && <ProgressList profiles={orderedProfiles} />}

      {error && <p className="text-sm text-primary">{error}</p>}

      {isHost && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => run(() => revealMissions(roomId))}
            disabled={busy || !allDone}
            className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
          >
            미션 공개하기
          </button>
          {!allDone && <p className="text-xs text-ink-subtle">모두 정하면 공개할 수 있어요.</p>}
        </div>
      )}
    </Popup>
  );
}
