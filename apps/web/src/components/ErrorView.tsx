import type { ReactNode } from "react";
import Link from "next/link";
import { ROUTES } from "@pawpaw/shared";
import ScreenShell from "./ScreenShell";

interface ErrorViewProps {
  icon?: string;
  title?: string;
  message: string;
  detail?: string;
  children?: ReactNode; // 다시 시도 같은 추가 버튼
}

// 오류 화면. 맨 아래에 항상 메인으로 가는 링크를 둔다.
export default function ErrorView({
  icon = "🚪",
  title,
  message,
  detail,
  children,
}: ErrorViewProps) {
  return (
    <ScreenShell>
      <div className="text-6xl">{icon}</div>
      {title && <h1 className="text-2xl font-bold">{title}</h1>}
      <p className="text-ink-muted">{message}</p>
      {detail && <p className="text-sm text-ink-subtle">{detail}</p>}
      {children}
      <Link href={ROUTES.home} className="text-sm text-ink-subtle underline">
        메인으로 가기
      </Link>
    </ScreenShell>
  );
}
