"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { ToastStack, useToasts } from "./Toast";

// 화면 맨 아래에 놓는 큰 버튼. 게임 단계를 넘기는 버튼(게임 시작, 설정 완료, 미션 공개 등)에 쓴다.
// 화면 하단과 팝업 하단(Popup의 action)에서 같은 모양과 위치로 보인다.
export const BOTTOM_BUTTON_CLASS =
  "w-full rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground shadow-float active:scale-95 disabled:opacity-50 aria-disabled:opacity-50";

interface BottomButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // 아직 누를 수 없는 이유. 있으면 버튼은 흐리게 보이고, 누르면 이 문구를 잠깐 띄운다.
  // (disabled는 저장 중처럼 잠깐 막을 때만 쓴다. disabled 버튼은 눌러도 아무 일이 없다.)
  blockedReason?: string | null;
}

export default function BottomButton({
  className,
  blockedReason,
  onClick,
  ...props
}: BottomButtonProps) {
  const { toasts, show } = useToasts();
  const blocked = Boolean(blockedReason);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (blockedReason) {
      show(blockedReason);
      return;
    }
    onClick?.(event);
  }

  return (
    <>
      <button
        {...props}
        onClick={handleClick}
        aria-disabled={blocked || undefined}
        className={`${BOTTOM_BUTTON_CLASS} ${blocked ? "active:scale-100" : ""} ${className ?? ""}`}
      />
      <ToastStack toasts={toasts} />
    </>
  );
}
