"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Assignment, Invite, Room, Submission } from "@pawpaw/shared";
import { describeError } from "./errors";
import {
  checkMembership,
  loadPhoto,
  subscribeLatestInvite,
  subscribeMembers,
  subscribeMyAssignment,
  subscribeMySubmission,
  subscribeRoom,
  type MemberProfile,
} from "./roomRepo";

export type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

type Subscribe<T> = (
  onData: (data: T) => void,
  onError: (error: Error) => void,
) => () => void;

/**
 * 실시간 구독을 화면에서 쓰기 쉬운 형태로 바꾼다.
 * key가 null이면 구독하지 않고(로그인 전 등), key가 바뀌면 다시 구독한다.
 */
function useSubscription<T>(
  key: string | null,
  subscribe: Subscribe<T>,
): Loadable<T> {
  const [state, setState] = useState<{
    key: string;
    result: Loadable<T>;
  } | null>(null);

  // 최신 subscribe 함수를 보관한다. (구독은 key가 바뀔 때만 다시 한다)
  const subscribeRef = useRef(subscribe);
  useEffect(() => {
    subscribeRef.current = subscribe;
  });

  useEffect(() => {
    if (key === null) return;
    return subscribeRef.current(
      (data) => setState({ key, result: { status: "ready", data } }),
      (error) =>
        setState({
          key,
          result: { status: "error", message: describeError(error) },
        }),
    );
  }, [key]);

  if (key === null || state === null || state.key !== key) {
    return { status: "loading" };
  }
  return state.result;
}

export function useRoom(roomId: string, uid: string | null): Loadable<Room | null> {
  return useSubscription(uid ? `room:${roomId}:${uid}` : null, (onData, onError) =>
    subscribeRoom(roomId, onData, onError),
  );
}

export function useMembers(
  roomId: string,
  uid: string | null,
): Loadable<MemberProfile[]> {
  return useSubscription(uid ? `members:${roomId}:${uid}` : null, (onData, onError) =>
    subscribeMembers(roomId, onData, onError),
  );
}

export function useMyAssignment(
  roomId: string,
  uid: string | null,
): Loadable<Assignment | null> {
  return useSubscription(
    uid ? `assignment:${roomId}:${uid}` : null,
    (onData, onError) => subscribeMyAssignment(roomId, uid ?? "", onData, onError),
  );
}

export function useMySubmission(
  roomId: string,
  uid: string | null,
): Loadable<Submission | null> {
  return useSubscription(
    uid ? `submission:${roomId}:${uid}` : null,
    (onData, onError) => subscribeMySubmission(roomId, uid ?? "", onData, onError),
  );
}

/** 이미 이 방의 멤버인지 한 번 확인한다. */
export function useMembership(
  roomId: string,
  uid: string | null,
): Loadable<boolean> {
  return useSubscription(
    uid ? `membership:${roomId}:${uid}` : null,
    (onData, onError) => {
      let cancelled = false;
      checkMembership(roomId, uid ?? "")
        .then((isMember) => {
          if (!cancelled) onData(isMember);
        })
        .catch((error: Error) => {
          if (!cancelled) onError(error);
        });
      return () => {
        cancelled = true;
      };
    },
  );
}

/** 가장 최근 초대 링크. 방장만 읽을 수 있으므로 방장일 때만 구독한다. */
export function useLatestInvite(
  roomId: string,
  uid: string | null,
  isHost: boolean,
): Loadable<Invite | null> {
  return useSubscription(
    uid && isHost ? `invite:${roomId}:${uid}` : null,
    (onData, onError) => subscribeLatestInvite(roomId, onData, onError),
  );
}

/** 30초마다 바뀌는 현재 시각(밀리초). 만료 여부를 화면에 반영할 때 쓴다. */
export function useNow(): number {
  const bucket = useSyncExternalStore(
    (callback) => {
      const timer = setInterval(callback, 30_000);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / 30_000),
    () => 0,
  );
  return bucket * 30_000;
}

/**
 * Storage에 있는 사진을 받아 화면에 보여줄 임시 주소로 바꾼다.
 * version이 바뀌면(사진을 교체하면) 다시 받는다.
 */
export function useStoragePhoto(
  photoPath: string | null,
  version: string | null,
): { url: string | null; failed: boolean } {
  const key = photoPath && version ? `${photoPath}|${version}` : null;
  const [state, setState] = useState<{
    key: string;
    url: string | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!key || !photoPath) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    loadPhoto(photoPath)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ key, url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, url: null, failed: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key, photoPath]);

  if (state === null || state.key !== key) return { url: null, failed: false };
  return { url: state.url, failed: state.failed };
}
