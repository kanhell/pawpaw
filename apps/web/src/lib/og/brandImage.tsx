import { ImageResponse } from "next/og";

// 링크 미리보기(오픈 그래프) 썸네일: 메인 화면의 발바닥 로고 + "PawPaw" 글씨.
// 색은 디자인 토큰(app/globals.css)의 canvas / ink와 같다. 글씨는 영문뿐이라 기본 글꼴로 그린다.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "PawPaw";

const TITLE = "PawPaw";

// 메인 화면과 같은 Geist Bold를 Google Fonts에서 필요한 글자만 받아온다.
// 받지 못하면(네트워크 오류 등) null을 돌려주고 기본 글꼴로 그린다.
async function loadGeistBold(): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Geist:wght@700&text=${TITLE}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function renderBrandImage() {
  const geistBold = await loadGeistBold();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          background: "#fffbeb",
          color: "#171717",
        }}
      >
        {/* components/Icons.tsx의 PawIcon과 같은 모양 */}
        <svg width="220" height="220" viewBox="0 0 24 24" fill="#171717">
          <ellipse cx="6" cy="10" rx="2.1" ry="2.7" transform="rotate(-20 6 10)" />
          <ellipse cx="9.6" cy="5.6" rx="2.1" ry="2.8" transform="rotate(-6 9.6 5.6)" />
          <ellipse cx="14.4" cy="5.6" rx="2.1" ry="2.8" transform="rotate(6 14.4 5.6)" />
          <ellipse cx="18" cy="10" rx="2.1" ry="2.7" transform="rotate(20 18 10)" />
          <path d="M12 11c-2.6 0-5.5 3.2-5.5 6 0 1.7 1.2 2.6 2.7 2.6 1.1 0 1.8-.5 2.8-.5s1.7.5 2.8.5c1.5 0 2.7-.9 2.7-2.6 0-2.8-2.9-6-5.5-6Z" />
        </svg>
        <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -2, fontFamily: "Geist" }}>
          {TITLE}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: geistBold ? [{ name: "Geist", data: geistBold, weight: 700, style: "normal" }] : [],
    },
  );
}
