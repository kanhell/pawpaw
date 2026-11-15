"use client";

import { useCallback, useEffect, useRef } from "react";
import { ROUTES } from "@pawpaw/shared";
import { useLatestInvite } from "../../lib/firebase/hooks";
import { renewInvite } from "../../lib/firebase/roomRepo";
import { useBrowserInfo } from "../../lib/invite/useBrowserInfo";

export type InviteCopyResult = "copied" | "failed";

/**
 * 방장의 초대 링크. 게임 시작 전(enabled)에만 쓴다.
 * 링크가 없으면 미리 하나 만들어 둔다. 버튼을 누른 순간 바로 복사해야
 * 브라우저(특히 iOS Safari)가 클립보드 쓰기를 막지 않기 때문이다.
 * 링크는 만료되지 않고, 게임을 시작하면 폐기된다. (startSettingsPhase)
 */
export function useInviteLink(roomId: string, uid: string, enabled: boolean) {
  const invite = useLatestInvite(roomId, uid, enabled);
  const { origin } = useBrowserInfo();
  const creating = useRef<Promise<string> | null>(null);

  const ensureCode = useCallback(() => {
    creating.current ??= renewInvite(roomId, uid).finally(() => {
      creating.current = null;
    });
    return creating.current;
  }, [roomId, uid]);

  const missing = enabled && invite.status === "ready" && invite.data === null;
  useEffect(() => {
    if (missing) ensureCode().catch(() => {}); // 실패하면 버튼을 누를 때 다시 만든다.
  }, [missing, ensureCode]);

  const code = invite.status === "ready" ? (invite.data?.code ?? null) : null;

  const copy = useCallback(async (): Promise<InviteCopyResult> => {
    try {
      const inviteCode = code ?? (await ensureCode());
      const url = `${origin || window.location.origin}${ROUTES.invite(roomId, inviteCode)}`;
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }, [code, ensureCode, origin, roomId]);

  return { copy };
}
