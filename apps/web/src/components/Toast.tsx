"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ToastItem {
  id: number;
  text: string;
  tag?: string; // 같은 tag의 메시지를 hide(tag)로 먼저 내릴 수 있다
}

const TOAST_MS = 2500;

// 잠깐 떴다가 사라지는 안내 메시지. show(문구, 보여줄 시간, tag)로 띄우고, hide(tag)로 먼저 내린다.
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const show = useCallback((text: string, ms: number = TOAST_MS, tag?: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, text, tag }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((list) => list.filter((toast) => toast.id !== id));
    }, ms);
    timers.current.add(timer);
  }, []);

  const hide = useCallback((tag: string) => {
    setToasts((list) => list.filter((toast) => toast.tag !== tag));
  }, []);

  return { toasts, show, hide };
}

// 화면 아래쪽 가운데, 하단 버튼 바로 위에 쌓아서 보여준다. 팝업보다 위에 뜬다.
export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.p
            key={toast.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-full bg-ink/85 px-4 py-2 text-sm font-bold text-canvas shadow-float"
          >
            {toast.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}
