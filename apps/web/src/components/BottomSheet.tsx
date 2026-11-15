"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

const DRAG_CLOSE_PX = 50; // 이만큼 끌면 내리거나 올린다

// 화면 아래에서 올라오는 시트. 뒤 화면을 가리지 않아서 보면서 고를 수 있다.
// 손잡이를 누르거나 아래로 끌면 제목 줄만 남기고 내려가고, 다시 누르거나 위로 끌면 올라온다.
export default function BottomSheet({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  function handleDragEnd(_event: unknown, info: PanInfo) {
    if (info.offset.y > DRAG_CLOSE_PX) setOpen(false);
    else if (info.offset.y < -DRAG_CLOSE_PX) setOpen(true);
  }

  return (
    <motion.section
      role="dialog"
      aria-label={title}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.3}
      onDragEnd={handleDragEnd}
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-app touch-none rounded-t-sheet bg-canvas px-5 pb-6 text-center shadow-float"
    >
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? `${title} 내리기` : `${title} 올리기`}
        className="flex w-full flex-col items-center gap-2 pt-3"
      >
        <span className="h-1.5 w-10 rounded-full bg-ink-subtle/50" />
        <span className="text-lg font-bold">{title}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-center gap-4 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
