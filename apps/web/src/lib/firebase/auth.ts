"use client";

import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { useSyncExternalStore } from "react";
import { getFirebase } from "./client";

export type AuthState =
  | { status: "loading" }
  | { status: "signedIn"; uid: string }
  | { status: "error"; message: string };

const LOADING: AuthState = { status: "loading" };

let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function setState(next: AuthState) {
  state = next;
  listeners.forEach((listener) => listener());
}

// 처음 구독하는 시점에 로그인 상태를 감시하고, 로그인돼 있지 않으면 익명 로그인을 한다.
function start() {
  if (started) return;
  started = true;
  try {
    const { auth } = getFirebase();
    onAuthStateChanged(auth, (user) => {
      if (user) {
        setState({ status: "signedIn", uid: user.uid });
        return;
      }
      signInAnonymously(auth).catch((error: unknown) => {
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "로그인에 실패했어요.",
        });
      });
    });
  } catch (error) {
    setState({
      status: "error",
      message: error instanceof Error ? error.message : "로그인에 실패했어요.",
    });
  }
}

/** 현재 로그인 상태. uid는 Firebase Auth의 uid이며 User.id와 같다. */
export function useAuthState(): AuthState {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      start();
      return () => {
        listeners.delete(callback);
      };
    },
    () => state,
    () => LOADING,
  );
}
