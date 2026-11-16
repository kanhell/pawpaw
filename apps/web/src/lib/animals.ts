export interface AnimalInfo {
  id: string;
  name: string;
  image: string; // 놀이터에 서는 그림 (/characters)
  icon: string; // 선택 버튼·목록에 쓰는 서 있는 그림 (/avatars)
  x: number;
  y: number;
  width: number;
  iconScale: number; // 확대 배율 (1 = 전체, 2 = 2배)
  iconY: number; // 보일 세로 위치 (0 = 그림 맨 위, 100 = 맨 아래, %)
    iconX: number; // 확대 중심의 가로 위치 (0 = 왼쪽 끝, 50 = 가운데, 100 = 오른쪽 끝, %)
}

export const ANIMAL_LIST: AnimalInfo[] = [
  { id: "squirrel", name: "다람쥐", image: "/characters/squirrel.png", icon: "/avatars/squirrel.png", x: 55, y: 41, width: 16, iconScale: 1.6, iconY: 10, iconX: 44 },
  { id: "duck", name: "오리", image: "/characters/duck.png", icon: "/avatars/duck.png", x: 39, y: 76, width: 19, iconScale: 1.6, iconY: 10, iconX: 44 },
  { id: "fox", name: "여우", image: "/characters/fox.png", icon: "/avatars/fox.png", x: 33, y: 60, width: 18, iconScale: 1.6, iconY: 10, iconX: 44 },
  { id: "cat", name: "고양이", image: "/characters/cat.png", icon: "/avatars/cat.png", x: 82, y: 42.5, width: 18, iconScale: 1.6, iconY: 4, iconX: 44 },
  { id: "dog", name: "강아지", image: "/characters/dog.png", icon: "/avatars/dog.png", x: 15, y: 67, width: 19, iconScale: 1.6, iconY: 5, iconX: 44 },
  { id: "penguin", name: "펭귄", image: "/characters/penguin.png", icon: "/avatars/penguin.png", x: 34, y: 88, width: 18, iconScale: 1.6, iconY: 10, iconX: 44 },
  { id: "deer", name: "사슴", image: "/characters/deer.png", icon: "/avatars/deer.png", x: 89, y: 75, width: 21, iconScale: 1.5, iconY: 5, iconX: 44 },
  { id: "tiger", name: "호랑이", image: "/characters/tiger.png", icon: "/avatars/tiger.png", x: 21, y: 50, width: 18, iconScale: 1.6, iconY: 5, iconX: 44 },
  { id: "panda", name: "판다", image: "/characters/panda.png", icon: "/avatars/panda.png", x: 76, y: 49.5, width: 19, iconScale: 1.6, iconY: 5, iconX: 44 },
  { id: "pig", name: "돼지", image: "/characters/pig.png", icon: "/avatars/pig.png", x: 56, y: 66, width: 21, iconScale: 1.6, iconY: 7, iconX: 44 },
];

export const ANIMALS: string[] = ANIMAL_LIST.map((a) => a.id);

export function getAnimal(id: string): AnimalInfo | undefined {
  return ANIMAL_LIST.find((a) => a.id === id);
}