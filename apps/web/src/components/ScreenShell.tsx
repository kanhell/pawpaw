import type { ReactNode } from "react";

// 모바일 앱 폭의 가운데 정렬 화면 틀
export default function ScreenShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-app flex-col items-center justify-center gap-6 bg-canvas p-6 text-center">
      {children}
    </main>
  );
}
