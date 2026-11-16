"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Playground from "../../components/Playground";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MIN_PLAYERS, ROUTES, type Room } from "@pawpaw/shared";
import BottomButton from "../../components/BottomButton";
import ChoiceButtons from "../../components/ChoiceButtons";
import ErrorView from "../../components/ErrorView";
import { InviteIcon, MembersIcon, MissionIcon, RevealIcon } from "../../components/Icons";
import Popup from "../../components/Popup";
import ScreenShell from "../../components/ScreenShell";
import { ToastStack, useToasts } from "../../components/Toast";
import { useAuthState } from "../../lib/firebase/auth";
import { describeError } from "../../lib/firebase/errors";
import { useMembers, useMyAssignment, useNow, useRoom } from "../../lib/firebase/hooks";
import {
  assignRandomMissions,
  startSettingsPhase,
  type MemberProfile,
} from "../../lib/firebase/roomRepo";
import { describeAssignmentMission } from "../../lib/missions";
import { formatResultTime } from "../../lib/resultTime";
import GameSettingsPopup from "./GameSettingsPopup";
import MembersPopup from "./MembersPopup";
import MissionArrivedPopup from "./MissionArrivedPopup";
import MissionPopup from "./MissionPopup";
import MissionSetPopup from "./MissionSetPopup";
import RevealResultPopup from "./RevealResultPopup";
import { takeRoomCreated } from "./roomCreated";
import { useInviteLink } from "./useInviteLink";

type UserPopup = "members" | "mission" | "reveal" | "start";

const CREATED_TOAST = "room-created"; // 방을 막 만들었을 때의 초대 링크 안내

// ---------- 누가 들어오면 "닉네임님이 입장했어요." ----------
// 처음 불러온 멤버는 이미 있던 사람이라 알리지 않고, 그 뒤에 새로 생긴 멤버만 알린다. 나는 빼고.
function useJoinToasts(
  members: MemberProfile[] | null,
  uid: string | null,
  show: (text: string) => void,
  onJoin: () => void,
) {
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!members) return;
    if (seenRef.current === null) {
      seenRef.current = new Set(members.map(({ player }) => player.id));
      return;
    }
    for (const { player, nickname } of members) {
      if (seenRef.current.has(player.id)) continue;
      seenRef.current.add(player.id);
      if (player.id === uid) continue;
      onJoin();
      show(`${nickname}님이 입장했어요.`);
    }
  }, [members, uid, show, onJoin]);
}

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
// 오른쪽 위에 세로로 쌓는 동그란 아이콘 버튼. 글자는 없고, 이름은 aria-label로만 둔다.
function RoundButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-12 place-items-center rounded-full bg-surface/90 text-ink shadow-card active:scale-95"
    >
      {icon}
    </button>
  );
}

// 방(= 대기실). 배경은 선명하게 두고, 단계(phase)에 맞는 팝업을 띄운다.
// - 게임 시작 전: 초대(방장) / 참여 멤버 / 게임 시작(방장)
// - 게임 설정 → 미션 설정(서로 정해주기) 또는 자동 뽑기(앱이 정해주기) → 미션 도착
// - 미션 공개 후: 위쪽에 내 미션과 결과 공개 시각, 놀이터에는 제출한 친구만, 제출 n(제출 현황) / 미션(사진 업로드) / 결과 공개(방장)
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
  const { toasts, show: showToast, hide: hideToast } = useToasts();
  // 친구가 들어오면 '초대 링크를 복사했어요' 안내는 내린다.
  const hideCreatedToast = useCallback(() => hideToast(CREATED_TOAST), [hideToast]);
  useJoinToasts(memberList, uid, showToast, hideCreatedToast);
  // 방을 막 만들고 들어왔으면 초대 링크를 복사했는지 알려준다. (한 번만)
  useEffect(() => {
    const copied = takeRoomCreated(roomId);
    if (copied === null) return;
    showToast(
      copied
        ? "초대 링크를 복사했어요. 친구들에게 보내서 초대해 보세요!"
        : "방을 만들었어요. 오른쪽 위 초대 버튼을 눌러 친구를 초대해 보세요.",
      4500,
      CREATED_TOAST,
    );
  }, [roomId, showToast]);
  const inviteLink = useInviteLink(
    roomId,
    uid ?? "",
    uid !== null && roomData?.hostId === uid && roomData.status === "waiting",
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
  const resultAtText =
    resultAtMs !== null ? formatResultTime(new Date(resultAtMs), new Date(now)) : null;
  const mission = revealed && myAssignment ? describeAssignmentMission(myAssignment) : undefined;
  const showMission = mission !== undefined && (missionOpened || finished);

  async function handleStart() {
    setPopup(null);
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

  // 초대 버튼: 팝업 없이 바로 링크를 복사한다.
  async function handleInvite() {
    const result = await inviteLink.copy();
    showToast(
      result === "copied"
        ? "초대 링크를 복사했어요."
        : "링크를 복사하지 못했어요. 잠시 후 다시 눌러 주세요.",
    );
  }

  // 단계 팝업: 그 단계가 끝나야 사라진다. 떠 있는 동안 버튼 팝업은 띄우지 않는다.
  let phasePopup: ReactNode = null;
  if (started && phase === "settings") {
    phasePopup = <GameSettingsPopup room={roomData} uid={uid} memberCount={memberList.length} />;
  } else if (started && phase === "assign" && roomData.settings.assigner === "players") {
    phasePopup = <MissionSetPopup room={roomData} members={memberList} uid={uid} />;
  } else if (started && phase === "assign") {
    phasePopup = (
      <Popup title="미션을 뽑고 있어요">
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
  } else if (resultOpen) {
    // 결과가 열리면 결과 화면(미션 구경 → 투표 → 시상식)으로 가는 팝업만 띄운다. (닫을 수 없다)
    // 모양은 미션 도착 팝업과 같다.
    phasePopup = (
      <Popup title="미션이 종료되었어요">
        <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
          <p className="text-xl font-bold">친구들은 어떻게 미션을 했을까요?</p>
          <p className="mt-2 text-sm text-ink-muted">친구들의 미션을 한 명씩 구경한 뒤 투표해요.</p>
        </div>
        <Link
          href={ROUTES.result(roomId)}
          className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95"
        >
          구경하러 가기
        </Link>
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
  const playgroundNotice = !started
    ? "친구들이 놀이터로 모이고 있어요."
    : revealed && onPlayground.length === 0
      ? "모두 미션을 하러 갔어요."
      : null;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-app flex-col gap-4 p-4 text-center">
      {/* 위쪽: 미션이 공개된 뒤에만 내 미션과 결과 공개 시각을 보여준다. 그 전에는 비워 둔다.
          버튼은 오른쪽 위에 세로로 놓고, 미션이 있으면 그 아래에 놓는다. 놀이터를 밀어내지 않도록 띄워 둔다. */}
        <Playground members={onPlayground} />
      <div className="relative z-10">
        {showMission ? (
          <header>
            {/* 미션지를 눌러도 미션 버튼과 같은 미션 팝업이 뜬다. */}
            <button
              onClick={() => setPopup("mission")}
              aria-label={`내 미션 보기: ${mission.text}`}
              className="w-full rounded-sheet bg-surface/90 p-4 shadow-card active:scale-[0.98]"
            >
              <p className="text-xs text-ink-subtle">
                {resultOpen
                  ? "결과가 공개됐어요"
                  : resultAtText
                    ? `결과 공개 · ${resultAtText}`
                    : "방장이 결과를 공개해요"}
              </p>
              <p className="mt-1 text-lg font-bold">{mission.text}</p>
            </button>
          </header>
        ) : revealed && !myAssignment ? (
          <header className="rounded-sheet bg-surface/90 p-4 shadow-card">
            <p className="text-sm text-ink-muted">받은 미션이 없어요. 방장에게 물어봐 주세요.</p>
          </header>
        ) : null}
        {/* 위에 버튼 하나(48px) 정도를 비워 둔다. */}
        <nav
          className={`absolute right-0 flex flex-col gap-3 ${
            showMission || (revealed && !myAssignment) ? "top-full mt-15" : "top-12"
          }`}
        >
          {!started && isHost && (
            <RoundButton icon={<InviteIcon />} label="초대 링크 복사" onClick={handleInvite} />
          )}
          <RoundButton
            icon={<MembersIcon />}
            label={revealed ? `제출 현황 ${submitted.length}명` : `멤버 ${memberList.length}명`}
            onClick={() => setPopup("members")}
          />
          {revealed && myAssignment && (
            <RoundButton icon={<MissionIcon />} label="미션" onClick={() => setPopup("mission")} />
          )}
          {revealed && isHost && !resultOpen && (
            <RoundButton icon={<RevealIcon />} label="결과 공개" onClick={() => setPopup("reveal")} />
          )}
        </nav>
      </div>

      {/* 가운데: 놀이터에 있는 친구들 (미션 공개 후에는 제출한 친구만)
          안내 문구가 있으면 위쪽 미션 카드와 상관없이 문구를 화면 정중앙에 두고, 동물은 그 아래에 놓는다.
          (문구 알약의 높이 36px의 절반만큼 올려서 알약의 가운데가 화면 가운데에 오게 한다) */}
      {playgroundNotice ? (
        <>
          <div className="flex-1" />
          <div className="pointer-events-none absolute inset-x-4 top-1/2 -mt-[18px] flex flex-col items-center">
            <p className="rounded-full bg-surface/90 px-4 py-2 text-sm text-ink-muted shadow-card">
              {playgroundNotice}
            </p>
          </div>
        </>
      ) : (
        <div className="flex-1" />
      )}

      {/* 아래쪽: 버튼 */}
      <footer className="flex flex-col items-center gap-3">
        {error && (
          <p className="rounded-full bg-surface/90 px-4 py-1 text-sm text-primary">{error}</p>
        )}
        {!started && isHost && (
          <BottomButton
            onClick={() => setPopup("start")}
            disabled={busy}
            blockedReason={
              memberList.length < MIN_PLAYERS
                ? `${MIN_PLAYERS}명 이상 모여야 시작할 수 있어요. 친구를 더 초대해 주세요.`
                : null
            }
          >
            {busy ? "시작하는 중…" : "게임 시작"}
          </BottomButton>
        )}

      </footer>

      {phasePopup}
      <ToastStack toasts={toasts} />
      {openPopup === "start" && isHost && !started && (
        <Popup title="게임을 시작할까요?" onClose={closePopup}>
          <p className="text-sm text-ink-muted">
            게임을 시작하면 친구들이 더 참여할 수 없어요. 초대 링크도 더 이상 쓸 수 없어요.
          </p>
          <ChoiceButtons
            confirmLabel={busy ? "시작하는 중…" : "시작하기"}
            onCancel={closePopup}
            onConfirm={handleStart}
            busy={busy}
          />
        </Popup>
      )}
      {openPopup === "members" && (
        <MembersPopup
          room={roomData}
          uid={uid}
          members={memberList}
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
