"use client";

import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";

interface PopupProps {
  title: string;
  // 없으면 닫을 수 없는 팝업이다. (게임 설정, 미션 설정처럼 단계가 끝나야 사라지는 것)
  onClose?: () => void;
  children: ReactNode;
}

// 선명한 배경(방 화면) 위에 뜨는 팝업 카드
export default function Popup({ title, onClose, children }: PopupProps) {
  useEffect(() => {
    if (!onClose) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4"
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative flex max-h-[85dvh] w-full max-w-[26rem] flex-col items-center gap-4 overflow-y-auto rounded-sheet bg-canvas p-5 text-center shadow-float"
      >
        <h2 className="px-8 text-xl font-bold">{title}</h2>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle active:scale-95"
          >
            ✕
          </button>
        )}
        {children}
      </motion.section>
    </div>
  );
}
