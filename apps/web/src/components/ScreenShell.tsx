import type { ReactNode } from "react";

// 배경 그림을 흐리게 덮는 층 (앱 폭에 맞춰 고정). 배경 그림(SceneBackground)보다 위, 내용보다 아래에 놓인다.
export function BlurBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-y-0 left-1/2 -z-5 w-full max-w-app -translate-x-1/2 bg-surface/30 backdrop-blur-md"
    />
  );
}

// 모바일 앱 폭의 가운데 정렬 화면 틀. 배경을 흐리게 깔고 그 위에 화면 내용을 올린다.
// (방 화면처럼 배경을 선명하게 두고 팝업을 띄우는 화면은 이 틀을 쓰지 않는다)
export default function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col items-center justify-center gap-6 p-6 text-center">
      <BlurBackdrop />
      {children}
    </main>
  );
}
