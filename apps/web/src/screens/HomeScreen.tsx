"use client";

import Link from "next/link";
import { ROUTES } from "@pawpaw/shared";
import { PawIcon } from "../components/Icons";
import ScreenShell from "../components/ScreenShell";
import { ToastStack, useToasts } from "../components/Toast";

// 메인: 방만들기 / 방찾기. (방찾기는 아직 준비 중)
export default function HomeScreen() {
  const { toasts, show } = useToasts();

  return (
    <ScreenShell>
      <PawIcon className="size-20 text-ink" />
      <h1 className="text-4xl font-bold">PawPaw</h1>
      <p className="text-ink-muted">우리 학교 끝나고 놀이터에서 만나</p>

      <div className="flex w-full flex-col gap-3">
        <Link
          href={ROUTES.roomNew}
          className="w-full rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-float active:scale-95"
        >
          방 만들기
        </Link>
        <button
          onClick={() => show("방찾기는 아직 준비 중이에요.")}
          className="w-full rounded-full bg-surface px-8 py-3 text-lg font-bold text-ink shadow-card active:scale-95"
        >
          방 찾기
        </button>
      </div>

      <ToastStack toasts={toasts} />
    </ScreenShell>
  );
}
