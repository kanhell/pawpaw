import type { Metadata } from "next";
import InviteScreen from "../../../../src/screens/InviteScreen";

// 채팅에 공유될 때 보이는 링크 미리보기 정보. 방 정보는 담지 않는다.
export const metadata: Metadata = {
  title: "포포에 초대받았어요",
  description: "친구가 포포 방에 초대했어요. 링크를 열어 참가해 보세요.",
  referrer: "no-referrer", // 링크의 초대 코드가 다른 사이트로 새지 않게 한다
  robots: { index: false, follow: false },
};

export default function Page() {
  return <InviteScreen />;
}
