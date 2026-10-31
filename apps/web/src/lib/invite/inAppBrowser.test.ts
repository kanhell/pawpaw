import { describe, expect, it } from "vitest";
import {
  androidIntentHref,
  detectInAppBrowser,
  detectOs,
  kakaoExternalHref,
  lineExternalHref,
  manualOpenGuide,
  planExternalOpen,
} from "./inAppBrowser";

const URL_SAMPLE = "https://pawpaw.example.com/invite/room1/abc123?x=1#top";

const UA = {
  kakaoAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S911N Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 KAKAOTALK 2510000",
  kakaoIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.5.0",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.0.0",
  naverAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.0.0)",
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 Instagram 330.0.0.0",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

describe("detectInAppBrowser / detectOs", () => {
  it("인앱 브라우저를 구분한다", () => {
    expect(detectInAppBrowser(UA.kakaoAndroid)).toBe("kakaotalk");
    expect(detectInAppBrowser(UA.kakaoIos)).toBe("kakaotalk");
    expect(detectInAppBrowser(UA.line)).toBe("line");
    expect(detectInAppBrowser(UA.naverAndroid)).toBe("naver");
    expect(detectInAppBrowser(UA.instagramIos)).toBe("instagram");
    expect(detectInAppBrowser(UA.facebookIos)).toBe("facebook");
  });

  it("일반 브라우저는 인앱으로 보지 않는다", () => {
    expect(detectInAppBrowser(UA.safari)).toBeNull();
    expect(detectInAppBrowser(UA.chromeDesktop)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });

  it("운영체제를 구분한다", () => {
    expect(detectOs(UA.kakaoAndroid)).toBe("android");
    expect(detectOs(UA.kakaoIos)).toBe("ios");
    expect(detectOs(UA.chromeDesktop)).toBe("other");
  });
});

describe("외부 브라우저 주소", () => {
  it("카카오톡 스킴에는 원래 주소를 인코딩해 담는다", () => {
    const href = kakaoExternalHref(URL_SAMPLE);
    expect(href.startsWith("kakaotalk://web/openExternal?url=")).toBe(true);
    expect(decodeURIComponent(href.split("url=")[1])).toBe(URL_SAMPLE);
  });

  it("라인은 openExternalBrowser=1을 붙이고 기존 쿼리를 유지한다", () => {
    const next = new URL(lineExternalHref(URL_SAMPLE));
    expect(next.searchParams.get("openExternalBrowser")).toBe("1");
    expect(next.searchParams.get("x")).toBe("1");
    expect(next.pathname).toBe("/invite/room1/abc123");
  });

  it("안드로이드 intent 주소를 만든다", () => {
    expect(androidIntentHref(URL_SAMPLE)).toBe(
      "intent://pawpaw.example.com/invite/room1/abc123?x=1#top" +
        "#Intent;scheme=https;action=android.intent.action.VIEW;" +
        "category=android.intent.category.BROWSABLE;end",
    );
  });
});

describe("planExternalOpen", () => {
  it("일반 브라우저면 아무것도 하지 않는다", () => {
    expect(planExternalOpen(UA.safari, URL_SAMPLE)).toEqual({ kind: "none" });
    expect(planExternalOpen(UA.chromeDesktop, URL_SAMPLE)).toEqual({ kind: "none" });
  });

  it("카카오톡은 iOS, 안드로이드 모두 스킴으로 보낸다", () => {
    for (const ua of [UA.kakaoAndroid, UA.kakaoIos]) {
      const plan = planExternalOpen(ua, URL_SAMPLE);
      expect(plan.kind).toBe("redirect");
      if (plan.kind === "redirect") {
        expect(plan.browser).toBe("kakaotalk");
        expect(plan.href).toBe(kakaoExternalHref(URL_SAMPLE));
      }
    }
  });

  it("라인은 openExternalBrowser로 보낸다", () => {
    const plan = planExternalOpen(UA.line, URL_SAMPLE);
    expect(plan).toMatchObject({ kind: "redirect", browser: "line" });
  });

  it("안드로이드의 그 밖의 인앱 브라우저는 intent로 보낸다", () => {
    const plan = planExternalOpen(UA.naverAndroid, URL_SAMPLE);
    expect(plan).toMatchObject({
      kind: "redirect",
      browser: "naver",
      href: androidIntentHref(URL_SAMPLE),
    });
    expect(planExternalOpen(UA.instagramAndroid, URL_SAMPLE)).toMatchObject({
      kind: "redirect",
      browser: "instagram",
    });
  });

  it("iOS의 그 밖의 인앱 브라우저는 사용자가 직접 열도록 안내한다", () => {
    expect(planExternalOpen(UA.instagramIos, URL_SAMPLE)).toEqual({
      kind: "manual",
      browser: "instagram",
      os: "ios",
    });
    expect(planExternalOpen(UA.facebookIos, URL_SAMPLE)).toMatchObject({
      kind: "manual",
      browser: "facebook",
    });
  });
});

describe("manualOpenGuide", () => {
  it("운영체제별 안내 문구를 돌려준다", () => {
    expect(manualOpenGuide("kakaotalk", "ios")).toContain("공유 버튼");
    expect(manualOpenGuide("kakaotalk", "android")).toContain("다른 브라우저로 열기");
    expect(manualOpenGuide("instagram", "ios")).toContain("Safari");
    expect(manualOpenGuide("naver", "android")).toContain("다른 브라우저로 열기");
  });
});
