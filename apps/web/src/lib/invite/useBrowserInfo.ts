"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/**
 * 현재 브라우저의 User-Agent, 주소, 주소의 origin을 돌려준다.
 * 서버 렌더링 중에는 모두 빈 문자열이며, 브라우저에서 화면이 붙은 뒤 실제 값이 된다.
 */
export function useBrowserInfo(): {
  userAgent: string;
  href: string;
  origin: string;
} {
  const userAgent = useSyncExternalStore(
    subscribeNothing,
    () => navigator.userAgent,
    () => "",
  );
  const href = useSyncExternalStore(
    subscribeNothing,
    () => window.location.href,
    () => "",
  );
  const origin = useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => "",
  );
  return { userAgent, href, origin };
}
