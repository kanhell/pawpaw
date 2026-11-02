"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ROUTES,
  type MissionAssigner,
  type MissionScope,
  type MissionVisibility,
} from "@pawpaw/shared";
import PhotoNotice from "../components/PhotoNotice";
import ScreenShell from "../components/ScreenShell";
import { fromDatetimeLocal, toDatetimeLocal } from "../lib/datetime";
import { PRESET_MISSIONS } from "../lib/missions";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import { useMembers, useNow, useRoom } from "../lib/firebase/hooks";
import {
  finishSettingsPhase,
  updateResultAt,
  updateRoomSettings,
  type RoomSettingsPatch,
} from "../lib/firebase/roomRepo";

interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

// 미션 부여 방법 (docs/PLANNING.md "미션 부여 방법 결정")
const ASSIGNER_OPTIONS: Option<MissionAssigner>[] = [
  { value: "players", label: "서로 정해주기", description: "친구들끼리 서로의 미션을 정해줘요." },
  { value: "app", label: "앱이 정해주기", description: "앱이 알아서 미션을 뽑아줘요." },
];

const VISIBILITY_OPTIONS: Option<MissionVisibility>[] = [
  { value: "public", label: "미리 전체 공개", description: "모두의 미션을 미리 볼 수 있어요." },
  { value: "private", label: "본인만 확인", description: "내 미션은 나만 볼 수 있어요." },
];

const SCOPE_OPTIONS: Option<MissionScope>[] = [
  { value: "same", label: "모두 같은 미션", description: "전체가 같은 미션을 수행해요." },
  { value: "different", label: "각자 다른 미션", description: "모두 서로 다른 미션을 수행해요." },
];

function OptionGroup<T extends string>({
  title,
  options,
  value,
  editable,
  busy,
  onSelect,
}: {
  title: string;
  options: Option<T>[];
  value: T | undefined;
  editable: boolean;
  busy: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <section className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {options.map((option) => {
          const selected = option.value === value;
          const className = `w-full rounded-card border-2 px-4 py-3 text-left ${
            selected ? "border-primary bg-surface" : "border-transparent bg-canvas"
          }`;
          const content = (
            <>
              <p className="font-bold">
                {option.label}
                {selected && !editable ? " ✓" : ""}
              </p>
              <p className="text-sm text-ink-muted">{option.description}</p>
            </>
          );
          return (
            <li key={option.value}>
              {editable ? (
                <button
                  onClick={() => onSelect(option.value)}
                  disabled={busy}
                  aria-pressed={selected}
                  className={`${className} active:scale-95 disabled:opacity-50`}
                >
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatResultTime(date: Date): string {
  return date.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 게임 설정: 방장은 직접 설정하고, 참가자는 현재 설정을 실시간으로 본다.
export default function GameSettingsScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const auth = useAuthState();
  const uid = auth.status === "signedIn" ? auth.uid : null;
  const room = useRoom(roomId, uid);
  const members = useMembers(roomId, uid);
  const now = useNow();

  // null이면 저장된 값을 그대로 보여주고, 입력을 시작하면 입력 중인 값을 보여준다.
  const [resultDraft, setResultDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 설정 단계가 아니면 맞는 화면으로 보낸다. (시작 전 → 대기실, 설정 완료 후 → 미션지정)
  const current = room.status === "ready" ? room.data : null;
  const redirectTo =
    current === null
      ? null
      : current.status === "waiting"
        ? ROUTES.lobby(roomId)
        : current.phase !== "settings"
          ? ROUTES.assign(roomId)
          : null;
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
  if (room.status === "error") {
    return (
      <ScreenShell>
        <div className="text-6xl">🚪</div>
        <p className="text-ink-muted">{room.message}</p>
        <Link href={ROUTES.roomNew} className="text-sm text-ink-subtle underline">
          새 방 만들기
        </Link>
      </ScreenShell>
    );
  }
  if (
    auth.status === "loading" ||
    room.status !== "ready" ||
    room.data === null ||
    redirectTo
  ) {
    return (
      <ScreenShell>
        <p className="text-ink-muted">{redirectTo ? "이동하는 중…" : "불러오는 중…"}</p>
      </ScreenShell>
    );
  }

  const roomData = room.data;
  const isHost = roomData.hostId === uid;
  const settings = roomData.settings;
  const savedResult = roomData.resultAt ? new Date(roomData.resultAt) : null;
  const resultInput = resultDraft ?? toDatetimeLocal(roomData.resultAt);

  // 저장된 결과 공개 시각이 미래이고, 입력 중인 값이 저장된 값과 같을 때만 완료할 수 있다.
  const draftDate = resultDraft === null ? null : fromDatetimeLocal(resultDraft);
  const draftSaved =
    resultDraft === null ||
    (draftDate !== null && savedResult !== null && draftDate.getTime() === savedResult.getTime());
  // 앱이 정하고 각자 다른 미션이면, 서로 겹치지 않게 줄 미션이 인원보다 많아야 한다.
  const memberCount = members.status === "ready" ? members.data.length : 0;
  const poolShort =
    settings.assigner === "app" &&
    settings.scope === "different" &&
    memberCount > PRESET_MISSIONS.length;
  const canFinish =
    savedResult !== null && savedResult.getTime() > now && draftSaved && !poolShort;

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  function handleSelect(patch: RoomSettingsPatch) {
    void run(() => updateRoomSettings(roomId, patch));
  }

  function handleResultChange(value: string) {
    setResultDraft(value);
    setError(null);
    const date = fromDatetimeLocal(value);
    if (!date) return; // 비웠거나 입력 중이면 저장하지 않는다.
    if (date.getTime() <= Date.now()) {
      setError("결과 공개 시각은 지금보다 뒤여야 해요.");
      return;
    }
    void run(() => updateResultAt(roomId, date));
  }

  async function handleFinish() {
    if (!savedResult || savedResult.getTime() <= Date.now()) {
      setError("결과 공개 시각을 지금보다 뒤로 정해 주세요.");
      return;
    }
    await run(() => finishSettingsPhase(roomId));
  }

  return (
    <ScreenShell>
      <div className="text-6xl">⚙️</div>
      <h1 className="text-2xl font-bold">게임 설정</h1>
      <p className="text-sm text-ink-muted">
        {isHost
          ? "고른 내용은 바로 저장되고, 친구들 화면에도 보여요."
          : "방장이 설정하고 있어요. 바뀌는 내용이 바로 보여요."}
      </p>

      <OptionGroup
        title="미션은 누가 정하나요?"
        options={ASSIGNER_OPTIONS}
        value={settings.assigner}
        editable={isHost}
        busy={busy}
        onSelect={(assigner) => handleSelect({ assigner })}
      />
      <OptionGroup
        title="미션을 미리 공개할까요?"
        options={VISIBILITY_OPTIONS}
        value={settings.visibility}
        editable={isHost}
        busy={busy}
        onSelect={(visibility) => handleSelect({ visibility })}
      />
      <OptionGroup
        title="모두 같은 미션인가요?"
        options={SCOPE_OPTIONS}
        value={settings.scope}
        editable={isHost}
        busy={busy}
        onSelect={(scope) => handleSelect({ scope })}
      />

      <section className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
        <h2 className="font-bold">결과 공개 시각</h2>
        <p className="mt-1 text-sm text-ink-muted">
          이 시각이 되면 모두의 사진과 시상식이 열려요.
        </p>
        {isHost ? (
          <input
            type="datetime-local"
            value={resultInput}
            min={toDatetimeLocal(new Date(now).toISOString())}
            onChange={(event) => handleResultChange(event.target.value)}
            className="mt-3 w-full rounded-card bg-canvas px-4 py-3 outline-none"
          />
        ) : (
          <p className="mt-3 rounded-card bg-canvas px-4 py-3 font-bold">
            {savedResult ? formatResultTime(savedResult) : "아직 정해지지 않았어요"}
          </p>
        )}
      </section>

      {poolShort && (
        <p className="text-sm text-primary">
          준비된 미션이 {PRESET_MISSIONS.length}개라 {PRESET_MISSIONS.length}명까지만 서로 다른
          미션을 줄 수 있어요.
          {isHost ? " '모두 같은 미션'이나 '서로 정해주기'로 바꿔 주세요." : ""}
        </p>
      )}

      <PhotoNotice />

      {error && <p className="text-sm text-primary">{error}</p>}

      {isHost ? (
        <button
          onClick={handleFinish}
          disabled={busy || !canFinish}
          className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
        >
          {busy ? "저장하는 중…" : "설정 완료"}
        </button>
      ) : (
        <p className="text-sm text-ink-muted">
          방장이 설정을 마치면 자동으로 넘어가요.
        </p>
      )}
    </ScreenShell>
  );
}
