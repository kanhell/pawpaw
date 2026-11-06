"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ROUTES, type RoomSettings } from "@pawpaw/shared";
import EnableSwitch from "../components/EnableSwitch";
import ModeBadge from "../components/ModeBadge";
import PhotoNotice from "../components/PhotoNotice";
import ScreenShell from "../components/ScreenShell";
import SettingStepper from "../components/SettingStepper";
import { fromDatetimeLocal, toDatetimeLocal } from "../lib/datetime";
import { PRESET_MISSIONS } from "../lib/missions";
import {
  ASSIGNER_OPTIONS,
  RESULT_AT_OPTIONAL,
  SCOPE_OPTIONS,
  VISIBILITY_OPTIONS,
  describeResultAtNone,
  getMode,
  scopePatch,
  type Choice,
  type ModeExtra,
  type Option,
} from "../lib/modes";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import { useMembers, useNow, useRoom } from "../lib/firebase/hooks";
import {
  clearResultAt,
  finishSettingsPhase,
  updateResultAt,
  updateRoomSettings,
  type RoomSettingsPatch,
} from "../lib/firebase/roomRepo";

// 모드(lib/modes.ts)가 허용하는 선택지만 보여준다.
// - 선택지가 2개 이상이면 방장이 고를 수 있고, 1개면 고정, 없으면(해당 없음) 그룹을 숨긴다.
function OptionGroup<T extends string>({
  title,
  options,
  choice,
  value,
  canEdit,
  busy,
  onSelect,
}: {
  title: string;
  options: Option<T>[];
  choice: Choice<T>;
  value: T | undefined;
  canEdit: boolean;
  busy: boolean;
  onSelect: (value: T) => void;
}) {
  const allowed = options.filter((option) => choice.options.includes(option.value));
  if (allowed.length === 0) return null;
  const locked = allowed.length === 1;
  const editable = canEdit && !locked;

  return (
    <section className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
      <h2 className="font-bold">{title}</h2>
      {locked && <p className="mt-1 text-sm text-ink-muted">이 모드에서는 고정이에요.</p>}
      <ul className="mt-3 space-y-2">
        {allowed.map((option) => {
          const selected = locked || option.value === value;
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

// 저장된 추가 설정 값. 값이 없는 예전 방은 기본값으로 보고,
// 정하지 않을 수 있는 설정의 null은 '정하지 않음'으로 본다.
function extraValue(settings: RoomSettings, extra: ModeExtra): number | null {
  const stored = settings[extra.key];
  if (stored === undefined) return extra.default;
  return stored === null && !extra.optional ? extra.default : stored;
}

// 게임 설정: 방장은 직접 설정하고, 참가자는 현재 설정을 실시간으로 본다.
// 어떤 항목을 바꿀 수 있는지는 방의 모드가 정한다. (lib/modes.ts)
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
  // 결과 공개 시각을 정할지 여부 (정하지 않을 수 있는 모드에서만 쓴다). null이면 저장된 값에 따른다.
  const [resultEnabled, setResultEnabled] = useState<boolean | null>(null);
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

  // '모두 같은 미션'이면 미션 공개 여부는 '미리 전체 공개'다.
  // 예전 방처럼 값이 어긋나 있으면 방장 화면이 바로잡는다.
  const needsPublic =
    current !== null &&
    current.hostId === uid &&
    current.phase === "settings" &&
    current.settings.scope === "same" &&
    current.settings.visibility !== "public";
  useEffect(() => {
    if (needsPublic) updateRoomSettings(roomId, { visibility: "public" }).catch(() => {});
  }, [needsPublic, roomId]);

  // 결과 공개 시각을 정하지 않는 설정(정책 A)인데 시각이 남아 있으면 비운다.
  // (예: 매일매일에서 시각을 정한 뒤 '기간 없이 계속하기'로 바꾼 경우)
  const needsClearResult =
    current !== null &&
    current.hostId === uid &&
    current.phase === "settings" &&
    current.resultAt !== null &&
    getMode(current.settings.mode).resultAt(current.settings) === "none";
  useEffect(() => {
    if (needsClearResult) clearResultAt(roomId).catch(() => {});
  }, [needsClearResult, roomId]);

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
  const mode = getMode(settings.mode);
  const savedResult = roomData.resultAt ? new Date(roomData.resultAt) : null;
  const resultInput = resultDraft ?? toDatetimeLocal(roomData.resultAt);

  // 결과 공개 시각 정책: none(A)은 정하지 않고, choice(B)는 방장이 정할지 말지 고른다.
  // 정하는 상태는 방장이 고른 값(또는 저장된 값)을 따른다.
  const choiceResult = mode.resultAt(settings) === "choice";
  const resultOn = choiceResult && (resultEnabled ?? savedResult !== null);

  // 시각을 정하는 경우: 저장된 시각이 미래이고, 입력 중인 값이 저장된 값과 같을 때만 완료할 수 있다.
  // 정하지 않는 경우: 저장된 시각이 비어 있어야 한다.
  const draftDate = resultDraft === null ? null : fromDatetimeLocal(resultDraft);
  const draftSaved =
    resultDraft === null ||
    (draftDate !== null && savedResult !== null && draftDate.getTime() === savedResult.getTime());
  const resultReady = resultOn
    ? savedResult !== null && savedResult.getTime() > now && draftSaved
    : savedResult === null;
  // 앱이 정하고 각자 다른 미션이면, 서로 겹치지 않게 줄 미션이 인원보다 많아야 한다.
  const memberCount = members.status === "ready" ? members.data.length : 0;
  const poolShort =
    settings.assigner === "app" &&
    settings.scope === "different" &&
    memberCount > PRESET_MISSIONS.length;
  const canFinish = resultReady && !poolShort;

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

  function handleExtra(key: ModeExtra["key"], value: number | null) {
    const patch: RoomSettingsPatch = {};
    patch[key] = value;
    // 기간 없이 계속하면 결과 공개 시각을 정하지 않으므로, 입력 중이던 상태를 비운다.
    if (key === "durationDays" && value === null) {
      setResultEnabled(null);
      setResultDraft(null);
    }
    handleSelect(patch);
  }

  function handleResultToggle(enabled: boolean) {
    setResultEnabled(enabled);
    setResultDraft(null);
    setError(null);
    if (!enabled && savedResult !== null) void run(() => clearResultAt(roomId));
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
    if (resultOn && (!savedResult || savedResult.getTime() <= Date.now())) {
      setError("결과 공개 시각을 지금보다 뒤로 정해 주세요.");
      return;
    }
    await run(() => finishSettingsPhase(roomId));
  }

  return (
    <ScreenShell>
      <div className="text-6xl">⚙️</div>
      <h1 className="text-2xl font-bold">게임 설정</h1>
      <ModeBadge mode={settings.mode} />
      <p className="text-sm text-ink-muted">
        {isHost
          ? "고른 내용은 바로 저장되고, 친구들 화면에도 보여요."
          : "방장이 설정하고 있어요. 바뀌는 내용이 바로 보여요."}
      </p>

      <OptionGroup
        title="미션은 누가 정하나요?"
        options={ASSIGNER_OPTIONS}
        choice={mode.assigner}
        value={settings.assigner}
        canEdit={isHost}
        busy={busy}
        onSelect={(assigner) => handleSelect({ assigner })}
      />
      <OptionGroup
        title="모두 같은 미션인가요?"
        options={SCOPE_OPTIONS}
        choice={mode.scope}
        value={settings.scope}
        canEdit={isHost}
        busy={busy}
        onSelect={(scope) => handleSelect(scopePatch(mode, scope))}
      />
      {/* 모두 같은 미션이면 공개 여부는 묻지 않고 '미리 전체 공개'로 정해진다. */}
      {settings.scope !== "same" && (
        <OptionGroup
          title="미션을 미리 공개할까요?"
          options={VISIBILITY_OPTIONS}
          choice={mode.visibility}
          value={settings.visibility}
          canEdit={isHost}
          busy={busy}
          onSelect={(visibility) => handleSelect({ visibility })}
        />
      )}

      {mode.extras.map((extra) => (
        <SettingStepper
          key={extra.key}
          title={extra.title}
          description={extra.description}
          value={extraValue(settings, extra)}
          defaultValue={extra.default}
          min={extra.min}
          max={extra.max}
          step={extra.step}
          format={extra.format}
          optional={extra.optional}
          editable={isHost}
          busy={busy}
          onChange={(value) => handleExtra(extra.key, value)}
        />
      ))}

      {choiceResult ? (
        <section className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
          <h2 className="font-bold">결과 공개 시각</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {resultOn
              ? "이 시각이 되면 모두의 사진과 시상식이 열려요."
              : describeResultAtNone(settings)}
          </p>
          {isHost && (
            <EnableSwitch
              enabled={resultOn}
              onLabel={RESULT_AT_OPTIONAL.on}
              offLabel={RESULT_AT_OPTIONAL.off}
              busy={busy}
              onChange={handleResultToggle}
            />
          )}
          {resultOn &&
            (isHost ? (
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
            ))}
          {!resultOn && !isHost && (
            <p className="mt-3 rounded-card bg-canvas px-4 py-3 font-bold">
              {RESULT_AT_OPTIONAL.off}
            </p>
          )}
        </section>
      ) : (
        <p className="text-sm text-ink-muted">{describeResultAtNone(settings)}</p>
      )}

      {poolShort && (
        <p className="text-sm text-primary">
          준비된 미션이 {PRESET_MISSIONS.length}개라 {PRESET_MISSIONS.length}명까지만 서로 다른
          미션을 줄 수 있어요.
          {isHost && mode.scope.options.length > 1 ? " '모두 같은 미션'으로 바꿔 주세요." : ""}
          {isHost && mode.assigner.options.length > 1 ? " '서로 정해주기'로 바꿔도 돼요." : ""}
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
