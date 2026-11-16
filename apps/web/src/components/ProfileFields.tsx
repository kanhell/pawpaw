"use client";

import { ANIMAL_LIST } from "../lib/animals";
import AnimalImage from "./AnimalImage";
interface ProfileFieldsProps {
  nickname: string;
  animal: string;
  onNicknameChange: (nickname: string) => void;
  onAnimalChange: (animal: string) => void;
  takenAnimals?: ReadonlySet<string>; // 방에서 이미 누가 고른 동물. 고를 수 없다.
}

// 닉네임과 동물 캐릭터를 고르는 입력 (방 만들기, 초대 참가에서 함께 쓴다)
export default function ProfileFields({
  nickname,
  animal,
  onNicknameChange,
  onAnimalChange,
  takenAnimals,
}: ProfileFieldsProps) {
  return (
    <>
      <input
        value={nickname}
        onChange={(event) => onNicknameChange(event.target.value)}
        maxLength={12}
        placeholder="닉네임"
        className="w-full rounded-card bg-surface px-4 py-3 text-center shadow-card outline-none"
      />
      <ul className="grid w-full grid-cols-4 justify-items-center gap-3 px-2">
        {ANIMAL_LIST.map(({ id, name }, index) => {
          const taken = takenAnimals?.has(id) === true;
          // 마지막 줄 2개(9, 10번째)를 가운데로: 2번째·3번째 칸에 놓는다.
          const lastRowStart = index === ANIMAL_LIST.length - 2 ? "col-start-2" : "";
          return (
            <li key={id} className={lastRowStart}>
              <button
                onClick={() => onAnimalChange(id)}
                disabled={taken}
                className={`grid size-[72px] place-items-center overflow-hidden rounded-full shadow-card disabled:opacity-30 disabled:grayscale ${
                  id === animal ? "bg-primary ring-4 ring-primary" : "bg-surface"
                }`}
                aria-label={taken ? `${name} (이미 친구가 골랐어요)` : name}
                aria-pressed={id === animal}
              >
                <AnimalImage animal={id} className="size-full" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
