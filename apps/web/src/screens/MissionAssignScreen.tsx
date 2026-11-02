"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import PhotoNotice from "../components/PhotoNotice";
import ScreenShell from "../components/ScreenShell";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import {
  useMembers,
  useMyAssignment,
  useRoom,
  useRoomAssignments,
} from "../lib/firebase/hooks";
import {
  assignRandomMissions,
  giveMission,
  giveMissionToAll,
  revealMissions,
  type MemberProfile,
} from "../lib/firebase/roomRepo";
import {
  MISSION_TEXT_MAX,
  PRESET_MISSIONS,
  describeAssignmentMission,
} from "../lib/missions";
import { receiverOf, ringOrder } from "../lib/pairing";

// 누가 미션을 정했는지 보여주는 현황
function ProgressList({ profiles }: { profiles: MemberProfile[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {profiles.map(({ player, nickname }) => (
        <li
          key={player.id}
          className="rounded-full bg-surface px-4 py-2 text-sm shadow-card"
        >
          {player.assignmentDone ? "✅" : "⏳"} {player.animal} {nickname}
        </li>
      ))}
    </ul>
  );
}

// 미션지정: 게임 설정(docs/ROUTES.md, docs/MISSION_ASSIGN.md)에 따라 화면이 달라진다.
// - 앱이 정해주기: 방장이 뽑기를 누른다. (각자 다른 미션이면 서로 겹치지 않는다)
// - 서로 정해주기: 각자 다음 사람에게 줄 미션을 적는다. (모두 같은 미션이면 방장만 적는다)
// 방장이 미션을 공개(phase = play)하면 받은 미션이 보인다.
export default function MissionAssignScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const auth = useAuthState();
  const uid = auth.status === "signedIn" ? auth.uid : null;
  const room = useRoom(roomId, uid);
  const members = useMembers(roomId, uid);
  const assignment = useMyAssignment(roomId, uid);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomNow = room.status === "ready" ? room.data : null;
  const phase = roomNow?.phase ?? null;
  // 시작 전이면 대기실로, 아직 설정 중이면 게임 설정으로 보낸다.
  const redirectTo =
    roomNow === null
      ? null
      : roomNow.status === "waiting"
        ? ROUTES.lobby(roomId)
        : phase === "settings"
          ? ROUTES.settings(roomId)
          : null;
  // 미션이 공개된 뒤인가. (assign 단계에서는 받은 미션이 있어도 숨긴다)
  const revealed =
    roomNow !== null &&
    roomNow.status !== "waiting" &&
    phase !== "assign" &&
    phase !== "settings";
  const everyone = useRoomAssignments(
    roomId,
    uid,
    revealed && roomNow?.settings.visibility === "public",
  );

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (auth.status === "error") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">로그인하지 못했어요.</p>
        <p className="text-sm text-ink-subtle">{auth.message}</p>
      </ScreenShell>
    );
  }
  const failed = [room, members, assignment].find((r) => r.status === "error");
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
    assignment.status !== "ready" ||
    room.data === null ||
    redirectTo
  ) {
    return (
      <ScreenShell>
        <p className="text-ink-muted">{redirectTo ? "이동하는 중…" : "불러오는 중…"}</p>
      </ScreenShell>
    );
  }

  // 게임 설정에서 방장이 정한 값
  const { assigner, visibility, scope } = room.data.settings;
  const hostId = room.data.hostId;
  const isHost = hostId === uid;
  const mission = assignment.data ? describeAssignmentMission(assignment.data) : undefined;

  const byId = new Map(members.data.map((profile) => [profile.player.id, profile] as const));
  const ordered = ringOrder(members.data.map((profile) => profile.player));
  const orderedProfiles = ordered.flatMap((player) => byId.get(player.id) ?? []);
  const doneCount = ordered.filter((player) => player.assignmentDone === true).length;
  const iDone = ordered.find((player) => player.id === uid)?.assignmentDone === true;
  const hostDone = ordered.find((player) => player.id === hostId)?.assignmentDone === true;
  const allDone =
    scope === "same" ? hostDone : ordered.length > 0 && doneCount === ordered.length;
  const target = uid ? receiverOf(ordered, uid) : null;
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

  async function handleAssign() {
    if (members.status !== "ready") return;
    await run(() =>
      assignRandomMissions(
        roomId,
        members.data.map((profile) => profile.player.id),
        scope,
      ),
    );
  }

  async function handleGive() {
    if (!uid) return;
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

  // ----- 미션 공개 후: 받은 미션 -----
  if (revealed) {
    if (!assignment.data || !mission) {
      return (
        <ScreenShell>
          <div className="text-6xl">📭</div>
          <h1 className="text-2xl font-bold">받은 미션이 없어요</h1>
          <p className="text-sm text-ink-muted">방장에게 물어봐 주세요.</p>
        </ScreenShell>
      );
    }
    return (
      <ScreenShell>
        <div className="text-6xl">✉️</div>
        <h1 className="text-2xl font-bold">미션이 도착했어요</h1>
        <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
          <p className="text-sm text-ink-subtle">{mission.label}</p>
          <p className="mt-3 text-xl font-bold">{mission.text}</p>
        </div>

        {visibility === "private" ? (
          <p className="text-sm text-ink-muted">
            다른 친구들의 미션은 비밀이에요 🤫
          </p>
        ) : (
          <div className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
            <p className="font-bold">친구들의 미션</p>
            {everyone.status === "loading" && (
              <p className="mt-2 text-sm text-ink-muted">불러오는 중…</p>
            )}
            {everyone.status === "error" && (
              <p className="mt-2 text-sm text-primary">{everyone.message}</p>
            )}
            {everyone.status === "ready" && (
              <ul className="mt-3 space-y-2">
                {everyone.data.map((item) => {
                  const receiver = byId.get(item.receiverId);
                  const giver = item.giverId ? byId.get(item.giverId) : undefined;
                  const view = describeAssignmentMission(item);
                  return (
                    <li key={item.id} className="rounded-card bg-canvas px-4 py-3">
                      <p className="text-sm text-ink-subtle">
                        {receiver
                          ? `${receiver.player.animal} ${receiver.nickname}`
                          : "알 수 없음"}
                        {giver ? ` · 정해준 사람: ${giver.nickname}` : ""}
                      </p>
                      <p className="font-bold">
                        {view?.text ?? "미션을 불러오지 못했어요"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <Link
          href={ROUTES.play(roomId)}
          className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95"
        >
          미션 하러 가기
        </Link>
      </ScreenShell>
    );
  }

  // ----- 앱이 정해주기 -----
  if (assigner === "app") {
    // 겹치지 않게 줄 미션이 모자라면 뽑지 않는다. (게임 설정에서 미리 막지만 한 번 더 확인한다)
    const poolShort = scope === "different" && ordered.length > PRESET_MISSIONS.length;
    return (
      <ScreenShell>
        <div className="text-6xl">🐾</div>
        <h1 className="text-2xl font-bold">
          {isHost ? "미션을 받아볼까요?" : "방장이 미션을 뽑고 있어요"}
        </h1>
        <ul className="flex flex-wrap justify-center gap-2">
          {members.data.map(({ player, nickname }) => (
            <li
              key={player.id}
              className="rounded-full bg-surface px-4 py-2 shadow-card"
            >
              {player.animal} {nickname}
            </li>
          ))}
        </ul>
        {poolShort && (
          <p className="text-sm text-primary">
            준비된 미션이 {PRESET_MISSIONS.length}개라 {PRESET_MISSIONS.length}명까지만 서로
            다른 미션을 줄 수 있어요.
          </p>
        )}
        {error && <p className="text-sm text-primary">{error}</p>}
        {isHost ? (
          <button
            onClick={handleAssign}
            disabled={busy || poolShort}
            className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
          >
            {busy ? "뽑는 중…" : "미션 뽑기"}
          </button>
        ) : (
          <p className="text-sm text-ink-muted">
            미션이 정해지면 이 화면에 바로 나타나요.
          </p>
        )}
      </ScreenShell>
    );
  }

  // ----- 서로 정해주기 -----
  const canType =
    scope === "different" ? !iDone && target !== null : isHost && !hostDone;
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
    <ScreenShell>
      <div className="text-6xl">✍️</div>
      <h1 className="text-2xl font-bold">{title}</h1>

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
        <p className="text-sm text-ink-muted">
          미션이 정해지면 방장이 공개해 줘요.
        </p>
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
          {!allDone && (
            <p className="text-xs text-ink-subtle">모두 정하면 공개할 수 있어요.</p>
          )}
        </div>
      )}
    </ScreenShell>
  );
}
