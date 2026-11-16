"use client";

import { useEffect, useRef, useState } from "react";
import { getAnimal } from "../lib/animals";
import type { MemberProfile } from "../lib/firebase/roomRepo";

// 배경 원본 그림의 가로/세로 (day.jpeg, sunset.jpeg 둘 다 같은 크기여야 한다)
// 파일 속성에서 실제 픽셀 크기를 확인해 바꾸세요.
const BG_W = 181;
const BG_H = 391;

// SceneBackground와 같은 박스에 올려서, 같은 방식(cover, 가운데)으로 그림 영역을 계산한다.
export default function Playground({ members }: { members: MemberProfile[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // cover: 박스를 꽉 채우는 배율, 넘치는 부분은 가운데 기준으로 잘린다.
  let area: { left: number; top: number; w: number; h: number } | null = null;
  if (box && box.w > 0 && box.h > 0) {
    const scale = Math.max(box.w / BG_W, box.h / BG_H);
    const w = BG_W * scale;
    const h = BG_H * scale;
    area = { left: (box.w - w) / 2, top: (box.h - h) / 2, w, h };
  }

  return (
    <div
      ref={boxRef}
      aria-hidden
      className="pointer-events-none fixed inset-y-0 left-1/2 -z-[5] w-full max-w-app -translate-x-1/2 overflow-hidden"
    >
      {area &&
        members.map(({ player, nickname }) => {
          const info = getAnimal(player.animal);
          if (!info) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={player.id}
              src={info.image}
              alt={nickname}
              title={nickname}
              draggable={false}
              className="absolute -translate-x-1/2 -translate-y-full object-contain [image-rendering:pixelated]"
              style={{
                left: area.left + (info.x / 100) * area.w,
                top: area.top + (info.y / 100) * area.h,
                width: (info.width / 100) * area.w,
              }}
            />
          );
        })}
    </div>
  );
}