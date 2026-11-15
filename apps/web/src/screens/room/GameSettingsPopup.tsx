"use client";

import { useState } from "react";
import type {
  MissionAssigner,
  MissionScope,
  MissionVisibility,
  ResultMode,
  Room,
} from "@pawpaw/shared";
import BottomButton from "../../components/BottomButton";
import Popup from "../../components/Popup";
import { PRESET_MISSIONS } from "../../lib/missions";
import { describeError } from "../../lib/firebase/errors";
import { useNow } from "../../lib/firebase/hooks";
import {
  finishSettingsPhase,
  updateResultSetting,
  updateRoomSettings,
  type RoomSettingsPatch,
} from "../../lib/firebase/roomRepo";
import {
  DEFAULT_RESULT_HOUR,
  RESULT_PRESET_HOURS,
  TIME_STEP_MINUTES,
  atNextSameTime,
  formatDay,
  formatResultTime,
  formatTime,
  nextOccurrence,
  presetHourOf,
  shiftDays,
  shiftMinutes,
} from "../../lib/resultTime";

interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

// 미션 부여 방법 (docs/PLANNING.md "미션 부여 방법 결정")
// 각 설정의 첫 번째(왼쪽) 칸이 기본값이다. (roomRepo.createRoom)
const ASSIGNER_OPTIONS: Option<MissionAssigner>[] = [
  { value: "players", label: "서로 정해주기", description: "친구들끼리 서로의 미션을 정해줘요." },
  { value: "app", label: "앱이 정해주기", description: "앱이 알아서 미션을 뽑아줘요." },
];

const VISIBILITY_OPTIONS: Option<MissionVisibility>[] = [
  { value: "private", label: "본인만 확인", description: "내 미션은 나만 볼 수 있어요." },
  { value: "public", label: "미리 전체 공개", description: "모두의 미션을 미리 볼 수 있어요." },
];

const SCOPE_OPTIONS: Option<MissionScope>[] = [
  { value: "different", label: "각자 다른 미션", description: "모두 서로 다른 미션을 수행해요." },
  { value: "same", label: "모두 같은 미션", description: "전체가 같은 미션을 수행해요." },
];

// 토글 버튼 하나. 방장이 아니면 누를 수 없고, 고른 쪽이 표시만 된다.
function ToggleButton({
  label,
  selected,
  editable,
  busy,
  className = "",
  onClick,
}: {
  label: string;
  selected: boolean;
  editable: boolean;
  busy: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!editable || busy}
      aria-pressed={selected}
      className={`${className} rounded-full px-2 py-2 text-sm font-bold transition-colors ${
        selected ? "bg-primary text-primary-foreground" : "text-ink-muted"
      } ${editable ? "active:scale-95 disabled:opacity-50" : "cursor-default"}`}
    >
      {label}
    </button>
  );
}

// [−] 값 [+] 모양으로 값을 한 칸씩 옮기는 버튼 (직접 설정의 시각·날짜)
function Stepper({
  label,
  value,
  minusLabel,
  plusLabel,
  canMinus,
  busy,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  minusLabel: string;
  plusLabel: string;
  canMinus: boolean;
  busy: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const buttonClass =
    "grid size-9 place-items-center rounded-full bg-canvas text-lg font-bold active:scale-95 disabled:opacity-30";
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface p-1 shadow-card">
      <button onClick={onMinus} disabled={busy || !canMinus} aria-label={minusLabel} className={buttonClass}>
        −
      </button>
      <p className="flex-1 text-center font-bold" aria-label={label}>
        {value}
      </p>
      <button onClick={onPlus} disabled={busy} aria-label={plusLabel} className={buttonClass}>
        +
      </button>
    </div>
  );
}

// 옵션을 토글 버튼으로 나란히 놓고 제목만 보여준다. 설명은 선택된 옵션 것만 아래에 보여준다.
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
  const selectedOption = options.find((option) => option.value === value);
  return (
    <section className="w-full text-left">
      <h3 className="font-bold">{title}</h3>
      {/* 설명은 제목 아래, 버튼 위에 둔다. 고른 선택지의 설명만 보여준다. */}
      {selectedOption && (
        <p className="mt-1 px-1 text-sm text-ink-muted">-&gt; {selectedOption.description}</p>
      )}
      <div role="group" aria-label={title} className="mt-2 flex rounded-full bg-surface p-1 shadow-card">
        {options.map((option) => (
          <ToggleButton
            key={option.value}
            label={option.label}
            selected={option.value === value}
            editable={editable}
            busy={busy}
            className="flex-1"
            onClick={() => onSelect(option.value)}
          />
        ))}
      </div>
    </section>
  );
}

// 게임 설정 팝업 (phase = settings 동안 모두에게 뜨고 닫을 수 없다)
// 방장은 직접 설정하고, 참가자는 현재 설정을 실시간으로 본다.
export default function GameSettingsPopup({
  room,
  uid,
  memberCount,
}: {
  room: Room;
  uid: string;
  memberCount: number;
}) {
  const now = useNow();
  const nowDate = new Date(now);

  const [dateOpen, setDateOpen] = useState(false); // 직접 설정에서 '날짜도 고르기'를 눌렀는지
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomId = room.id;
  const isHost = room.hostId === uid;
  const settings = room.settings;
  const savedResult = room.resultAt ? new Date(room.resultAt) : null;
  // 예전 방에는 resultMode가 없으니 저장된 시각으로 짐작한다.
  const resultMode: ResultMode | null =
    settings.resultMode ??
    (savedResult ? (presetHourOf(savedResult) !== null ? "preset" : "custom") : null);
  const selectedHour = resultMode === "preset" && savedResult ? presetHourOf(savedResult) : null;
  // 직접 설정에서 날짜도 고를지. 저장된 날짜가 자동 날짜(오늘, 지났으면 내일)와 다르면 열어 둔다.
  const customDated =
    resultMode === "custom" &&
    savedResult !== null &&
    atNextSameTime(savedResult, nowDate).getTime() !== savedResult.getTime();
  const showDate = dateOpen || customDated;

  // 앱이 정하고 각자 다른 미션이면, 서로 겹치지 않게 줄 미션이 인원보다 많아야 한다.
  const poolShort =
    settings.assigner === "app" &&
    settings.scope === "different" &&
    memberCount > PRESET_MISSIONS.length;
  // 방장이 직접 공개하면 시각이 없어도 되고, 그 밖에는 저장된 시각이 미래여야 한다.
  const resultReady =
    resultMode === "host" || (savedResult !== null && savedResult.getTime() > now);

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

  function handlePreset(hour: number) {
    void run(() => updateResultSetting(roomId, "preset", nextOccurrence(hour, 0, new Date())));
  }

  // 직접 설정은 이전에 고른 시각(없으면 6시)에서 시작한다. 날짜는 오늘, 그 시각이 지났으면 내일.
  function handleCustom() {
    if (resultMode === "custom") return;
    const current = new Date();
    const start = savedResult
      ? atNextSameTime(savedResult, current)
      : nextOccurrence(DEFAULT_RESULT_HOUR, 0, current);
    setDateOpen(false);
    void run(() => updateResultSetting(roomId, "custom", start));
  }

  function handleHost() {
    void run(() => updateResultSetting(roomId, "host"));
  }

  // 버튼으로 옮긴 값을 바로 저장한다. 날짜를 직접 고르지 않을 때는 오늘(지났으면 내일)로 맞춘다.
  function handleShift(target: Date, keepDate: boolean) {
    const current = new Date();
    const next = keepDate ? target : atNextSameTime(target, current);
    if (next.getTime() <= current.getTime()) {
      setError("결과 공개 시각은 지금보다 뒤여야 해요.");
      return;
    }
    void run(() => updateResultSetting(roomId, "custom", next));
  }

  // 날짜 고르기를 닫으면 날짜를 다시 오늘(지났으면 내일)로 돌린다.
  function handleDateOpen(open: boolean) {
    setDateOpen(open);
    if (!open && savedResult) handleShift(savedResult, false);
  }

  async function handleFinish() {
    // 버튼을 누른 순간의 시각으로 다시 확인한다. 렌더링 중이 아니라 이벤트 처리라 순수성 규칙과 무관하다(오탐).
    // eslint-disable-next-line react-hooks/purity
    if (resultMode !== "host" && (!savedResult || savedResult.getTime() <= Date.now())) {
      setError("결과 공개 시각을 지금보다 뒤로 정해 주세요.");
      return;
    }
    // 앱이 정해주기면 다음 단계(assign)에서 방장 화면이 바로 미션을 뽑는다. (RoomScreen)
    await run(() => finishSettingsPhase(roomId));
  }

  const resultDescription =
    resultMode === "host"
      ? "방장이 '결과 공개' 버튼을 누르면 모두의 사진과 시상식이 열려요."
      : savedResult && resultMode !== null
        ? `${formatResultTime(savedResult, nowDate)}에 모두의 사진과 시상식이 열려요.`
        : resultMode === "custom"
          ? "공개할 시각을 골라 주세요."
          : "결과가 열릴 때를 골라 주세요.";

  return (
    <Popup
      title="게임 설정"
      action={
        isHost && (
          <BottomButton
            onClick={handleFinish}
            disabled={busy}
            blockedReason={
              poolShort
                ? "준비된 미션보다 사람이 많아요. 설정을 바꿔 주세요."
                : !resultReady
                  ? "결과 공개 시각을 지금보다 뒤로 정해 주세요."
                  : null
            }
          >
            {busy ? "저장하는 중…" : "설정 완료"}
          </BottomButton>
        )
      }
    >
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

      {/* 결과 공개: 오후 6·8·10시(오늘, 지났으면 내일) / 직접 설정 / 방장이 종료 */}
      <section className="w-full text-left">
        <h3 className="font-bold">결과는 언제 공개할까요?</h3>
        <p className="mt-1 px-1 text-sm text-ink-muted">-&gt; {resultDescription}</p>
        <div
          role="group"
          aria-label="결과 공개 시각"
          className="mt-2 grid grid-cols-6 gap-1 rounded-card bg-surface p-1 shadow-card"
        >
          {RESULT_PRESET_HOURS.map((hour) => (
            <ToggleButton
              key={hour}
              label={`${hour - 12}시`}
              selected={selectedHour === hour}
              editable={isHost}
              busy={busy}
              className="col-span-2"
              onClick={() => handlePreset(hour)}
            />
          ))}
          <ToggleButton
            label="직접 설정"
            selected={resultMode === "custom"}
            editable={isHost}
            busy={busy}
            className="col-span-3"
            onClick={handleCustom}
          />
          <ToggleButton
            label="방장이 종료"
            selected={resultMode === "host"}
            editable={isHost}
            busy={busy}
            className="col-span-3"
            onClick={handleHost}
          />
        </div>

        {isHost && resultMode === "custom" && savedResult && (
          <div className="mt-2 flex flex-col gap-2">
            <Stepper
              label="결과 공개 시각"
              value={formatTime(savedResult)}
              minusLabel={`${TIME_STEP_MINUTES}분 앞으로`}
              plusLabel={`${TIME_STEP_MINUTES}분 뒤로`}
              // 날짜를 고르지 않으면 지난 시각은 내일로 넘어가니 언제나 앞으로 옮길 수 있다.
              canMinus={
                !showDate || shiftMinutes(savedResult, -TIME_STEP_MINUTES).getTime() > now
              }
              busy={busy}
              onMinus={() => handleShift(shiftMinutes(savedResult, -TIME_STEP_MINUTES), showDate)}
              onPlus={() => handleShift(shiftMinutes(savedResult, TIME_STEP_MINUTES), showDate)}
            />
            {showDate && (
              <Stepper
                label="결과 공개 날짜"
                value={formatDay(savedResult, nowDate)}
                minusLabel="하루 앞으로"
                plusLabel="하루 뒤로"
                canMinus={shiftDays(savedResult, -1).getTime() > now}
                busy={busy}
                onMinus={() => handleShift(shiftDays(savedResult, -1), true)}
                onPlus={() => handleShift(shiftDays(savedResult, 1), true)}
              />
            )}
            <button
              onClick={() => handleDateOpen(!showDate)}
              disabled={busy}
              className="self-start px-1 text-xs text-ink-subtle underline"
            >
              {showDate ? "날짜는 자동으로 (오늘, 지났으면 내일)" : "날짜도 고르기"}
            </button>
          </div>
        )}

      </section>

      {poolShort && (
        <p className="text-sm text-primary">
          준비된 미션이 {PRESET_MISSIONS.length}개라 {PRESET_MISSIONS.length}명까지만 서로 다른
          미션을 줄 수 있어요.
          {isHost ? " '모두 같은 미션'이나 '서로 정해주기'로 바꿔 주세요." : ""}
        </p>
      )}

      {error && <p className="text-sm text-primary">{error}</p>}

      {!isHost && <p className="text-sm text-ink-muted">방장이 설정을 마치면 자동으로 넘어가요.</p>}
    </Popup>
  );
}
