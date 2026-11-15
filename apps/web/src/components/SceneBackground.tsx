// 화면 뒤에 깔리는 배경 그림 (모바일 앱 폭에 맞춰 고정, 가운데 정렬)
// - 기본은 root layout의 day. 특정 구간은 그 구간의 layout에서 다른 장면을 한 번 더 깔면
//   DOM 순서상 뒤에 그려진 것이 위로 올라와 덮는다.
export type Scene = "day" | "sunset";

export const SCENE_IMAGE: Record<Scene, string> = {
  day: "/backgrounds/day.jpeg",
  sunset: "/backgrounds/sunset.jpeg",
};

export default function SceneBackground({ scene }: { scene: Scene }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-y-0 left-1/2 -z-10 w-full max-w-app -translate-x-1/2 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${SCENE_IMAGE[scene]})` }}
    />
  );
}
