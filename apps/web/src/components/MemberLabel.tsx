import type { ReactNode } from "react";
import AnimalImage from "./AnimalImage";

// 멤버 한 명을 얼굴(동물 profile 그림) + 닉네임으로 보여준다.
// - row: 얼굴 옆에 닉네임. children을 넘기면 닉네임 아래에 작은 줄로 붙는다. (멤버 목록, 제출 현황 등)
// - column: 얼굴 아래에 작은 닉네임. 얼굴을 여러 개 늘어놓을 때 쓴다. (미션 구경 대기 등)
// 긴 닉네임(최대 12자)은 말줄임으로 자른다.
export default function MemberLabel({
  animal,
  nickname,
  isHost = false,
  layout = "row",
  faceClassName = "size-10 bg-canvas",
  className = "",
  children,
}: {
  animal: string;
  nickname: string;
  isHost?: boolean;
  layout?: "row" | "column";
  faceClassName?: string; // 얼굴 크기·배경. 놓이는 카드 색과 겹치지 않게 바꿔 쓴다.
  className?: string;
  children?: ReactNode;
}) {
  const name = `${nickname}${isHost ? " 👑" : ""}`;

  if (layout === "column") {
    return (
      <span className={`flex w-16 flex-col items-center gap-1 ${className}`}>
        <AnimalImage animal={animal} className={`shrink-0 ${faceClassName}`} />
        <span className="w-full truncate text-center text-xs">{name}</span>
      </span>
    );
  }

  return (
    <span className={`flex min-w-0 items-center gap-3 ${className}`}>
      <AnimalImage animal={animal} className={`shrink-0 ${faceClassName}`} />
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate font-bold">{name}</span>
        {children}
      </span>
    </span>
  );
}
