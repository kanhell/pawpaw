/**
 * 결과 카드 이미지를 흐린 배경 위에 올려 9:16 세로 사진으로 만든다. (스토리에 바로 올리기 좋은 비율)
 * - "center": 카드 한 장을 가운데에
 * - "pair": 같은 카드 두 장을 좌우로 나란히
 */
export type BackdropLayout = "center" | "pair";

const WIDTH = 1080;
const HEIGHT = 1920;

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
    const cardImg = cardImgs[0];

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas is not supported");

    drawBlurredCover(ctx, background);

    const maxH = HEIGHT * 0.86;
    if (layout === "center") {
      const scale = Math.min((WIDTH * 0.78) / cardImg.width, maxH / cardImg.height);
      const w = cardImg.width * scale;
      const h = cardImg.height * scale;
      drawCard(ctx, cardImg, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
    } else {
      // 두 장이 가운데로 바짝 붙도록 사이를 좁히고, 양옆 여백을 넉넉히 둔다.
      // 두 장의 높이가 다를 수 있으니(반씩 나눴는데 사람 수가 홀수) 큰 쪽에 맞춰 같은 배율로 줄이고 위를 맞춘다.
      const pair = [cardImg, cardImgs[1] ?? cardImg];
      const gap = WIDTH * 0.012;
      const maxW = Math.max(...pair.map((img) => img.width));
      const tallest = Math.max(...pair.map((img) => img.height));
      const scale = Math.min(((WIDTH * 0.8 - gap) / 2) / maxW, maxH / tallest);
      const top = (HEIGHT - tallest * scale) / 2;
      let x = (WIDTH - (pair[0].width * scale + pair[1].width * scale + gap)) / 2;
      for (const img of pair) {
        drawCard(ctx, img, x, top, img.width * scale, img.height * scale);
        x += img.width * scale + gap;
      }
    }

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
