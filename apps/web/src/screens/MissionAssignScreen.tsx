"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import ScreenShell from "../components/ScreenShell";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import { useMembers, useMyAssignment, useRoom } from "../lib/firebase/hooks";
import { assignRandomMissions } from "../lib/firebase/roomRepo";
import { getMission } from "../lib/missions";

export default function MissionAssignScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const auth = useAuthState();
  const uid = auth.status === "signedIn" ? auth.uid : null;
  const room = useRoom(roomId, uid);
  const members = useMembers(roomId, uid);
  const assignment = useMyAssignment(roomId, uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    room.data === null
  ) {
    return (
      <ScreenShell>
        <p className="text-ink-muted">불러오는 중…</p>
      </ScreenShell>
    );
  }

  const isHost = room.data.hostId === uid;
  const mission = assignment.data ? getMission(assignment.data.missionId) : undefined;

  async function handleAssign() {
    if (members.status !== "ready") return;
    setError(null);
    setBusy(true);
    try {
      await assignRandomMissions(
        roomId,
        members.data.map((member) => member.player.id),
      );
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  if (assignment.data && mission) {
    return (
      <ScreenShell>
        <div className="text-6xl">✉️</div>
        <h1 className="text-2xl font-bold">미션이 도착했어요</h1>
        <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
          <p className="text-sm text-ink-subtle">
            {mission.category} · {"★".repeat(mission.difficulty)}
          </p>
          <p className="mt-3 text-xl font-bold">{mission.text}</p>
        </div>
        <p className="text-sm text-ink-muted">
          다른 친구들의 미션은 비밀이에요 🤫
        </p>
        <Link
          href={ROUTES.play(roomId)}
          className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95"
        >
          미션 하러 가기
        </Link>
      </ScreenShell>
    );
  }

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
      {error && <p className="text-sm text-primary">{error}</p>}
      {isHost ? (
        <button
          onClick={handleAssign}
          disabled={busy}
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
