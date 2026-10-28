"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@pawpaw/shared";
import ScreenShell from "../components/ScreenShell";
import { useAuthState } from "../lib/firebase/auth";
import { describeError } from "../lib/firebase/errors";
import { createRoom } from "../lib/firebase/roomRepo";

const ANIMALS = ["🐻", "🐰", "🐨", "🦊", "🐶", "🐱", "🐼", "🐸"];

// 임시 방 만들기 화면: 닉네임과 동물을 골라 방을 만들고 미션 받기로 이동한다.
// 방설정, 친구 초대, 대기실은 아직 없다.
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
      router.push(ROUTES.assign(roomId));
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  }

  return (
    <ScreenShell>
      <div className="text-6xl">🐾</div>
      <h1 className="text-2xl font-bold">방 만들기</h1>

      <input
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        maxLength={12}
        placeholder="닉네임"
        className="w-full rounded-card bg-surface px-4 py-3 text-center shadow-card outline-none"
      />

      <ul className="flex flex-wrap justify-center gap-2">
        {ANIMALS.map((item) => (
          <li key={item}>
            <button
              onClick={() => setAnimal(item)}
              className={`h-14 w-14 rounded-full text-3xl shadow-card ${
                item === animal ? "bg-primary" : "bg-surface"
              }`}
              aria-label={`동물 ${item}`}
              aria-pressed={item === animal}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>

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
