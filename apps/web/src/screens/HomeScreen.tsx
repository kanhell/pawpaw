"use client";

import { useState } from "react";
import Link from "next/link";
import { ROUTES } from "@pawpaw/shared";
import ScreenShell from "../components/ScreenShell";

// 메인: 방만들기 / 방찾기. (방찾기는 아직 준비 중)
export default function HomeScreen() {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <ScreenShell>
      <div className="text-7xl">🐾</div>
      <h1 className="text-4xl font-bold">포포</h1>
      <p className="text-ink-muted">친구와 미션을 주고받는 놀이터</p>

      <div className="flex w-full flex-col gap-3">
        <Link
          href={ROUTES.roomNew}
          className="w-full rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-float active:scale-95"
        >
          방 만들기
        </Link>
        <button
          onClick={() => setNotice("방찾기는 아직 준비 중이에요 🛠️")}
          className="w-full rounded-full bg-surface px-8 py-3 text-lg font-bold text-ink shadow-card active:scale-95"
        >
          방 찾기
        </button>
      </div>

      <p role="status" className="min-h-6 text-sm text-ink-muted">
        {notice}
      </p>
    </ScreenShell>
  );
}
