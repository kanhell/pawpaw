"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import ProfileFields from "../components/ProfileFields";
import ScreenShell from "../components/ScreenShell";
import { ANIMALS } from "../lib/animals";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import { createRoom } from "../lib/firebase/roomRepo";

// 임시 방 만들기 화면: 닉네임과 동물을 골라 방을 만들고 대기실로 이동한다.
// 방설정은 아직 없다.
export default function RoomCreateScreen() {
  const router = useRouter();
  const auth = useAuthState();
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
    const name = nickname.trim();
    if (!name) {
      setError("닉네임을 입력해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const roomId = await createRoom(uid, { nickname: name, animal });
      router.push(ROUTES.lobby(roomId));
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <div className="text-6xl">🐾</div>
      <h1 className="text-2xl font-bold">방 만들기</h1>

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
    </ScreenShell>
  );
}
