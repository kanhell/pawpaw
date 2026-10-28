/**
 * 카카오톡 같은 앱 안의 인앱 브라우저에서 링크가 열렸을 때,
 * 기기의 기본 브라우저(사파리, 크롬, 삼성 인터넷, 네이버 등)로 옮기는 방법을 정한다.
 *
 * 인앱 브라우저는 각 앱이 만든 기능이라 외부로 나가는 공식 방법이 없다.
 * 아래는 널리 쓰이는 비공식 방법이며, 앱 업데이트로 달라질 수 있으므로
 * 실제 기기에서 확인해야 한다. (docs/SECURITY.md가 아니라 docs/INVITE.md 참고)
 */

export type InAppBrowser =
  | "kakaotalk"
  | "line"
  | "naver"
  | "instagram"
  | "facebook"
  | "daum";

export type MobileOs = "ios" | "android" | "other";

export type ExternalOpenPlan =
  | { kind: "none" } // 인앱 브라우저가 아니다
  | { kind: "redirect"; browser: InAppBrowser; os: MobileOs; href: string } // 주소를 바꿔 외부로 보낸다
  | { kind: "manual"; browser: InAppBrowser; os: MobileOs }; // 자동으로 못 보낸다. 사용자가 직접 연다

export function detectOs(userAgent: string): MobileOs {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "other";
}

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  if (/KAKAOTALK/i.test(userAgent)) return "kakaotalk";
  if (/\bLine\//i.test(userAgent)) return "line";
  if (/NAVER\(inapp/i.test(userAgent)) return "naver";
  if (/Instagram/i.test(userAgent)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(userAgent)) return "facebook";
  if (/DaumApps/i.test(userAgent)) return "daum";
  return null;
}

// 카카오톡: 비공식 스킴 kakaotalk://web/openExternal 로 기본 브라우저에서 연다. (iOS, Android 공통)
export function kakaoExternalHref(url: string): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

// 라인: 주소에 openExternalBrowser=1 을 붙이면 외부 브라우저로 연다.
export function lineExternalHref(url: string): string {
  const next = new URL(url);
  next.searchParams.set("openExternalBrowser", "1");
  return next.toString();
}

// 안드로이드: intent 주소로 기본 브라우저를 호출한다. (패키지를 지정하지 않아 기본 브라우저를 따른다)
export function androidIntentHref(url: string): string {
  const target = new URL(url);
  const scheme = target.protocol.replace(":", "");
  return (
    `intent://${target.host}${target.pathname}${target.search}${target.hash}` +
    `#Intent;scheme=${scheme};action=android.intent.action.VIEW;` +
    `category=android.intent.category.BROWSABLE;end`
  );
}

export function planExternalOpen(
  userAgent: string,
  url: string,
): ExternalOpenPlan {
  const browser = detectInAppBrowser(userAgent);
  if (!browser) return { kind: "none" };
  const os = detectOs(userAgent);

  if (browser === "kakaotalk") {
    return { kind: "redirect", browser, os, href: kakaoExternalHref(url) };
  }
  if (browser === "line") {
    return { kind: "redirect", browser, os, href: lineExternalHref(url) };
  }
  if (os === "android") {
    return { kind: "redirect", browser, os, href: androidIntentHref(url) };
  }
  // iOS의 나머지 인앱 브라우저는 자동으로 나갈 방법이 없어 사용자가 직접 열어야 한다.
  return { kind: "manual", browser, os };
}

/** 자동 이동이 안 될 때 사용자에게 보여줄 직접 여는 방법 */
export function manualOpenGuide(browser: InAppBrowser, os: MobileOs): string {
  if (browser === "kakaotalk") {
    return os === "ios"
      ? "화면의 공유 버튼을 누르고 Safari 같은 브라우저를 선택해 주세요."
      : "화면의 더보기(⋮)를 누르고 '다른 브라우저로 열기'를 선택해 주세요.";
  }
  return os === "ios"
    ? "화면의 더보기(⋯) 또는 공유 버튼에서 'Safari로 열기'를 선택해 주세요."
    : "화면의 더보기(⋮)에서 '다른 브라우저로 열기'를 선택해 주세요.";
}
