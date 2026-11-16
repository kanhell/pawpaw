export interface AnimalInfo {
  id: string;
  name: string;
  image: string; // 놀이터에 서는 그림 (/characters)
  icon: string; // 선택 버튼에 쓰는 얼굴 그림 (/avatars/profile, 원본에서 얼굴만 잘라 줄인 것)
  x: number;
  y: number;
  width: number;
}

export const ANIMAL_LIST: AnimalInfo[] = [
  { id: "squirrel", name: "다람쥐", image: "/characters/squirrel.png", icon: "/avatars/profile/squirrel.webp", x: 55, y: 41, width: 16 },
  { id: "duck", name: "오리", image: "/characters/duck.png", icon: "/avatars/profile/duck.webp", x: 39, y: 76, width: 19 },
  { id: "fox", name: "여우", image: "/characters/fox.png", icon: "/avatars/profile/fox.webp", x: 33, y: 60, width: 18 },
  { id: "cat", name: "고양이", image: "/characters/cat.png", icon: "/avatars/profile/cat.webp", x: 82, y: 42.5, width: 18 },
  { id: "dog", name: "강아지", image: "/characters/dog.png", icon: "/avatars/profile/dog.webp", x: 15, y: 67, width: 19 },
  { id: "penguin", name: "펭귄", image: "/characters/penguin.png", icon: "/avatars/profile/penguin.webp", x: 34, y: 88, width: 18 },
  { id: "deer", name: "사슴", image: "/characters/deer.png", icon: "/avatars/profile/deer.webp", x: 89, y: 75, width: 21 },
  { id: "tiger", name: "호랑이", image: "/characters/tiger.png", icon: "/avatars/profile/tiger.webp", x: 21, y: 50, width: 18 },
  { id: "panda", name: "판다", image: "/characters/panda.png", icon: "/avatars/profile/panda.webp", x: 76, y: 49.5, width: 19 },
  { id: "pig", name: "돼지", image: "/characters/pig.png", icon: "/avatars/profile/pig.webp", x: 56, y: 66, width: 21 },
];

export const ANIMALS: string[] = ANIMAL_LIST.map((a) => a.id);

export function getAnimal(id: string): AnimalInfo | undefined {
  return ANIMAL_LIST.find((a) => a.id === id);
}