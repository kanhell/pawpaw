"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Assignment, Invite, Room, Submission } from "@pawpaw/shared";
import type { JudgmentRecord } from "../judgment";
import { describeError } from "./errors";
import {
  checkMembership,
  loadPhoto,
  subscribeLatestInvite,
  subscribeMembers,
  subscribeMissionStart,
  subscribeMyAssignment,
  subscribeMySubmission,
  subscribeRoom,
  subscribeRoomAssignments,
  subscribeTakenAnimals,
  subscribeBoomDowns,
  subscribeJudgments,
  type BoomDown,
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

/** 미션 수행이 시작된 시각(ISO). enabled가 false면(미션 공개 전) 읽지 않는다. */
export function useMissionStart(
  roomId: string,
  uid: string | null,
  enabled: boolean,
): Loadable<string | null> {
  return useSubscription(uid && enabled ? `missionStart:${roomId}:${uid}` : null, (onData, onError) =>
    subscribeMissionStart(roomId, onData, onError),
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

/**
 * 방 안의 모든 미션 배정. 미션을 '미리 전체 공개'로 정한 방에서만 규칙이 허용하므로
 * enabled일 때만 구독한다. (docs/MISSION_ASSIGN.md)
 */
export function useRoomAssignments(
  roomId: string,
  uid: string | null,
  enabled: boolean,
): Loadable<Assignment[]> {
  return useSubscription(
    uid && enabled ? `assignments:${roomId}:${uid}` : null,
    (onData, onError) => subscribeRoomAssignments(roomId, onData, onError),
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

/** 미션 구경의 붐따 목록. 결과가 열린 뒤에만 읽을 수 있다. */
export function useBoomDowns(roomId: string, uid: string | null, enabled: boolean): Loadable<BoomDown[]> {
  return useSubscription(uid && enabled ? `boomdowns:${roomId}:${uid}` : null, (onData, onError) =>
    subscribeBoomDowns(roomId, onData, onError),
  );
}

/** 미션 구경의 인정 투표 목록. 결과가 열린 뒤에만 읽을 수 있다. */
export function useJudgments(
  roomId: string,
  uid: string | null,
  enabled: boolean,
): Loadable<JudgmentRecord[]> {
  return useSubscription(uid && enabled ? `judgments:${roomId}:${uid}` : null, (onData, onError) =>
    subscribeJudgments(roomId, onData, onError),
  );
}

/** 방에서 이미 누가 고른 동물 목록. 참가 화면에서 고를 수 없는 동물을 막을 때 쓴다. */
export function useTakenAnimals(roomId: string, uid: string | null): Loadable<string[]> {
  return useSubscription(uid ? `animals:${roomId}:${uid}` : null, (onData, onError) =>
    subscribeTakenAnimals(roomId, onData, onError),
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

// 받은 사진을 기억해 둔다. (경로|버전 → 임시 주소)
// 같은 사진이 미션 구경·투표·시상식·결과 카드에 계속 나오는데, 화면이 바뀔 때마다 다시 받으면 느리다.
// 사진은 한 방에 많아야 몇 장이고 장당 수백 KB라서, 임시 주소를 지우지 않고 페이지가 닫힐 때까지 둔다.
const photoRequests = new Map<string, Promise<string>>();
const photoUrls = new Map<string, string>(); // 이미 받은 것: 다시 그릴 때 '불러오는 중' 없이 바로 보여준다

/** 사진을 미리 받아 둔다. 이미 받았거나 받는 중이면 그것을 그대로 쓴다. */
export function preloadPhoto(photoPath: string, version: string): Promise<string> {
  const key = `${photoPath}|${version}`;
  let request = photoRequests.get(key);
  if (!request) {
    request = loadPhoto(photoPath).then((blob) => {
      const url = URL.createObjectURL(blob);
      photoUrls.set(key, url);
      return url;
    });
    // 실패하면 기억에서 지워 다음에 다시 받을 수 있게 한다.
    request.catch(() => photoRequests.delete(key));
    photoRequests.set(key, request);
  }
  return request;
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
    if (!key || !photoPath || !version || photoUrls.has(key)) return;
    let cancelled = false;
    preloadPhoto(photoPath, version)
      .then((url) => {
        if (!cancelled) setState({ key, url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, url: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [key, photoPath, version]);

  const cached = key ? photoUrls.get(key) : undefined;
  if (cached) return { url: cached, failed: false };
  if (state === null || state.key !== key) return { url: null, failed: false };
  return { url: state.url, failed: state.failed };
}
