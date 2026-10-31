"use client";

import { ANIMALS } from "../lib/animals";

interface ProfileFieldsProps {
  nickname: string;
  animal: string;
  onNicknameChange: (nickname: string) => void;
  onAnimalChange: (animal: string) => void;
}

// 닉네임과 동물 캐릭터를 고르는 입력 (방 만들기, 초대 참가에서 함께 쓴다)
export default function ProfileFields({
  nickname,
  animal,
  onNicknameChange,
  onAnimalChange,
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
      <ul className="flex flex-wrap justify-center gap-2">
        {ANIMALS.map((item) => (
          <li key={item}>
            <button
              onClick={() => onAnimalChange(item)}
              className={`h-14 w-14 rounded-full text-3xl shadow-card ${
                item === animal ? "bg-primary" : "bg-surface"
              }`}
              aria-label={`동물 ${item}`}
              aria-pressed={item === animal}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
