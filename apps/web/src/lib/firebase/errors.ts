/** Firebase 오류를 사용자에게 보여줄 문장으로 바꾼다. */
export function describeError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  let message = "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
  if (code.includes("permission-denied") || code === "storage/unauthorized") {
    message = "권한이 없어요. 방에 참가한 사람만, 마감 전에만 할 수 있어요.";
  } else if (
    code.includes("unavailable") ||
    code === "storage/retry-limit-exceeded"
  ) {
    message = "네트워크가 불안정해요. 잠시 후 다시 시도해 주세요.";
  }

  // 개발 중에는 어느 단계에서 났는지 알 수 있도록 오류 코드를 함께 보여준다.
  // (storage/...는 사진 업로드, permission-denied는 Firestore 문서 쓰기·읽기)
  if (process.env.NODE_ENV === "production" || !code) return message;
  return `${message} (${code})`;
}
