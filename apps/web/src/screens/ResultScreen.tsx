"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toBlob } from "html-to-image";
import ErrorView from "../components/ErrorView";
import { BlurBackdrop } from "../components/ScreenShell";
import { useAuthState } from "../lib/firebase/auth";
import BottomButton from "../components/BottomButton";
import BottomSheet from "../components/BottomSheet";
import ChoiceButtons from "../components/ChoiceButtons";
import Popup from "../components/Popup";
import { PawIcon, ThumbDownIcon } from "../components/Icons";
import {
  useBoomDowns,
  useJudgments,
  useMembers,
  useRoom,
  useStoragePhoto,
} from "../lib/firebase/hooks";
import {
  boomDown,
  judgeMission,
  markResultEntered,
  setAwardIndex,
  setShowcaseIndex,
} from "../lib/firebase/roomRepo";
import { countFor, judgmentState, type JudgmentCounts, type JudgmentState } from "../lib/judgment";
import type { VoteCategory } from "@pawpaw/shared";
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

// 최다 득표자 (동점이면 먼저 제출한 사람)
function getVoteWinner(data: ResultData, category: VoteCategory) {
  const counts: Record<string, number> = {};
  Object.values(data.votes[category]).forEach((t) => {
    counts[t] = (counts[t] ?? 0) + 1;
  });
  const submittedAt = (id: string) =>
    data.submissions.find((s) => s.playerId === id)?.submittedAt ?? Infinity;
  const top = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || submittedAt(a[0]) - submittedAt(b[0])
  )[0];
  if (!top) return null;
  const player = data.players.find((p) => p.id === top[0]);
  return player ? { player, count: top[1] } : null;
}

// 모든 참가자가 두 투표를 모두 끝냈는지
function isAllVoted(data: ResultData) {
  return data.players.every((p) => data.votes.funny[p.id] && data.votes.hard[p.id]);
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
          <ul className="mt-4 flex flex-wrap justify-center gap-3 text-4xl">
            {players.map((p) => {
              const entered = enteredIds.has(p.id);
              return (
                <li
                  key={p.id}
                  title={p.nickname}
                  className={entered ? "" : "opacity-30 grayscale"}
                >
                  {p.emoji}
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
}: {
  index: number;
  total: number;
  player: ResultPlayer;
  submission: ResultSubmission | undefined;
  isHost: boolean;
  busy: boolean;
  onNext: () => void;
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
        <h2 className="text-2xl font-bold">
          {player.emoji} {player.nickname}
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
        {!isHost && <p className="text-sm text-gray-500">방장이 다음 친구로 넘겨요.</p>}
      </div>
      {isHost && (
        <BottomButton
          onClick={onNext}
          disabled={busy}
          blockedReason={judgment === "voting" ? "인정 투표가 아직 끝나지 않았어요." : null}
        >
          {isLast ? "투표 시작하기" : "다음 친구"}
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
        <p className="text-lg font-bold">
          {player.emoji} {player.nickname}
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
        <p className="text-sm font-bold">
          {player.emoji} {player.nickname}
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
            className="text-9xl"
          >
            {winner.emoji}
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

// 결과 카드를 화면에서만 비율 그대로 줄여 한 화면에 들어오게 한다.
// (저장하는 이미지는 카드 자체를 찍으므로 원래 크기 그대로다)
const CARD_SCREEN_RESERVE_PX = 210; // 카드 말고 화면에 함께 있는 것: 위아래 여백, 액자 색 버튼, 저장·다시 보기 버튼

function useFitToScreen(el: HTMLElement | null) {
  const [fit, setFit] = useState<{ height: number; scale: number } | null>(null);
  useEffect(() => {
    if (!el) return;
    const update = () => {
      const height = el.offsetHeight; // transform과 상관없는 원래 높이
      const available = window.innerHeight - CARD_SCREEN_RESERVE_PX;
      setFit({ height, scale: Math.min(1, Math.max(0.3, available / height)) });
    };
    update();
    const observer = new ResizeObserver(update); // 사진을 불러와 높이가 바뀌면 다시 잰다
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [el]);
  return fit;
}

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
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const setCardNode = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    setCardEl(node);
  }, []);
  const cardFit = useFitToScreen(cardEl);

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

  // 대기 화면에서는 3초마다 다시 불러와서 "전원 투표 완료"를 확인
  useEffect(() => {
    if (phase !== "waiting") return;
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
  }, [phase, fetchResult]);

  const revealList = useMemo(() => {
    if (!data) return [];
    const funny = getVoteWinner(data, "funny");
    const fastest = getFastestWinner(data, failedIds);
    const hard = getVoteWinner(data, "hard");
    // 발표 순서: 웃긴 → 빠른 → 어려운
    return [
      // short: 결과 카드에서 미션 앞에 붙이는 짧은 이름
      funny && { title: "가장 웃긴 미션", short: "웃긴", winner: funny.player, detail: `${funny.count}표를 받았어요` },
      fastest && { title: "가장 빠른 미션", short: "빠른", winner: fastest, detail: "가장 먼저 미션을 제출했어요" },
      hard && { title: "가장 어려운 미션", short: "어려운", winner: hard.player, detail: `${hard.count}표를 받았어요` },
    ].filter(
      (x): x is { title: string; short: string; winner: ResultPlayer; detail: string } => Boolean(x),
    );
  }, [data, failedIds]);

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

  const saveImage = async () => {
    if (!cardRef.current) return;
    const node = cardRef.current;
    let blob: Blob | null;
    try {
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
        pixelRatio: Math.max(2, window.devicePixelRatio || 1), // 화면만큼 또렷하게
        backgroundColor: getComputedStyle(node).backgroundColor, // 액자 색 그대로
      };
      // iOS Safari는 첫 번째에 사진·글꼴이 빠진 채 찍히는 일이 잦아서, 한 번 그려 본 뒤 다시 찍는다.
      await toBlob(node, options).catch(() => null);
      blob = await toBlob(node, options);
    } catch (e) {
      console.error(e);
      blob = null;
    }
    if (!blob) {
      alert("이미지를 만들지 못했어요. 사진이 다 보인 뒤에 다시 시도해 주세요.");
      return;
    }

    const file = new File([blob], "pawpaw-result.png", { type: "image/png" });
    // 휴대폰: 공유하기로 사진 앱에 저장할 수 있게 한다. (iOS Safari는 다운로드 링크로 저장이 잘 안 된다)
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // 사용자가 공유 창을 닫음
        console.error(e);
      }
    }
    // 그 밖(컴퓨터 등): 파일로 내려받는다.
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

  const candidates = data.players.filter(
    (p) => p.id !== data.me && submittedIds.has(p.id) && !failedIds.has(p.id),
  );
  if (candidates.length === 0 && phase.startsWith("vote")) {
    return (
      <main className={shell}>
        <BlurBackdrop />
        <p className="text-gray-600">투표할 친구가 아직 없어요.</p>
      </main>
    );
  }

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

  const allVoted = isAllVoted(data);
  const votedCount = data.players.filter((p) => data.votes.funny[p.id] && data.votes.hard[p.id]).length;

  // 시상식은 다 같이 본다: 투표를 마친 뒤에는 방의 awardIndex를 따라간다. 방장만 넘긴다.
  // (방 정보를 못 읽으면 예전처럼 각자 넘긴다. '발표 다시 보기'도 각자)
  const synced = roomInfo !== null && !replaying;
  const amHost = roomInfo?.hostId === data.me;
  const awardIndex = roomInfo?.awardIndex;
  let viewPhase: Phase = phase;
  let viewIndex = revealIndex;
  if (synced && (phase === "waiting" || phase === "reveal" || phase === "share")) {
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
    if (!synced) setPhase("reveal");
    else if (allVoted) void changeAward(0);
    else setConfirmReveal(true);
  };

  return (
    <main className={`${shell} overflow-hidden`}>
      <BlurBackdrop />
      <AnimatePresence mode="wait">
        {phase === "voteFunny" && (
          <VoteScreen
            key="voteFunny"
            category="funny"
            stepLabel="투표 1 / 2"
            candidates={candidates}
            submissions={data.submissions}
            onVote={(id) => vote("funny", id, "voteHard")}
          />
        )}

        {phase === "voteHard" && (
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
            <h1 className="text-3xl font-bold">투표 완료!</h1>
            <p className="text-gray-600">
              {allVoted
                ? "모두 투표를 마쳤어요"
                : `친구들을 기다리는 중... (${votedCount} / ${data.players.length}명)`}
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
            {/* 액자 색 고르기: 검정 / 베이지(앱 바탕색) */}
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
            {/* 결과 카드: 인생네컷처럼 액자(검정 또는 베이지)에 사진 칸을 세로로 쌓는다.
                맨 위 가운데에 로고, 사진 오른쪽 아래에 캐릭터, 사진 아래에 상 이름·미션과 닉네임, 맨 아래에 날짜.
                사진은 자르지 않는다: 폭을 꽉 채우고 높이는 사진 비율대로. 이미지로 저장하면 액자째 찍힌다. */}
            {/* 화면에서만 줄인다: 바깥 칸은 줄어든 높이만큼 자리를 잡고, 안쪽 카드는 위 가운데를 기준으로 축소 */}
            <div
              className="w-full"
              style={cardFit ? { height: cardFit.height * cardFit.scale } : undefined}
            >
              <div
                style={
                  cardFit && cardFit.scale < 1
                    ? { transform: `scale(${cardFit.scale})`, transformOrigin: "top center" }
                    : undefined
                }
              >
                <div
                  ref={setCardNode}
                  className={`flex w-full flex-col gap-6 p-3 pb-4 ${
                    frameColor === "black" ? "bg-ink text-canvas" : "bg-canvas text-ink shadow"
                  }`}
                >
                  {/* 로고: 액자 맨 위 가운데 */}
                  <p className="flex items-center justify-center gap-1.5 pt-1 text-lg font-bold">
                    <PawIcon className="size-5" />
                    PawPaw
                  </p>
                  {revealList.map((r) => (
                    <div key={r.title} className="w-full">
                      <div className="relative w-full overflow-hidden">
                        <MissionPhoto
                          player={r.winner}
                          submission={data.submissions.find((sub) => sub.playerId === r.winner.id)}
                          fit="frame"
                        />
                        {/* 사진 오른쪽 아래에 캐릭터를 시그니처처럼 */}
                        <p className="absolute bottom-2 right-2 text-3xl drop-shadow" aria-hidden="true">
                          {r.winner.emoji}
                        </p>
                      </div>
                      {/* 사진 아래: 왼쪽에 상 이름(웃긴·빠른·어려운)과 미션, 오른쪽에 닉네임 */}
                      <div className="flex items-center justify-between gap-2 pt-1.5 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5 text-left">
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${
                              frameColor === "black" ? "bg-canvas text-ink" : "bg-ink text-canvas"
                            }`}
                          >
                            {r.short}
                          </span>
                          <span className="min-w-0 truncate opacity-80">{r.winner.mission ?? ""}</span>
                        </span>
                        <span className="shrink-0 text-right font-bold">{r.winner.nickname}</span>
                      </div>
                    </div>
                  ))}
                  <p className="px-1 pt-1 text-right text-sm tracking-widest">{resultDate}</p>
                </div>
              </div>
            </div>
            <button
              onClick={saveImage}
              className="rounded-full bg-red-500 px-8 py-3 font-bold text-white active:scale-95"
            >
              이미지 저장
            </button>
            <button onClick={replay} className="text-sm text-gray-500 underline">
              발표 다시 보기
            </button>
          </motion.section>
        )}
      </AnimatePresence>
      {confirmReveal && (
        <Popup title="그래도 공개할까요?" onClose={() => setConfirmReveal(false)}>
          <p className="text-sm text-ink-muted">
            아직 {data.players.length - votedCount}명이 투표하지 않았어요. 공개하면 지금까지의 투표로 시상해요.
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