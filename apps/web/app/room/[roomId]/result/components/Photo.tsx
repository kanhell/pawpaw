"use client";

import { useStoragePhoto } from "../../../../../src/lib/firebase/hooks";
import type { Submission } from "../types";

export default function Photo({ s, className }: { s: Submission; className?: string }) {
  const { url, failed } = useStoragePhoto(s.photoPath || null, String(s.submittedAt));
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="제출한 사진" className={`object-cover ${className ?? ""}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gray-200 text-sm text-gray-500 ${className ?? ""}`}>
      {failed ? "사진을 못 불러왔어요" : s.photoPath ? "불러오는 중..." : "📷"}
    </div>
  );
}