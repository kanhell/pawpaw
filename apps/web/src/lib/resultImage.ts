/**
 * 결과 카드 이미지를 흐린 배경 위에 올려 9:16 세로 사진으로 만든다. (스토리에 바로 올리기 좋은 비율)
 * - "center": 카드 한 장을 가운데에
 * - "pair": 같은 카드 두 장을 좌우로 나란히
 */
export type BackdropLayout = "center" | "pair";

// 저장하는 사진의 크기. 화면 미리보기도 이 크기의 무대를 줄여서 똑같이 그린다.
export const STAGE_WIDTH = 1080;
export const STAGE_HEIGHT = 1920;
const WIDTH = STAGE_WIDTH;
const HEIGHT = STAGE_HEIGHT;

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * 무대(1080×1920) 위에 카드를 놓을 자리. 저장(캔버스)과 화면 미리보기가 같이 쓴다.
 * - "center": 첫 카드를 가운데에
 * - "pair": 두 카드를 나란히. 한 장만 주면 같은 카드를 두 번 놓는다.
 *   두 장의 높이가 다를 수 있으니(반씩 나눴는데 사람 수가 홀수) 큰 쪽에 맞춰 같은 배율로 줄이고 위를 맞춘다.
 * 카드 크기는 비율만 쓰므로 화면 크기(px)든 이미지 크기(px)든 같은 결과가 나온다.
 */
export function placeCards(layout: BackdropLayout, sizes: Size[]): Rect[] {
  const maxH = HEIGHT * 0.86;
  if (layout === "center") {
    const card = sizes[0];
    const scale = Math.min((WIDTH * 0.78) / card.width, maxH / card.height);
    const width = card.width * scale;
    const height = card.height * scale;
    return [{ x: (WIDTH - width) / 2, y: (HEIGHT - height) / 2, width, height }];
  }
  // 두 장이 가운데로 바짝 붙도록 사이를 좁히고, 양옆 여백을 넉넉히 둔다.
  const pair = [sizes[0], sizes[1] ?? sizes[0]];
  const gap = WIDTH * 0.012;
  const maxW = Math.max(...pair.map((c) => c.width));
  const tallest = Math.max(...pair.map((c) => c.height));
  const scale = Math.min((WIDTH * 0.8 - gap) / 2 / maxW, maxH / tallest);
  const y = (HEIGHT - tallest * scale) / 2;
  let x = (WIDTH - (pair[0].width * scale + pair[1].width * scale + gap)) / 2;
  return pair.map((c) => {
    const rect = { x, y, width: c.width * scale, height: c.height * scale };
    x += rect.width + gap;
    return rect;
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src}`));
    img.src = src;
  });
}

/**
 * 배경을 화면에 꽉 차게(cover) 흐리게 깐다.
 * ctx.filter(blur)는 iOS Safari에서 안 되는 버전이 있어서, 아주 작게 줄였다가 다시 키우는 방식으로 흐린다.
 */
function drawBlurredCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(WIDTH / img.width, HEIGHT / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (WIDTH - w) / 2;
  const y = (HEIGHT - h) / 2;

  // 두 번에 나눠 줄이면 계단 무늬 없이 부드럽게 흐려진다.
  const steps = [8, 24];
  let source: CanvasImageSource = img;
  let sw = img.width;
  let sh = img.height;
  for (const factor of steps) {
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(WIDTH / factor));
    small.height = Math.max(1, Math.round(HEIGHT / factor));
    const sctx = small.getContext("2d");
    if (!sctx) break;
    sctx.imageSmoothingQuality = "high";
    if (source === img) {
      sctx.drawImage(img, x / factor, y / factor, w / factor, h / factor);
    } else {
      sctx.drawImage(source, 0, 0, sw, sh, 0, 0, small.width, small.height);
    }
    source = small;
    sw = small.width;
    sh = small.height;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, WIDTH, HEIGHT);

  // 화면의 흐린 층(BlurBackdrop)처럼 살짝 밝게 덮는다.
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  card: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.drawImage(card, x, y, w, h);
  ctx.restore();
}

/**
 * cards: 올릴 카드 이미지. "pair"에서 두 장을 주면 서로 다른 카드를 나란히(전체 미션을 반씩 나눈 경우),
 * 한 장만 주면 같은 카드를 두 번 놓는다. "center"는 첫 장만 쓴다.
 */
export async function composeOnBackdrop(
  cards: Blob[],
  backgroundSrc: string,
  layout: BackdropLayout,
): Promise<Blob> {
  const cardUrls = cards.map((card) => URL.createObjectURL(card));
  try {
    const [background, ...cardImgs] = await Promise.all([
      loadImage(backgroundSrc),
      ...cardUrls.map(loadImage),
    ]);

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas is not supported");

    drawBlurredCover(ctx, background);

    const rects = placeCards(layout, cardImgs);
    rects.forEach((rect, i) => {
      const img = cardImgs[i] ?? cardImgs[0];
      drawCard(ctx, img, rect.x, rect.y, rect.width, rect.height);
    });

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("image encode failed"))),
        "image/png",
      );
    });
  } finally {
    cardUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}
