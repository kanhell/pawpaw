"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";

interface PopupProps {
  title: string;
  // 없으면 닫을 수 없는 팝업이다. (게임 설정, 미션 설정처럼 단계가 끝나야 사라지는 것)
  onClose?: () => void;
  // 게임 단계를 넘기는 버튼. 카드 안이 아니라 화면 맨 아래(방 화면의 '게임 시작' 자리)에 놓는다.
  action?: ReactNode;
  children: ReactNode;
}

// 지금 떠 있는 팝업들. 팝업 위에 팝업이 뜨면 Esc는 맨 위 팝업만 닫는다.
const openStack: symbol[] = [];

// 선명한 배경(방 화면) 위에 뜨는 팝업 카드
export default function Popup({ title, onClose, action, children }: PopupProps) {
  const idRef = useRef<symbol | null>(null);

  useEffect(() => {
    const id = Symbol("popup");
    idRef.current = id;
    openStack.push(id);
    return () => {
      openStack.splice(openStack.indexOf(id), 1);
    };
  }, []);

  useEffect(() => {
    if (!onClose) return;
    const handleKey = (event: KeyboardEvent) => {
      const isTop = openStack[openStack.length - 1] === idRef.current;
      if (event.key === "Escape" && isTop) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center bg-ink/20 p-4"
    >
      <div className="flex min-h-0 w-full max-w-app flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative flex max-h-full w-full max-w-[26rem] flex-col overflow-hidden rounded-sheet bg-canvas text-center shadow-float"
          >
            {/* 내용이 길면 안쪽만 스크롤하고, 닫기 버튼은 카드 오른쪽 위에 고정한다. */}
            <div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto p-5">
              <h2 className="px-8 text-xl font-bold">{title}</h2>
              {children}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="닫기"
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-canvas/90 text-ink-subtle active:scale-95"
              >
                ✕
              </button>
            )}
          </motion.section>
        </div>
        {action && (
          <div
            onClick={(event) => event.stopPropagation()}
            className="flex w-full flex-col items-center gap-2"
          >
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
