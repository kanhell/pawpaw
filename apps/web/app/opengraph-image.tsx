import { OG_ALT, OG_SIZE, renderBrandImage } from "../src/lib/og/brandImage";

// 사이트 주소를 채팅에 보냈을 때 보이는 기본 썸네일 (초대 링크와 같은 그림)
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return renderBrandImage();
}
