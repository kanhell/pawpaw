"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ROUTES, type Room } from "@pawpaw/shared";
import ErrorView from "../../components/ErrorView";
import Popup from "../../components/Popup";
import ScreenShell from "../../components/ScreenShell";
import { useAuthState } from "../../lib/firebase/auth";
import { describeError } from "../../lib/firebase/errors";
import { useMembers, useMyAssignment, useNow, useRoom } from "../../lib/firebase/hooks";
import {
  assignRandomMissions,
  startSettingsPhase,
  type MemberProfile,
} from "../../lib/firebase/roomRepo";
import { describeAssignmentMission } from "../../lib/missions";
import GameSettingsPopup from "./GameSettingsPopup";
import InvitePopup from "./InvitePopup";
import MembersPopup from "./MembersPopup";
import MissionArrivedPopup from "./MissionArrivedPopup";
import MissionPopup from "./MissionPopup";
import MissionSetPopup from "./MissionSetPopup";
import RevealResultPopup from "./RevealResultPopup";

type UserPopup = "invite" | "members" | "mission" | "reveal";

// ---------- 미션 도착 편지를 열어 봤는지 (이 기기에만 기억한다) ----------
const OPENED_EVENT = "pawpaw:mission-opened";

function readOpened(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function subscribeOpened(onChange: () => void) {
  window.addEventListener(OPENED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPENED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useMissionOpened(key: string | null): [boolean, () => void] {
  // 저장소를 쓸 수 없는 환경에서도 이번 방문 동안은 열어 본 것으로 둔다.
  const [openedHere, setOpenedHere] = useState<string | null>(null);
  const stored = useSyncExternalStore(
    subscribeOpened,
    () => (key ? readOpened(key) : false),
    () => true, // 서버 렌더링에서는 팝업을 띄우지 않는다.
  );
  const markOpened = useCallback(() => {
    if (!key) return;
    setOpenedHere(key);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // 저장하지 못하면 다음 방문에 편지가 한 번 더 뜬다.
    }
    window.dispatchEvent(new Event(OPENED_EVENT));
  }, [key]);
  return [stored || (key !== null && openedHere === key), markOpened];
}

// ---------- 앱이 정해주기: 설정이 끝나면 방장 화면이 바로 미션을 뽑는다 ----------
function useAutoAssign(room: Room | null, members: MemberProfile[] | null, uid: string | null) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const triedRef = useRef<string | null>(null);

  const active =
    room !== null &&
    members !== null &&
    room.status === "playing" &&
    room.phase === "assign" &&
    room.settings.assigner === "app" &&
    room.hostId === uid;
  const memberIds = active ? members.map((member) => member.player.id).join(",") : "";
  const roomId = room?.id ?? "";
  const scope = room?.settings.scope ?? "different";

  useEffect(() => {
    if (!active) return;
    const key = `${roomId}:${attempt}`;
    if (triedRef.current === key) return; // 같은 시도는 한 번만 (개발 모드의 effect 두 번 실행 포함)
    triedRef.current = key;
    assignRandomMissions(roomId, memberIds.split(","), scope).catch((e) =>
      setError(describeError(e)),
    );
  }, [active, roomId, memberIds, scope, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { error, retry };
}

// ---------- 화면 조각 ----------
function RoundButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-20 flex-col items-center gap-1 rounded-card bg-surface/90 px-4 py-2 text-sm font-bold shadow-card active:scale-95"
    >
      <span className="text-2xl">{icon}</span>
      {label}
    </button>
  );
}

// 방(= 대기실). 배경은 선명하게 두고, 단계(phase)에 맞는 팝업을 띄운다.
// - 게임 시작 전: 초대(방장) / 참여 멤버 / 게임 시작(방장)
// - 게임 설정 → 미션 설정(서로 정해주기) 또는 자동 뽑기(앱이 정해주기) → 미션 도착
// - 미션 공개 후: 위쪽에 내 미션, 놀이터에는 제출한 친구만, 제출 n(제출 현황) / 미션(사진 업로드) / 결과 공개(방장)
// - 결과가 열리면 결과 화면으로 가는 버튼
export default function RoomScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const auth = useAuthState();
  const uid = auth.status === "signedIn" ? auth.uid : null;
  const room = useRoom(roomId, uid);
  const members = useMembers(roomId, uid);
  const assignment = useMyAssignment(roomId, uid);
  const now = useNow();

  const [popup, setPopup] = useState<UserPopup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomData = room.status === "ready" ? room.data : null;
  const memberList = members.status === "ready" ? members.data : null;
  const myAssignment = assignment.status === "ready" ? assignment.data : null;
  const autoAssign = useAutoAssign(roomData, memberList, uid);
  const [missionOpened, markMissionOpened] = useMissionOpened(
    myAssignment ? `pawpaw:mission-opened:${roomId}:${myAssignment.id}` : null,
  );

  if (auth.status === "error") {
    return <ErrorView message="로그인하지 못했어요." detail={auth.message} />;
  }
  const failed = [room, members, assignment].find((r) => r.status === "error");
  if (failed && failed.status === "error") {
    return <ErrorView message={failed.message} />;
  }
  if (room.status === "ready" && room.data === null) {
    return <ErrorView message="방을 찾을 수 없어요." />;
  }
  if (!uid || !roomData || !memberList || assignment.status !== "ready") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">불러오는 중…</p>
      </ScreenShell>
    );
  }

  const isHost = roomData.hostId === uid;
  const started = roomData.status !== "waiting";
  const finished = roomData.status === "finished";
  const phase = roomData.phase;
  // 미션이 공개된 뒤인가. (assign 단계에서는 받은 미션이 있어도 숨긴다)
  const revealed = finished || (started && phase !== "settings" && phase !== "assign");
  const resultAtMs = roomData.resultAt ? new Date(roomData.resultAt).getTime() : null;
  const resultOpen = finished || (resultAtMs !== null && resultAtMs <= now);
  const mission = revealed && myAssignment ? describeAssignmentMission(myAssignment) : undefined;
  const showMission = mission !== undefined && (missionOpened || finished);

  async function handleStart() {
    setError(null);
    setBusy(true);
    try {
      await startSettingsPhase(roomId);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  // 단계 팝업: 그 단계가 끝나야 사라진다. 떠 있는 동안 버튼 팝업은 띄우지 않는다.
  let phasePopup: ReactNode = null;
  if (started && phase === "settings") {
    phasePopup = <GameSettingsPopup room={roomData} uid={uid} memberCount={memberList.length} />;
  } else if (started && phase === "assign" && roomData.settings.assigner === "players") {
    phasePopup = <MissionSetPopup room={roomData} members={memberList} uid={uid} />;
  } else if (started && phase === "assign") {
    phasePopup = (
      <Popup title="🐾 미션을 뽑고 있어요">
        <p className="text-sm text-ink-muted">잠시만 기다려 주세요. 곧 미션이 도착해요.</p>
        {autoAssign.error && (
          <>
            <p className="text-sm text-primary">{autoAssign.error}</p>
            <button
              onClick={autoAssign.retry}
              className="rounded-full bg-primary px-6 py-2 font-bold text-primary-foreground active:scale-95"
            >
              다시 뽑기
            </button>
          </>
        )}
      </Popup>
    );
  } else if (revealed && !finished && myAssignment && !missionOpened) {
    phasePopup = <MissionArrivedPopup assignment={myAssignment} onConfirm={markMissionOpened} />;
  }

  const closePopup = () => setPopup(null);
  const openPopup = phasePopup ? null : popup;

  // 미션이 공개된 뒤에는 제출한 친구만 놀이터(방)에 돌아와 있다. 나머지는 미션 중이다.
  const submitted = memberList.filter(({ player }) => player.submitted === true);
  const onPlayground = revealed ? submitted : memberList;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col gap-4 p-4 text-center">
      {/* 위쪽: 게임 시작 전에는 방 이름, 시작 후에는 내 미션 */}
      <header className="rounded-sheet bg-surface/90 p-4 shadow-card">
        {!started ? (
          <>
            <h1 className="text-xl font-bold">🏠 대기실</h1>
            <p className="text-sm text-ink-muted">참가자 {memberList.length}명</p>
          </>
        ) : showMission ? (
          <>
            <p className="text-xs text-ink-subtle">내 미션 · {mission.label}</p>
            <p className="mt-1 text-lg font-bold">{mission.text}</p>
          </>
        ) : revealed && !myAssignment ? (
          <p className="text-sm text-ink-muted">받은 미션이 없어요. 방장에게 물어봐 주세요.</p>
        ) : (
          <p className="text-sm text-ink-muted">미션을 준비하고 있어요…</p>
        )}
      </header>

      {/* 가운데: 놀이터에 있는 친구들 (미션 공개 후에는 제출한 친구만) */}
      <ul className="flex flex-1 flex-wrap content-center items-center justify-center gap-4">
        {revealed && onPlayground.length === 0 && (
          <li className="rounded-full bg-surface/90 px-4 py-2 text-sm text-ink-muted shadow-card">
            모두 미션 중이에요. 제출하면 놀이터로 돌아와요.
          </li>
        )}
        {onPlayground.map(({ player, nickname }) => (
          <li key={player.id} className="flex flex-col items-center gap-1">
            <span className="text-5xl drop-shadow">{player.animal}</span>
            <span className="rounded-full bg-surface/90 px-3 py-1 text-xs font-bold shadow-card">
              {nickname}
              {player.isHost ? " 👑" : ""}
            </span>
          </li>
        ))}
      </ul>

      {/* 아래쪽: 버튼 */}
      <footer className="flex flex-col items-center gap-3">
        {error && (
          <p className="rounded-full bg-surface/90 px-4 py-1 text-sm text-primary">{error}</p>
        )}
        <div className="flex justify-center gap-3">
          {!started && isHost && (
            <RoundButton icon="💌" label="초대" onClick={() => setPopup("invite")} />
          )}
          <RoundButton
            icon="👥"
            label={revealed ? `제출 ${submitted.length}` : `멤버 ${memberList.length}`}
            onClick={() => setPopup("members")}
          />
          {revealed && myAssignment && (
            <RoundButton icon="📮" label="미션" onClick={() => setPopup("mission")} />
          )}
          {revealed && isHost && !resultOpen && (
            <RoundButton icon="🎉" label="결과 공개" onClick={() => setPopup("reveal")} />
          )}
        </div>

        {!started &&
          (isHost ? (
            <button
              onClick={handleStart}
              disabled={busy}
              className="w-full rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-float active:scale-95 disabled:opacity-50"
            >
              {busy ? "시작하는 중…" : "게임 시작"}
            </button>
          ) : (
            <p className="rounded-full bg-surface/90 px-4 py-2 text-sm text-ink-muted shadow-card">
              방장이 시작하면 자동으로 넘어가요.
            </p>
          ))}

        {resultOpen && (
          <Link
            href={ROUTES.result(roomId)}
            className="w-full rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-float active:scale-95"
          >
            🎉 결과 보러 가기
          </Link>
        )}
      </footer>

      {phasePopup}
      {openPopup === "invite" && isHost && !started && (
        <InvitePopup roomId={roomId} uid={uid} onClose={closePopup} />
      )}
      {openPopup === "members" && (
        <MembersPopup
          members={memberList}
          uid={uid}
          showSubmissions={revealed}
          onClose={closePopup}
        />
      )}
      {openPopup === "reveal" && isHost && revealed && !resultOpen && (
        <RevealResultPopup
          room={roomData}
          waitingCount={memberList.length - submitted.length}
          onClose={closePopup}
        />
      )}
      {openPopup === "mission" && myAssignment && revealed && (
        <MissionPopup
          room={roomData}
          members={memberList}
          uid={uid}
          assignment={myAssignment}
          onClose={closePopup}
        />
      )}
    </main>
  );
}
