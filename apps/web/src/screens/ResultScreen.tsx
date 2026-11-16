"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toBlob } from "html-to-image";
import ErrorView from "../components/ErrorView";
import AnimalImage from "../components/AnimalImage";
import MemberLabel from "../components/MemberLabel";
import { BlurBackdrop } from "../components/ScreenShell";
import { useAuthState } from "../lib/firebase/auth";
import BottomButton from "../components/BottomButton";
import BottomSheet from "../components/BottomSheet";
import ChoiceButtons from "../components/ChoiceButtons";
import Popup from "../components/Popup";
import { SCENE_IMAGE } from "../components/SceneBackground";
import {
  composeOnBackdrop,
  placeCards,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type BackdropLayout,
  type Size,
} from "../lib/resultImage";
import { PawIcon, ThumbDownIcon } from "../components/Icons";
import {
  useBoomDowns,
  useJudgments,
  preloadPhoto,
  useMembers,
  useRoom,
  useStoragePhoto,
} from "../lib/firebase/hooks";
import {
  boomDown,
  judgeMission,
  markResultEntered,
  markShowcaseNext,
  setAwardIndex,
  setShowcaseIndex,
} from "../lib/firebase/roomRepo";
import { countFor, judgmentState, type JudgmentCounts, type JudgmentState } from "../lib/judgment";
import { ROUTES, type VoteCategory } from "@pawpaw/shared";
import {
  RESULTS_NOT_OPEN,
  resultRepository,
  type ResultData,
  type ResultPlayer,
  type ResultSubmission,
} from "../lib/firebase/resultRepo";

const CATEGORY_TEXT: Record<VoteCategory, { title: string; question: string }> = {
  funny: { title: "가장 웃긴 미션", question: "가장 웃긴 미션을 한 친구를 골라주세요" },
  hard: { title: "가장 어려운 미션", question: "가장 어려운 미션을 한 친구를 골라주세요" },
};

// ---------- 계산 함수 (인원 수와 상관없이 동작) ----------
// 미션 실패(인정 투표에서 불인정 과반)한 친구는 빼고 고른다.
function getFastestWinner(data: ResultData, failedIds: ReadonlySet<string>): ResultPlayer | null {
  const first = [...data.submissions]
    .filter((s) => !failedIds.has(s.playerId))
    .sort((a, b) => a.submittedAt - b.submittedAt)[0];
  return first ? data.players.find((p) => p.id === first.playerId) ?? null : null;
}

// 최다 득표자. 동점이면 ① 아직 상을 받지 않은 사람 ② 먼저 제출한 사람 순으로 고른다.
// awardedIds: 이미 다른 상을 받기로 정해진 사람
function getVoteWinner(
  data: ResultData,
  category: VoteCategory,
  awardedIds: ReadonlySet<string> = new Set(),
) {
  const counts: Record<string, number> = {};
  Object.values(data.votes[category]).forEach((t) => {
    counts[t] = (counts[t] ?? 0) + 1;
  });
  const submittedAt = (id: string) =>
    data.submissions.find((s) => s.playerId === id)?.submittedAt ?? Infinity;
  const awarded = (id: string) => (awardedIds.has(id) ? 1 : 0);
  const top = Object.entries(counts).sort(
    (a, b) =>
      b[1] - a[1] || awarded(a[0]) - awarded(b[0]) || submittedAt(a[0]) - submittedAt(b[0]),
  )[0];
  if (!top) return null;
  const player = data.players.find((p) => p.id === top[0]);
  return player ? { player, count: top[1] } : null;
}

// 투표를 모두 끝냈는지. hardVote가 false면(모두 같은 미션) '어려운 미션' 투표는 없다.
function hasVoted(data: ResultData, playerId: string, hardVote: boolean) {
  return Boolean(data.votes.funny[playerId] && (!hardVote || data.votes.hard[playerId]));
}

// 투표할 수 있는 사람: 나를 빼고 고를 후보(사진을 냈고 미션에 실패하지 않은 친구)가 한 명이라도 있는 사람.
// 나 말고 모두 실패했거나 사진을 안 냈으면 투표를 건너뛰므로, 기다릴 사람에서도 뺀다.
function getVoters(data: ResultData, eligibleIds: ReadonlySet<string>) {
  return data.players.filter((p) => [...eligibleIds].some((id) => id !== p.id));
}

// ---------- 미션 사진 ----------
// fit = "cover": 정사각형에 꽉 채운다(잘릴 수 있음, 투표 후보 썸네일)
// fit = "contain": 사진 전체를 원래 비율대로 보여준다(미션 구경, 시상식). 높이는 maxHeight까지
function MissionPhoto({
  player,
  submission,
  fit = "cover",
  maxHeight = "max-h-[45dvh]",
}: {
  player: ResultPlayer;
  submission: ResultSubmission | undefined;
  fit?: "cover" | "contain" | "frame"; // frame: 폭을 꽉 채우고 높이는 사진 비율대로(결과 카드, 잘리지 않음)
  maxHeight?: string;
}) {
  const photo = useStoragePhoto(
    submission?.photoPath ?? null,
    submission ? String(submission.submittedAt) : null,
  );
  return (
    <div
      className={`grid w-full place-items-center text-xs text-gray-400 ${
        fit === "frame"
          ? `bg-black ${photo.url ? "" : "aspect-[4/3]"}`
          : `bg-gray-100 ${fit === "cover" || !photo.url ? `aspect-square ${fit === "contain" ? maxHeight : ""}` : ""}`
      }`}
    >
      {photo.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.url}
          alt={`${player.nickname}의 미션 사진`}
          className={
            fit === "cover"
              ? "size-full object-cover"
              : fit === "frame"
                ? "block h-auto w-full"
                : `mx-auto w-auto max-w-full object-contain ${maxHeight}`
          }
        />
      ) : photo.failed ? (
        "사진을 불러오지 못했어요"
      ) : (
        "사진 불러오는 중…"
      )}
    </div>
  );
}

// ---------- 미션 구경 대기 ----------
// 모두 들어오면 방장이 첫 미션을 띄운다. 다 모이지 않아도 방장은 확인을 거쳐 시작할 수 있다.
// 모양은 방 화면의 팝업 카드와 같고, 방장 버튼은 화면 맨 아래(게임 시작 자리)에 둔다.
function ShowcaseLobby({
  players,
  enteredIds,
  isHost,
  busy,
  onStart,
}: {
  players: ResultPlayer[];
  enteredIds: ReadonlySet<string>;
  isHost: boolean;
  busy: boolean;
  onStart: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const enteredCount = players.filter((p) => enteredIds.has(p.id)).length;
  const waiting = players.length - enteredCount;

  return (
    <section className="flex w-full flex-1 flex-col self-stretch">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
          <p className="text-xl font-bold">친구들이 모이고 있어요</p>
          <p className="mt-2 text-sm text-ink-muted">
            {enteredCount} / {players.length}명이 들어왔어요
          </p>
          {/* 들어온 친구는 선명하게, 아직인 친구는 흐리게 */}
          <ul className="mt-4 flex flex-wrap justify-center gap-3">
            {players.map((p) => {
              const entered = enteredIds.has(p.id);
              return (
                <li key={p.id} className={entered ? "" : "opacity-30 grayscale"}>
                  <MemberLabel
                    animal={p.animal}
                    nickname={p.nickname}
                    layout="column"
                    faceClassName="size-14 bg-canvas"
                  />
                  <span className="sr-only">{entered ? " 들어왔어요" : " 아직이에요"}</span>
                </li>
              );
            })}
          </ul>
        </div>
        {!isHost && (
          <p className="rounded-full bg-surface/90 px-4 py-2 text-sm text-ink-muted shadow-card">
            방장이 첫 미션을 띄우면 같이 구경해요.
          </p>
        )}
      </div>

      {isHost && (
        <BottomButton onClick={() => (waiting > 0 ? setConfirming(true) : onStart())} disabled={busy}>
          첫 미션 보기
        </BottomButton>
      )}

      {confirming && (
        <Popup
          title="그래도 시작할까요?"
          onClose={() => setConfirming(false)}
        >
          <p className="text-sm text-ink-muted">
            아직 {waiting}명이 들어오지 않았어요. 늦게 들어온 친구는 그때 보고 있는 미션부터 함께 봐요.
          </p>
          <ChoiceButtons
            cancelLabel="기다리기"
            confirmLabel="시작하기"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              onStart();
            }}
            busy={busy}
          />
        </Popup>
      )}
    </section>
  );
}

// ---------- 미션 구경 (투표 전, 방장이 한 명씩 넘긴다) ----------
function ShowcaseStage({
  index,
  total,
  player,
  submission,
  isHost,
  busy,
  onNext,
  boomCount,
  boomState,
  onBoom,
  judgment,
  counts,
  nextVotes,
  nextNeeded,
  wantNext,
  onWantNext,
}: {
  index: number;
  total: number;
  player: ResultPlayer;
  submission: ResultSubmission | undefined;
  isHost: boolean;
  busy: boolean;
  onNext: () => void;
  nextVotes: number; // 방장을 뺀 멤버 중 지금 친구를 넘기자고 한 수
  nextNeeded: number; // 방장이 넘길 수 있으려면 필요한 수 (방장을 뺀 멤버의 과반)
  wantNext: boolean; // 내가 이미 넘기자고 했는지
  onWantNext: () => void;
  boomCount: number;
  boomState: "mine" | "done" | "ready"; // mine: 내 미션이라 못 누름, done: 이미 누름
  onBoom: () => void;
  judgment: JudgmentState;
  counts: JudgmentCounts;
}) {
  const isLast = index === total - 1;
  // 서버 응답을 기다리지 않고 누른 것을 바로 보여준다. (이 컴포넌트는 친구마다 새로 그려진다)
  const [pressedHere, setPressedHere] = useState(false);
  const shownBoomState = pressedHere && boomState === "ready" ? "done" : boomState;
  const handleBoom = () => {
    if (shownBoomState !== "ready") return;
    setPressedHere(true);
    try {
      navigator.vibrate?.(40); // 지원하는 휴대폰에서 짧게 진동
    } catch {
      // 진동을 못 해도 괜찮다
    }
    onBoom();
  };
  return (
    <motion.section
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex w-full flex-1 flex-col self-stretch"
    >
      {/* 내용은 가운데, 방장의 '다음 친구' 버튼은 화면 맨 아래(방 화면의 '게임 시작' 자리)에 둔다. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">
          미션 구경 {index + 1} / {total}
        </p>
        <h2 className="max-w-full text-2xl font-bold">
          <MemberLabel
            animal={player.animal}
            nickname={player.nickname}
            faceClassName="size-12 bg-surface"
          />
        </h2>
        <div className="w-full overflow-hidden rounded-3xl bg-white shadow">
          <p className="p-4 text-lg font-bold">{player.mission ?? "미션을 불러오지 못했어요"}</p>
          <div className="relative">
            {/* 작은 화면에서도 아래 '다음 친구' 버튼이 보이도록 사진 높이를 화면의 45%까지로 줄인다. */}
            <MissionPhoto player={player} submission={submission} fit="contain" />
            {/* 판정이 나면 사진 위에 크게 찍어 준다 */}
            {(judgment === "failed" || judgment === "accepted") && (
              <motion.p
                initial={{ scale: 2, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: -12 }}
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-card border-4 bg-surface/90 px-4 py-2 text-2xl font-bold ${
                  judgment === "failed" ? "border-primary text-primary" : "border-success text-success"
                }`}
              >
                {judgment === "failed" ? "미션 실패" : "인정"}
              </motion.p>
            )}
          </div>
          {/* 붐따: 사진 아래 오른쪽의 동그란 아이콘 버튼. 한 사람에게 한 번만.
              누른 수는 모서리에 작게 보인다. (누가 눌렀는지는 보여주지 않는다) */}
          <div className="flex justify-end p-3">
            <motion.button
              onClick={handleBoom}
              disabled={shownBoomState !== "ready"}
              aria-pressed={shownBoomState === "done"}
              aria-label={`붐따 ${boomCount}개`}
              title="붐따"
              whileTap={{ scale: 0.8 }}
              // 누르면 흔들리고, 누른 뒤에는 강조색(빨강) 원으로 바뀐다.
              animate={pressedHere ? { rotate: [0, -18, 14, -8, 0] } : { rotate: 0 }}
              transition={{ duration: 0.4 }}
              className={`relative grid size-12 place-items-center rounded-full shadow-card transition-colors ${
                shownBoomState === "done"
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface/90 text-ink"
              } ${shownBoomState === "mine" ? "opacity-60" : ""}`}
            >
              {/* 누른 순간 '+1'이 떠올랐다 사라진다 */}
              <AnimatePresence>
                {pressedHere && (
                  <motion.span
                    key="plus"
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 0, y: -36 }}
                    transition={{ duration: 0.8 }}
                    className="pointer-events-none absolute -top-2 text-sm font-bold text-primary"
                  >
                    +1
                  </motion.span>
                )}
              </AnimatePresence>
              <ThumbDownIcon />
              {boomCount > 0 && (
                <motion.span
                  key={boomCount}
                  initial={{ scale: 1.6 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-canvas px-1 text-xs font-bold text-ink shadow-card"
                >
                  {boomCount}
                </motion.span>
              )}
            </motion.button>
          </div>
        </div>
        {judgment === "voting" && (
          <p className="text-sm text-ink-muted">
            인정 투표 중이에요 ({counts.accepts + counts.rejects} / {counts.voterCount}명)
          </p>
        )}
        {/* 방장을 뺀 친구들의 과반이 넘기자고 해야 방장이 넘길 수 있다. */}
        <p className="text-sm text-gray-500">
          {isHost
            ? `넘기자는 친구 ${nextVotes} / ${nextNeeded}명`
            : wantNext
              ? `넘기자고 했어요. 방장이 다음 친구로 넘겨요. (${nextVotes} / ${nextNeeded}명)`
              : "다 봤으면 넘기자고 알려 주세요."}
        </p>
      </div>
      {isHost ? (
        <BottomButton
          onClick={onNext}
          disabled={busy}
          blockedReason={
            judgment === "voting"
              ? "인정 투표가 아직 끝나지 않았어요."
              : nextVotes < nextNeeded
                ? `친구들 과반이 넘기자고 해야 넘길 수 있어요. (${nextVotes} / ${nextNeeded}명)`
                : null
          }
        >
          {isLast ? "투표 시작하기" : "다음 친구"}
        </BottomButton>
      ) : (
        <BottomButton onClick={onWantNext} disabled={wantNext}>
          {wantNext ? "넘기자고 했어요" : isLast ? "투표하러 가자" : "다음으로 넘기자"}
        </BottomButton>
      )}
    </motion.section>
  );
}

// ---------- 인정 투표 시트 (붐따가 30% 이상이면 본인 포함 모두에게 아래에서 올라온다) ----------
// 사진을 보면서 고를 수 있게 화면을 가리지 않고, 내렸다가 다시 올릴 수 있다.
function JudgePopup({
  player,
  boomCount,
  busy,
  onJudge,
}: {
  player: ResultPlayer;
  boomCount: number;
  busy: boolean;
  onJudge: (accept: boolean) => void;
}) {
  return (
    <BottomSheet title="이 미션을 인정할까요?">
      <div className="w-full rounded-sheet bg-surface p-4 shadow-card">
        <p className="text-lg">
          <MemberLabel animal={player.animal} nickname={player.nickname} />
        </p>
        <p className="mt-2">{player.mission ?? "미션을 불러오지 못했어요"}</p>
      </div>
      <p className="text-sm text-ink-muted">
        붐따가 {boomCount}개 나왔어요. 과반수가 인정하지 않으면 미션 실패예요.
      </p>
      {/* 버튼은 화면 아래가 아니라 팝업 안에 나란히 둔다 */}
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          onClick={() => onJudge(true)}
          disabled={busy}
          className="rounded-full bg-primary px-4 py-3 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
        >
          인정해요
        </button>
        <button
          onClick={() => onJudge(false)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-full bg-surface px-4 py-3 font-bold text-ink shadow-card active:scale-95 disabled:opacity-50"
        >
          인정 못 해요
          <ThumbDownIcon className="size-5" />
        </button>
      </div>
    </BottomSheet>
  );
}

// ---------- 투표 화면 ----------
// 후보 한 명: 제출한 사진, 받은 미션, 동물과 닉네임
function CandidateCard({
  player,
  submission,
  selected,
  onSelect,
}: {
  player: ResultPlayer;
  submission: ResultSubmission | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full flex-col overflow-hidden rounded-2xl border-2 bg-white text-left shadow active:scale-95 ${
        selected ? "border-red-500" : "border-transparent"
      }`}
    >
      <MissionPhoto player={player} submission={submission} />
      <div className="flex flex-col gap-1 p-3">
        <p className="text-sm">
          <MemberLabel
            animal={player.animal}
            nickname={player.nickname}
            faceClassName="size-8 bg-canvas"
            className="gap-2"
          />
        </p>
        <p className="text-xs text-gray-600">{player.mission ?? "미션을 불러오지 못했어요"}</p>
      </div>
    </button>
  );
}

function VoteScreen({
  category,
  stepLabel,
  candidates,
  submissions,
  onVote,
}: {
  category: VoteCategory;
  stepLabel: string;
  candidates: ResultPlayer[];
  submissions: ResultSubmission[];
  onVote: (targetId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="flex w-full flex-col items-center gap-4"
    >
      <p className="text-sm text-gray-500">{stepLabel}</p>
      <h2 className="text-2xl font-bold">{CATEGORY_TEXT[category].title}</h2>
      <p className="text-gray-600">{CATEGORY_TEXT[category].question}</p>

      {/* 인원이 많아도 이 영역 안에서만 스크롤돼요 */}
      <ul className="grid max-h-[60dvh] w-full grid-cols-2 gap-3 overflow-y-auto p-1">
        {candidates.map((p) => (
          <li key={p.id}>
            <CandidateCard
              player={p}
              submission={submissions.find((s) => s.playerId === p.id)}
              selected={selected === p.id}
              onSelect={() => setSelected(p.id)}
            />
          </li>
        ))}
      </ul>

      <button
        disabled={!selected}
        onClick={() => selected && onVote(selected)}
        className="mt-2 rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95 disabled:bg-gray-300"
      >
        투표하기
      </button>
    </motion.section>
  );
}

// ---------- 발표 화면 (빰!) ----------
function RevealStage({
  title,
  winner,
  detail,
  isLast,
  onNext,
  canNext,
}: {
  title: string;
  winner: ResultPlayer;
  detail: string;
  isLast: boolean;
  onNext: () => void;
  canNext: boolean; // 다 같이 볼 때는 방장만 넘긴다
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex w-full flex-col items-center gap-4"
    >
      <h2 className="text-2xl font-bold">{title}</h2>
      {!revealed ? (
        <motion.p
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 0.6 }}
          className="py-20 text-3xl font-bold text-gray-500"
        >
          두구두구두구...
        </motion.p>
      ) : (
        <>
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 12 }}
          >
            <AnimalImage animal={winner.animal} className="size-32 bg-surface shadow-card" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold"
          >
            {winner.nickname}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-gray-600"
          >
            {detail}
          </motion.p>
          {/* 1등이 한 미션 (사진은 미션 구경에서 이미 봤으니 제목만) */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="w-full rounded-3xl bg-white px-4 py-3 font-bold shadow"
          >
            {winner.mission ?? "미션을 불러오지 못했어요"}
          </motion.p>
          {canNext ? (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              onClick={onNext}
              className="mt-4 rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95"
            >
              {isLast ? "결과 카드 보기" : "다음"}
            </motion.button>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="mt-4 text-sm text-gray-500"
            >
              방장이 다음으로 넘겨요.
            </motion.p>
          )}
        </>
      )}
    </motion.section>
  );
}

// ---------- 결과 카드 (인생네컷 액자) ----------
type FrameColor = "black" | "beige";
type StripItem = {
  key: string;
  player: ResultPlayer;
  submission: ResultSubmission | undefined;
  badge?: string; // 사진 아래 왼쪽의 짧은 이름표 (웃긴·빠른·어려운)
};

// 액자(검정 또는 베이지)에 사진 칸을 세로로 쌓는다.
// 맨 위 가운데에 로고, 사진 오른쪽 아래에 캐릭터, 사진 아래에 이름표·미션과 닉네임, 맨 아래에 날짜.
// 사진은 자르지 않는다: 폭을 꽉 채우고 높이는 사진 비율대로. 이미지로 저장하면 액자째 찍힌다.
// 폭은 늘 STRIP_WIDTH로 고정한다. 화면에서는 미리보기가 통째로 줄이고, 저장할 때는 이 크기 그대로 찍는다.
const STRIP_WIDTH = 360;

function ResultStrip({
  items,
  frameColor,
  date,
  stripRef,
}: {
  items: StripItem[];
  frameColor: FrameColor;
  date: string;
  stripRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={stripRef}
      style={{ width: STRIP_WIDTH }}
      className={`flex flex-col gap-6 p-3 pb-4 ${
        frameColor === "black" ? "bg-ink text-canvas" : "bg-canvas text-ink shadow"
      }`}
    >
      {/* 로고: 액자 맨 위 가운데 */}
      <p className="flex items-center justify-center gap-1.5 pt-1 text-lg font-bold">
        <PawIcon className="size-5" />
        PawPaw
      </p>
      {items.map((item) => (
        <div key={item.key} className="w-full">
          <div className="relative w-full overflow-hidden">
            <MissionPhoto player={item.player} submission={item.submission} fit="frame" />
            {/* 사진 오른쪽 아래에 캐릭터를 시그니처처럼 */}
            <span className="absolute bottom-2 right-2 drop-shadow" aria-hidden="true">
              <AnimalImage animal={item.player.animal} className="size-10 bg-canvas" />
            </span>
          </div>
          {/* 사진 아래: 왼쪽에 이름표와 미션, 오른쪽에 닉네임 */}
          <div className="flex items-center justify-between gap-2 pt-1.5 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-left">
              {item.badge && (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${
                    frameColor === "black" ? "bg-canvas text-ink" : "bg-ink text-canvas"
                  }`}
                >
                  {item.badge}
                </span>
              )}
              <span className="min-w-0 truncate opacity-80">{item.player.mission ?? ""}</span>
            </span>
            <span className="shrink-0 text-right font-bold">{item.player.nickname}</span>
          </div>
        </div>
      ))}
      <p className="px-1 pt-1 text-right text-sm tracking-widest">{date}</p>
    </div>
  );
}

// 전체 미션을 볼 때 이 인원부터는 한 줄이 너무 길어지니 반씩 나눠 두 줄로 놓는다.
// (저장할 때도 서로 다른 두 장을 나란히 놓는 레이아웃으로만 저장한다)
const SPLIT_STRIP_FROM = 5;

// ---------- 저장 레이아웃 ----------
// card: 결과 카드만 / center: 흐린 배경 + 카드 가운데 / pair: 흐린 배경 + 카드 두 장 나란히
type SaveStyle = "card" | BackdropLayout;

const SAVE_STYLES: { style: SaveStyle; label: string }[] = [
  { style: "card", label: "카드만" },
  { style: "center", label: "한 장" },
  { style: "pair", label: "두 장" },
];

// 레이아웃 버튼 그림: 9:16 틀에 배경(흐림)과 카드(세로 막대)를 간단히 그린다.
function SaveStyleThumb({ style }: { style: SaveStyle }) {
  const bar = (size: string) => <span className={`${size} rounded-[2px] bg-ink shadow`} />;
  if (style === "card") {
    return <span className="flex h-10 w-[22px] justify-center">{bar("h-full w-[60%]")}</span>;
  }
  return (
    <span className="relative flex h-10 w-[22px] items-center justify-center overflow-hidden rounded-[3px]">
      <span
        aria-hidden
        className="absolute inset-0 scale-125 bg-cover bg-center blur-[1px]"
        style={{ backgroundImage: `url(${SCENE_IMAGE.sunset})` }}
      />
      <span className="relative flex h-full w-full items-center justify-center gap-px">
        {style === "center" ? (
          bar("h-[80%] w-[45%]")
        ) : (
          <>
            {bar("h-[80%] w-[32%]")}
            {bar("h-[80%] w-[32%]")}
          </>
        )}
      </span>
    </span>
  );
}

// 레이아웃 고르기. 두 줄(사람이 많음)일 때는 두 장만 고를 수 있다.
function LayoutPicker({
  value,
  onChange,
  onlyPair,
}: {
  value: SaveStyle;
  onChange: (style: SaveStyle) => void;
  onlyPair: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="저장 레이아웃" className="flex items-end gap-2">
      {SAVE_STYLES.map((s) => (
        <button
          key={s.style}
          role="radio"
          aria-checked={value === s.style}
          disabled={onlyPair && s.style !== "pair"}
          onClick={() => onChange(s.style)}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-1.5 pb-0.5 pt-1 active:scale-95 disabled:opacity-30 ${
            value === s.style ? "bg-surface shadow-card ring-2 ring-primary/60" : ""
          }`}
        >
          <SaveStyleThumb style={s.style} />
          <span className="text-[10px] font-bold">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- 저장될 모습 미리보기 ----------
// 저장하는 사진과 똑같이 그린다: 카드만이면 카드를, 배경 레이아웃이면 1080×1920 무대에 흐린 배경과 카드를
// 저장할 때와 같은 자리(placeCards)에 놓고, 무대째 화면에 맞게 줄인다.
// 저장할 때 찍는 카드(액자) 노드는 onCaptureNodes로 알려 준다. (같은 카드를 두 번 놓을 때 두 번째는 담지 않는다)
const PREVIEW_RESERVE_PX = 300; // 미리보기 말고 화면에 함께 있는 것: 위아래 여백, 탭, 액자 색·레이아웃 버튼, 저장 버튼들
const FALLBACK_SIZE: Size = { width: STRIP_WIDTH, height: STRIP_WIDTH * 2 };

function ResultPreview({
  layout,
  strips,
  frameColor,
  date,
  onCaptureNodes,
}: {
  layout: SaveStyle;
  strips: StripItem[][];
  frameColor: FrameColor;
  date: string;
  onCaptureNodes: (nodes: (HTMLDivElement | null)[]) => void;
}) {
  // 화면에서 쓸 수 있는 넓이
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!box) return;
    const update = () =>
      setView({
        width: box.clientWidth,
        height: Math.max(240, window.innerHeight - PREVIEW_RESERVE_PX),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [box]);

  // 카드 원래 크기 (사진을 불러오면 높이가 바뀌므로 계속 잰다)
  const [nodes, setNodes] = useState<(HTMLDivElement | null)[]>([null, null]);
  const setNode0 = useCallback((node: HTMLDivElement | null) => {
    setNodes((prev) => (prev[0] === node ? prev : [node, prev[1]]));
  }, []);
  const setNode1 = useCallback((node: HTMLDivElement | null) => {
    setNodes((prev) => (prev[1] === node ? prev : [prev[0], node]));
  }, []);
  // 저장할 때 찍을 카드 노드를 화면(부모)에 알려 준다.
  useEffect(() => {
    onCaptureNodes(nodes);
  }, [nodes, onCaptureNodes]);
  const [sizes, setSizes] = useState<Size[]>([]);
  useEffect(() => {
    const els = nodes.filter((n): n is HTMLDivElement => n !== null);
    const update = () =>
      setSizes(els.map((n) => ({ width: n.offsetWidth, height: n.offsetHeight })));
    update();
    const observer = new ResizeObserver(update);
    els.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [nodes]);
  const sizeOf = (i: number) => sizes[i] ?? sizes[0] ?? FALLBACK_SIZE;

  if (layout === "card") {
    const size = sizeOf(0);
    const scale = Math.min(1, view.width / size.width, view.height / size.height) || 1;
    return (
      <div ref={setBox} className="w-full">
        <div className="mx-auto" style={{ width: size.width * scale, height: size.height * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <ResultStrip items={strips[0]} frameColor={frameColor} date={date} stripRef={setNode0} />
          </div>
        </div>
      </div>
    );
  }

  // 무대에 올릴 카드: 한 장 = 첫 카드, 두 장 = 두 줄이면 각각, 한 줄이면 같은 카드를 두 번
  const cards =
    layout === "center"
      ? [strips[0]]
      : strips.length > 1
        ? strips.slice(0, 2)
        : [strips[0], strips[0]];
  const rects = placeCards(
    layout,
    strips.slice(0, cards.length).map((_, i) => sizeOf(i)),
  );
  const scale = Math.min(view.width / STAGE_WIDTH, view.height / STAGE_HEIGHT) || 0.25;
  return (
    <div ref={setBox} className="w-full">
      <div
        className="relative mx-auto overflow-hidden rounded-card shadow-card"
        style={{ width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {/* 흐린 놀이터 배경 (저장할 때와 같은 노을 장면) */}
          <div
            aria-hidden
            className="absolute -inset-16 bg-cover bg-center"
            style={{ backgroundImage: `url(${SCENE_IMAGE.sunset})`, filter: "blur(28px)" }}
          />
          <div aria-hidden className="absolute inset-0 bg-white/20" />
          {cards.map((items, i) => {
            const rect = rects[i];
            const own = i < strips.length; // 같은 카드를 두 번 놓을 때 두 번째는 찍지 않는다
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: rect.x,
                  top: rect.y,
                  transform: `scale(${rect.width / sizeOf(own ? i : 0).width})`,
                  transformOrigin: "top left",
                  boxShadow: "0 5px 13px rgba(0, 0, 0, 0.3)",
                }}
              >
                <ResultStrip
                  items={items}
                  frameColor={frameColor}
                  date={date}
                  stripRef={own ? (i === 0 ? setNode0 : setNode1) : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- 전체 화면 ----------
type Phase = "voteFunny" | "voteHard" | "waiting" | "reveal" | "share";

// 이미 투표한 적이 있으면 그 다음 단계부터 시작
function phaseFor(d: ResultData): Phase {
  const funny = d.votes.funny[d.me];
  const hard = d.votes.hard[d.me];
  if (funny && hard) return "waiting";
  if (funny) return "voteHard";
  return "voteFunny";
}

type LoadResult =
  | { data: ResultData; error: null }
  | { data: null; error: "notOpen" | "failed" };

export default function ResultScreen() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;

  const auth = useAuthState(); // 익명 로그인 (친구의 auth.ts)
  const uid = auth.status === "signedIn" ? auth.uid : null;

  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState<"notOpen" | "failed" | null>(null);
  const [phase, setPhase] = useState<Phase>("voteFunny");
  const [revealIndex, setRevealIndex] = useState(0);
  const room = useRoom(roomId, uid); // 미션 구경 순번(showcaseIndex)과 방장을 실시간으로 따라간다
  const members = useMembers(roomId, uid); // 누가 결과 화면에 들어왔는지(resultEntered)
  const boomDowns = useBoomDowns(roomId, uid, data !== null); // 결과를 읽을 수 있게 된 뒤에 구독
  const judgments = useJudgments(roomId, uid, data !== null);
  const [judgeBusy, setJudgeBusy] = useState(false);
  const [replaying, setReplaying] = useState(false); // '발표 다시 보기'는 각자 따로 본다
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [awardBusy, setAwardBusy] = useState(false);
  const [frameColor, setFrameColor] = useState<"black" | "beige">("black"); // 결과 카드 액자 색 (베이지 = 앱 바탕색)


  // 친구별 인정 투표 판정. 미션 실패한 친구는 투표 후보와 '가장 빠른 미션'에서 빠진다.
  const verdicts = useMemo(() => {
    const result = new Map<string, { state: JudgmentState; counts: JudgmentCounts }>();
    if (!data) return result;
    const ids = data.players.map((p) => p.id);
    const entered = new Set(
      members.status === "ready"
        ? members.data.filter((m) => m.player.resultEntered === true).map((m) => m.player.id)
        : [],
    );
    const booms = boomDowns.status === "ready" ? boomDowns.data : [];
    const records = judgments.status === "ready" ? judgments.data : [];
    for (const id of ids) {
      const counts = countFor(id, ids, entered, booms, records);
      result.set(id, { state: judgmentState(counts), counts });
    }
    return result;
  }, [data, members, boomDowns, judgments]);
  const failedIds = useMemo(
    () => new Set([...verdicts].filter(([, v]) => v.state === "failed").map(([id]) => id)),
    [verdicts],
  );
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const enteredRef = useRef(false);
  const initialized = useRef(false);

  // 결과 화면에 들어왔다고 한 번 표시한다. (결과를 읽을 수 있게 된 뒤에)
  // 실패해도 다시 시도하지 않는다. Firestore는 쓰기를 먼저 화면에 반영했다가 거부되면 되돌리는데,
  // 그때마다 다시 쓰면 '들어왔어요'가 켜졌다 꺼졌다를 끝없이 반복한다.
  const meEntered =
    members.status === "ready" &&
    members.data.some((m) => m.player.id === uid && m.player.resultEntered === true);
  const canMark = uid !== null && data !== null && members.status === "ready" && !meEntered;
  useEffect(() => {
    if (!canMark || !uid || enteredRef.current) return;
    enteredRef.current = true;
    markResultEntered(roomId, uid).catch((e) => console.error(e));
  }, [canMark, roomId, uid]);
  // 저장할 때 찍는 카드(액자)들. 미리보기가 채운다. 두 줄이면 두 개.
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const setCaptureNodes = useCallback((nodes: (HTMLDivElement | null)[]) => {
    stripRefs.current = nodes;
  }, []);
  const [cardView, setCardView] = useState<"awards" | "all">("awards"); // 수상작만 / 전체 미션
  const [layout, setLayout] = useState<SaveStyle>("card"); // 저장 레이아웃 (미리보기에 그대로 보인다)
  const [saving, setSaving] = useState(false);

  // 서버에서 결과를 받아 오기만 한다. (state는 건드리지 않음)
  const fetchResult = useCallback(async (): Promise<LoadResult | null> => {
    if (!uid) return null;
    try {
      return { data: await resultRepository.getRoomData(roomId, uid), error: null };
    } catch (e) {
      console.error(e);
      return {
        data: null,
        error: e instanceof Error && e.message === RESULTS_NOT_OPEN ? "notOpen" : "failed",
      };
    }
  }, [roomId, uid]);

  const applyResult = (r: LoadResult | null) => {
    if (!r) return;
    if (r.data) setData(r.data);
    setError(r.error);
  };

  // 결과를 받자마자 모든 사진을 한꺼번에 미리 받아 둔다. (미션 구경·투표·시상식에서 기다리지 않게)
  useEffect(() => {
    data?.submissions.forEach((sub) => {
      if (sub.photoPath) preloadPhoto(sub.photoPath, String(sub.submittedAt)).catch(() => {});
    });
  }, [data]);

  // 방장이 시상식을 시작하면 최신 투표로 다시 불러온다. (대기 화면은 3초마다만 불러오므로)
  const awardStarted = room.status === "ready" && room.data?.awardIndex !== undefined;
  useEffect(() => {
    if (!awardStarted) return;
    let cancelled = false;
    fetchResult().then((r) => {
      if (!cancelled) applyResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [awardStarted, fetchResult]);

  // 버튼(다시 시도, 투표 후 새로고침)에서 부른다.
  const load = async () => {
    const r = await fetchResult();
    applyResult(r);
    return r?.data ?? null;
  };

  // 로그인되면 데이터를 불러오고, 처음 한 번만 내 투표 상태에 맞는 단계로 시작
  useEffect(() => {
    let cancelled = false;
    fetchResult().then((r) => {
      if (cancelled) return;
      applyResult(r);
      if (r?.data && !initialized.current) {
        initialized.current = true;
        setPhase(phaseFor(r.data));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchResult]);

  // 나를 빼고 투표할 후보(사진을 냈고 미션에 실패하지 않은 친구)가 없으면 투표를 건너뛴다.
  const noCandidates = useMemo(
    () =>
      data !== null &&
      !data.players.some(
        (p) =>
          p.id !== data.me &&
          !failedIds.has(p.id) &&
          data.submissions.some((s) => s.playerId === p.id),
      ),
    [data, failedIds],
  );
  // 미션 구경이 끝났는지 (방 정보를 못 읽으면 구경 없이 바로 투표한다)
  const roomNow = room.status === "ready" ? room.data : null;
  // 모두 같은 미션을 한 방은 난이도를 비교할 수 없으므로 '가장 어려운 미션' 투표를 하지 않는다.
  const hardVote = roomNow?.settings.scope !== "same";
  const showcaseDone =
    roomNow === null ||
    (data !== null &&
      (roomNow.showcaseIndex ?? -1) >=
        data.players.filter((p) => data.submissions.some((s) => s.playerId === p.id)).length);
  // 방장이 이미 시상식(결과 공개)을 시작했으면(awardStarted), 투표하지 않았더라도 투표는 끝난 것으로 보고
  // 시상식을 따라간다. (결과 공개 뒤에 링크로 다시 들어오면 시상식이 끝난 경우 바로 이미지 저장 화면이 보인다)
  // 투표를 건너뛴 사람은 대기 화면을 본다.
  const waitingForVotes =
    phase === "waiting" ||
    (phase === "voteHard" && !hardVote) ||
    (phase.startsWith("vote") && showcaseDone && (noCandidates || awardStarted));

  // 대기 화면에서는 3초마다 다시 불러와서 "전원 투표 완료"를 확인
  useEffect(() => {
    if (!waitingForVotes) return;
    let cancelled = false;
    const t = setInterval(() => {
      fetchResult().then((r) => {
        if (!cancelled) applyResult(r);
      });
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [waitingForVotes, fetchResult]);

  const revealList = useMemo(() => {
    if (!data) return [];
    // 동점이면 상을 아직 받지 않은 사람에게 주므로, 투표와 상관없는 '빠른' 상부터 정한다.
    const fastest = getFastestWinner(data, failedIds);
    const awarded = new Set(fastest ? [fastest.id] : []);
    const funny = getVoteWinner(data, "funny", awarded);
    if (funny) awarded.add(funny.player.id);
    const hard = hardVote ? getVoteWinner(data, "hard", awarded) : null;
    // 발표 순서: 웃긴 → 빠른 → 어려운
    return [
      // short: 결과 카드에서 미션 앞에 붙이는 짧은 이름
      funny && { title: "가장 웃긴 미션", short: "웃긴", winner: funny.player, detail: `${funny.count}표를 받았어요` },
      fastest && { title: "가장 빠른 미션", short: "빠른", winner: fastest, detail: "가장 먼저 미션을 제출했어요" },
      hard && { title: "가장 어려운 미션", short: "어려운", winner: hard.player, detail: `${hard.count}표를 받았어요` },
    ].filter(
      (x): x is { title: string; short: string; winner: ResultPlayer; detail: string } => Boolean(x),
    );
  }, [data, failedIds, hardVote]);

  const vote = async (category: VoteCategory, targetId: string, nextPhase: Phase) => {
    if (!data) return;
    try {
      await resultRepository.submitVote(roomId, data.me, category, targetId);
      await load();
      setPhase(nextPhase);
    } catch (e) {
      console.error(e);
      alert("투표에 실패했어요. 다시 시도해 주세요.");
    }
  };

  const replay = () => {
    setReplaying(true);
    setRevealIndex(0);
    setPhase("reveal");
  };

  const changeAward = async (index: number) => {
    setAwardBusy(true);
    try {
      await setAwardIndex(roomId, index);
    } catch (e) {
      console.error(e);
      alert("넘기지 못했어요. 다시 시도해 주세요.");
    } finally {
      setAwardBusy(false);
    }
  };

  // 카드(액자) 하나를 원래 크기 그대로 이미지로 찍는다.
  const captureStrip = async (node: HTMLDivElement, pixelRatio: number) => {
    // 화면과 똑같이 찍히도록, 글꼴과 사진이 다 그려질 때까지 기다린다.
    await document.fonts.ready;
    await Promise.all(
      Array.from(node.querySelectorAll("img")).map((img) => img.decode().catch(() => {})),
    );
    // 화면에서는 카드를 줄여 보여주므로(transform), 줄이기 전 원래 크기로 찍는다.
    const options = {
      // cacheBust는 쓰지 않는다. 사진 주소(blob:) 뒤에 ?시각을 붙여 버려서 사진을 못 읽고 저장이 실패한다.
      width: node.offsetWidth,
      height: node.offsetHeight,
      pixelRatio,
      backgroundColor: getComputedStyle(node).backgroundColor, // 액자 색 그대로
    };
    // iOS Safari는 첫 번째에 사진·글꼴이 빠진 채 찍히는 일이 잦아서, 한 번 그려 본 뒤 다시 찍는다.
    await toBlob(node, options).catch(() => null);
    return toBlob(node, options);
  };

  // 미리보기에 보이는 레이아웃으로 저장한다. 두 줄(전체 미션을 반씩)이면 두 장 나란히로만 저장한다.
  const saveImage = async (style: SaveStyle) => {
    const strips = stripRefs.current.filter((n): n is HTMLDivElement => n !== null);
    if (strips.length === 0 || saving) return;
    setSaving(true);
    let blob: Blob | null;
    try {
      // 카드 폭(360)의 3배로 찍어, 배경 사진(폭 1080)에 크게 올려도 흐려 보이지 않게 한다.
      const ratio = Math.max(3, window.devicePixelRatio || 1);
      const cards: Blob[] = [];
      for (const node of strips) {
        const blob = await captureStrip(node, ratio);
        if (!blob) throw new Error("capture failed");
        cards.push(blob);
      }
      // 카드만이면 찍은 카드 그대로, 아니면 흐린 놀이터(노을) 배경 위에 한 장 가운데 또는 두 장 나란히 올린다.
      blob =
        style === "card" ? cards[0] : await composeOnBackdrop(cards, SCENE_IMAGE.sunset, style);
    } catch (e) {
      console.error(e);
      blob = null;
    }
    setSaving(false);
    if (!blob) {
      alert("이미지를 만들지 못했어요. 사진이 다 보인 뒤에 다시 시도해 주세요.");
      return;
    }

    // 공유 창 없이 바로 파일로 내려받는다. (휴대폰도 같다)
    // 아이폰 Safari는 '사진' 앱이 아니라 '파일' 앱의 다운로드 폴더에 저장된다.
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "pawpaw-result.png";
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shell = "mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center";

  if (auth.status === "error") {
    return <ErrorView message="로그인에 실패했어요." detail={auth.message} />;
  }
  if (error === "notOpen") {
    return (
      <ErrorView message="아직 결과 공개 전이거나 이 방의 멤버가 아니에요.">
        <button onClick={() => void load()} className="rounded-full bg-red-500 px-6 py-2 font-bold text-white">
          다시 확인
        </button>
      </ErrorView>
    );
  }
  if (error === "failed") {
    return (
      <ErrorView message="데이터를 불러오지 못했어요.">
        <button onClick={() => void load()} className="rounded-full bg-red-500 px-6 py-2 font-bold text-white">
          다시 시도
        </button>
      </ErrorView>
    );
  }
  if (!data) {
    return (
      <main className={shell}>
        <BlurBackdrop />
        <p className="text-gray-500">불러오는 중...</p>
      </main>
    );
  }

  // 사진을 제출한 친구만, 자기 자신은 제외하고 투표 후보로 보여준다
  const submittedIds = new Set(data.submissions.map((s) => s.playerId));

  // 미션 구경: 투표 전에 사진을 낸 친구(나 포함)를 한 명씩 보여준다. 방장이 넘기고 모두 따라간다.
  // 모두 결과 화면에 들어와야 방장이 첫 미션을 띄울 수 있다.
  // 방 정보를 못 읽으면(가짜 데이터로 테스트할 때 등) 구경 없이 바로 투표한다.
  const presenters = data.players.filter((p) => submittedIds.has(p.id));
  const roomInfo = room.status === "ready" ? room.data : null;
  const showcaseIndex = roomInfo?.showcaseIndex ?? -1; // -1: 아직 시작 전
  const changeShowcase = async (index: number) => {
    setShowcaseBusy(true);
    try {
      await setShowcaseIndex(roomId, index);
    } catch (e) {
      console.error(e);
      alert("다음으로 넘기지 못했어요. 다시 시도해 주세요.");
    } finally {
      setShowcaseBusy(false);
    }
  };
  if (room.status === "loading" || (roomInfo && members.status === "loading")) {
    return (
      <main className={shell}>
        <BlurBackdrop />
        <p className="text-gray-500">불러오는 중...</p>
      </main>
    );
  }
  if (roomInfo && phase.startsWith("vote") && showcaseIndex < 0) {
    const enteredIds = new Set(
      members.status === "ready"
        ? members.data.filter((m) => m.player.resultEntered === true).map((m) => m.player.id)
        : [],
    );
    return (
      <main className={`${shell} overflow-hidden`}>
        <BlurBackdrop />
        <ShowcaseLobby
          players={data.players}
          enteredIds={enteredIds}
          isHost={roomInfo.hostId === data.me}
          busy={showcaseBusy}
          onStart={() => changeShowcase(0)}
        />
      </main>
    );
  }
  if (roomInfo && phase.startsWith("vote") && showcaseIndex < presenters.length) {
    const presenter = presenters[showcaseIndex];
    const isHost = roomInfo.hostId === data.me;
    const next = () => changeShowcase(showcaseIndex + 1);
    // '다음으로 넘기자': 방장을 뺀 멤버 중 지금 순번에 표시한 사람 수. 과반(절반 초과)이면 방장이 넘길 수 있다.
    const others = (members.status === "ready" ? members.data : []).filter(
      (m) => m.player.id !== roomInfo.hostId,
    );
    const nextVotes = others.filter((m) => m.player.showcaseNext === showcaseIndex).length;
    const nextNeeded = others.length === 0 ? 0 : Math.floor(others.length / 2) + 1;
    const wantNext =
      others.find((m) => m.player.id === data.me)?.player.showcaseNext === showcaseIndex;
    const onWantNext = () => {
      markShowcaseNext(roomId, data.me, showcaseIndex).catch((e) => {
        console.error(e);
        alert("넘기자고 알리지 못했어요. 다시 시도해 주세요.");
      });
    };
    const booms = boomDowns.status === "ready" ? boomDowns.data : [];
    const boomCount = booms.filter((b) => b.targetId === presenter.id).length;
    const boomState =
      presenter.id === data.me
        ? "mine"
        : booms.some((b) => b.targetId === presenter.id && b.voterId === data.me)
          ? "done"
          : "ready";
    const onBoom = () => {
      boomDown(roomId, data.me, presenter.id).catch((e) => console.error(e));
    };
    const verdict = verdicts.get(presenter.id) ?? {
      state: "none" as const,
      counts: { boomBase: 0, voterCount: 0, booms: 0, accepts: 0, rejects: 0, allPresentVoted: true },
    };
    const myJudged =
      judgments.status === "ready" &&
      judgments.data.some((j) => j.targetId === presenter.id && j.voterId === data.me);
    const showJudge = verdict.state === "voting" && !myJudged; // 본인도 투표한다
    const onJudge = async (accept: boolean) => {
      setJudgeBusy(true);
      try {
        await judgeMission(roomId, data.me, presenter.id, accept);
      } catch (e) {
        console.error(e);
        alert("투표하지 못했어요. 다시 시도해 주세요.");
      } finally {
        setJudgeBusy(false);
      }
    };
    return (
      <main className={`${shell} overflow-hidden`}>
        <BlurBackdrop />
        <AnimatePresence mode="wait">
          <ShowcaseStage
            key={presenter.id}
            index={showcaseIndex}
            total={presenters.length}
            player={presenter}
            submission={data.submissions.find((s) => s.playerId === presenter.id)}
            isHost={isHost}
            busy={showcaseBusy}
            onNext={next}
            boomCount={boomCount}
            boomState={boomState}
            onBoom={onBoom}
            judgment={verdict.state}
            counts={verdict.counts}
            nextVotes={nextVotes}
            nextNeeded={nextNeeded}
            wantNext={wantNext}
            onWantNext={onWantNext}
          />
        </AnimatePresence>
        <AnimatePresence>
          {showJudge && (
            <JudgePopup
              key={`judge-${presenter.id}`}
              player={presenter}
              boomCount={boomCount}
              busy={judgeBusy}
              onJudge={onJudge}
            />
          )}
        </AnimatePresence>
      </main>
    );
  }

  // 투표 후보: 사진을 냈고 미션에 실패하지 않은 친구 (나는 빼고)
  const eligibleIds = new Set(
    data.players.filter((p) => submittedIds.has(p.id) && !failedIds.has(p.id)).map((p) => p.id),
  );
  const candidates = data.players.filter((p) => p.id !== data.me && eligibleIds.has(p.id));
  // 고를 친구가 없으면 투표를 건너뛰고 바로 결과 공개를 기다린다. (candidates.length === 0과 같다)
  const skipVote = noCandidates;
  const myPhase: Phase = waitingForVotes ? "waiting" : phase;
  // 상 받은 친구가 없으면(모두 실패 등) 결과 카드는 전체 미션으로 보여준다.
  const shownCardView = revealList.length === 0 ? "all" : cardView;

  // 결과 카드에 찍는 날짜: 결과가 열린 날. 없으면 마지막으로 사진을 낸 날. (예: 2026.11.15)
  const resultDateMs =
    (roomInfo?.resultAt ? new Date(roomInfo.resultAt).getTime() : NaN) ||
    Math.max(0, ...data.submissions.map((sub) => sub.submittedAt));
  const resultDate = resultDateMs
    ? (() => {
        const d = new Date(resultDateMs);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
      })()
    : "";

  // 결과 카드에 넣을 사진들: 수상작은 상 순서대로, 전체 미션은 사진을 낸 친구 모두(받은 상이 있으면 이름표로)
  const findSubmission = (playerId: string) => data.submissions.find((sub) => sub.playerId === playerId);
  const cardItems: StripItem[] =
    shownCardView === "awards"
      ? revealList.map((r) => ({
          key: r.title,
          player: r.winner,
          submission: findSubmission(r.winner.id),
          badge: r.short,
        }))
      : presenters.map((p) => {
          const awards = revealList.filter((r) => r.winner.id === p.id).map((r) => r.short);
          return {
            key: p.id,
            player: p,
            submission: findSubmission(p.id),
            badge: awards.length > 0 ? awards.join("·") : undefined,
          };
        });
  // 전체 미션이 많으면 앞쪽 반과 뒤쪽 반으로 나눠 두 줄로 놓는다.
  const half = Math.ceil(cardItems.length / 2);
  const strips =
    shownCardView === "all" && cardItems.length >= SPLIT_STRIP_FROM
      ? [cardItems.slice(0, half), cardItems.slice(half)]
      : [cardItems];
  const split = strips.length > 1;
  const shownLayout: SaveStyle = split ? "pair" : layout; // 두 줄이면 두 장 나란히로 고정

  const voters = getVoters(data, eligibleIds);
  const votedCount = voters.filter((p) => hasVoted(data, p.id, hardVote)).length;
  const allVoted = votedCount === voters.length;

  // 시상식은 다 같이 본다: 투표를 마친 뒤에는 방의 awardIndex를 따라간다. 방장만 넘긴다.
  // (방 정보를 못 읽으면 예전처럼 각자 넘긴다. '발표 다시 보기'도 각자)
  const synced = roomInfo !== null && !replaying;
  const amHost = roomInfo?.hostId === data.me;
  const awardIndex = roomInfo?.awardIndex;
  let viewPhase: Phase = myPhase;
  let viewIndex = revealIndex;
  if (synced && (myPhase === "waiting" || myPhase === "reveal" || myPhase === "share")) {
    if (awardIndex === undefined) viewPhase = "waiting";
    else if (awardIndex < revealList.length) {
      viewPhase = "reveal";
      viewIndex = awardIndex;
    } else viewPhase = "share";
  }
  const nextAward = () => {
    if (synced) {
      void changeAward(viewIndex + 1);
    } else if (viewIndex === revealList.length - 1) {
      setReplaying(false);
      setPhase("share");
    } else {
      setRevealIndex((i) => i + 1);
    }
  };
  const startReveal = () => {
    // 상 받은 친구가 없으면 시상식 없이 결과 카드로 간다. (함께 볼 때는 awardIndex 0이 곧 공유 단계)
    if (!synced) setPhase(revealList.length === 0 ? "share" : "reveal");
    else if (allVoted) void changeAward(0);
    else setConfirmReveal(true);
  };

  return (
    <main className={`${shell} overflow-hidden`}>
      <BlurBackdrop />
      <AnimatePresence mode="wait">
        {myPhase === "voteFunny" && (
          <VoteScreen
            key="voteFunny"
            category="funny"
            stepLabel={hardVote ? "투표 1 / 2" : "투표"}
            candidates={candidates}
            submissions={data.submissions}
            onVote={(id) => vote("funny", id, hardVote ? "voteHard" : "waiting")}
          />
        )}

        {myPhase === "voteHard" && (
          <VoteScreen
            key="voteHard"
            category="hard"
            stepLabel="투표 2 / 2"
            candidates={candidates}
            submissions={data.submissions}
            onVote={(id) => vote("hard", id, "waiting")}
          />
        )}

        {viewPhase === "waiting" && (
          <motion.section
            key="waiting"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="text-7xl">✉️</div>
            <h1 className="text-3xl font-bold">{skipVote ? "투표할 친구가 없어요" : "투표 완료!"}</h1>
            {skipVote && (
              <p className="text-sm text-gray-500">
                미션을 인정받은 친구가 없어서 투표를 건너뛰었어요.
              </p>
            )}
            <p className="text-gray-600">
              {allVoted
                ? voters.length === 0
                  ? "결과를 공개할 수 있어요"
                  : "모두 투표를 마쳤어요"
                : `친구들을 기다리는 중... (${votedCount} / ${voters.length}명)`}
            </p>
            {!synced || amHost ? (
              <button
                disabled={(!synced && !allVoted) || awardBusy}
                onClick={startReveal}
                className="rounded-full bg-red-500 px-8 py-3 text-lg font-bold text-white active:scale-95 disabled:bg-gray-300"
              >
                결과 공개
              </button>
            ) : (
              <p className="text-sm text-gray-500">방장이 결과를 공개하면 다 같이 봐요.</p>
            )}
          </motion.section>
        )}

        {viewPhase === "reveal" && revealList[viewIndex] && (
          <RevealStage
            key={`reveal-${viewIndex}`}
            title={revealList[viewIndex].title}
            winner={revealList[viewIndex].winner}
            detail={revealList[viewIndex].detail}
            isLast={viewIndex === revealList.length - 1}
            onNext={nextAward}
            canNext={!synced || amHost}
          />
        )}

        {viewPhase === "share" && (
          <motion.section
            key="share"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex w-full flex-col items-center gap-4"
          >
            {/* 보기 고르기: 상 받은 미션만 / 모든 친구의 미션. 상 받은 친구가 없으면 고를 것 없이 전체 미션만. */}
            {revealList.length > 0 && (
              <div role="tablist" aria-label="결과 카드 보기" className="flex rounded-full bg-surface/70 p-1 shadow-card">
                {(
                  [
                    ["awards", "수상작"],
                    ["all", "전체 미션"],
                  ] as const
                ).map(([view, label]) => (
                  <button
                    key={view}
                    role="tab"
                    aria-selected={shownCardView === view}
                    onClick={() => setCardView(view)}
                    className={`rounded-full px-4 py-1.5 text-sm font-bold active:scale-95 ${
                      shownCardView === view ? "bg-ink text-canvas" : "text-ink-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {/* 액자 색(검정 / 베이지)과 저장 레이아웃(카드만 / 한 장 / 두 장)을 한 줄에 */}
            <div className="flex items-center gap-4">
              <div role="radiogroup" aria-label="액자 색" className="flex items-center gap-3">
                {(["black", "beige"] as const).map((color) => (
                  <button
                    key={color}
                    role="radio"
                    aria-checked={frameColor === color}
                    aria-label={color === "black" ? "검은 액자" : "베이지 액자"}
                    onClick={() => setFrameColor(color)}
                    className={`size-8 rounded-full border-2 shadow-card active:scale-95 ${
                      color === "black" ? "bg-ink" : "bg-canvas"
                    } ${frameColor === color ? "border-primary ring-2 ring-primary/40" : "border-ink-subtle/40"}`}
                  />
                ))}
              </div>
              <span aria-hidden className="h-8 w-px bg-ink-subtle/30" />
              <LayoutPicker value={shownLayout} onChange={setLayout} onlyPair={split} />
            </div>
            {/* 저장될 모습 그대로 미리보기 */}
            <ResultPreview
              layout={shownLayout}
              strips={strips}
              frameColor={frameColor}
              date={resultDate}
              onCaptureNodes={setCaptureNodes}
            />
            {split && <p className="-mt-2 text-xs text-ink-muted">사람이 많아서 두 장으로 나눠 저장해요</p>}
            <button
              disabled={saving}
              onClick={() => void saveImage(shownLayout)}
              className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95 disabled:bg-gray-300"
            >
              {saving ? "이미지 만드는 중..." : "이미지 저장"}
            </button>
            <Link
              href={ROUTES.roomNew}
              className="rounded-full bg-surface px-8 py-3 font-bold text-ink shadow-card active:scale-95"
            >
              새 게임 시작
            </Link>
            <button onClick={replay} className="text-sm text-gray-500 underline">
              발표 다시 보기
            </button>
          </motion.section>
        )}
      </AnimatePresence>
      {confirmReveal && (
        <Popup title="그래도 공개할까요?" onClose={() => setConfirmReveal(false)}>
          <p className="text-sm text-ink-muted">
            아직 {voters.length - votedCount}명이 투표하지 않았어요. 공개하면 지금까지의 투표로 시상해요.
          </p>
          <ChoiceButtons
            cancelLabel="기다리기"
            confirmLabel="공개하기"
            onCancel={() => setConfirmReveal(false)}
            onConfirm={() => {
              setConfirmReveal(false);
              void changeAward(0);
            }}
            busy={awardBusy}
          />
        </Popup>
      )}
    </main>
  );
}