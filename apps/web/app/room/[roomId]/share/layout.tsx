import type { ReactNode } from "react";
import SceneBackground from "../../../../src/components/SceneBackground";

// 결과 공유도 결과 구간이라 노을 배경
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SceneBackground scene="sunset" />
      {children}
    </>
  );
}
