"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES, type GameMode } from "@pawpaw/shared";
import ModeBadge from "../components/ModeBadge";
import ModePicker from "../components/ModePicker";
import ProfileFields from "../components/ProfileFields";
import ScreenShell from "../components/ScreenShell";
import { ANIMALS } from "../lib/animals";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import { createRoom } from "../lib/firebase/roomRepo";

type Step = "mode" | "profile";

// 방 만들기: 모드를 고르고(초대 전에 확정, 이후 변경 불가), 닉네임과 동물을 골라 방을 만든 뒤 대기실로 이동한다.
export default function RoomCreateScreen() {
  const router = useRouter();
  const auth = useAuthState();
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<GameMode | null>(null);
  const [nickname, setNickname] = useState("");
  const [animal, setAnimal] = useState(ANIMALS[0]);
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
  if (auth.status === "loading") {
    return (
      <ScreenShell>
        <p className="text-ink-muted">불러오는 중…</p>
      </ScreenShell>
    );
  }

  const uid = auth.uid;

  async function handleCreate() {
    if (!mode) return;
    const name = nickname.trim();
    if (!name) {
      setError("닉네임을 입력해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const roomId = await createRoom(uid, { nickname: name, animal }, mode);
      router.push(ROUTES.lobby(roomId));
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  // ----- 1단계: 모드 선택 -----
  if (step === "mode" || mode === null) {
    return (
      <ScreenShell>
        <div className="text-6xl">🐾</div>
        <h1 className="text-2xl font-bold">어떤 모드로 할까요?</h1>
        <p className="text-sm text-ink-muted">모드는 방을 만든 뒤에는 바꿀 수 없어요.</p>

        <ModePicker value={mode} onChange={setMode} />

        <button
          onClick={() => setStep("profile")}
          disabled={mode === null}
          className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
        >
          다음
        </button>
      </ScreenShell>
    );
  }

  // ----- 2단계: 닉네임·동물 선택 -----
  return (
    <ScreenShell>
      <div className="text-6xl">🐾</div>
      <h1 className="text-2xl font-bold">방 만들기</h1>
      <ModeBadge mode={mode} />

      <ProfileFields
        nickname={nickname}
        animal={animal}
        onNicknameChange={setNickname}
        onAnimalChange={setAnimal}
      />

      {error && <p className="text-sm text-primary">{error}</p>}

      <button
        onClick={handleCreate}
        disabled={busy}
        className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
      >
        {busy ? "만드는 중…" : "방 만들기"}
      </button>
      <button
        onClick={() => setStep("mode")}
        disabled={busy}
        className="text-sm text-ink-subtle underline"
      >
        모드 다시 고르기
      </button>
    </ScreenShell>
  );
}
