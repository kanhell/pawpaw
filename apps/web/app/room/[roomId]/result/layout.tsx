import type { ReactNode } from "react";
import SceneBackground from "../../../../src/components/SceneBackground";

// 결과 공개부터는 노을 배경
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <SceneBackground scene="sunset" />
      {children}
    </>
  );
}
