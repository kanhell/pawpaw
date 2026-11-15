// 방 만들기 화면 → 방 화면으로 "방금 만들었고, 초대 링크를 복사했는지"를 넘긴다.
// 주소에 남기지 않으려고 이 탭의 sessionStorage를 쓰고, 방 화면에서 한 번 읽으면 지운다.
const key = (roomId: string) => `pawpaw:room-created:${roomId}`;

export function markRoomCreated(roomId: string, copied: boolean): void {
  try {
    sessionStorage.setItem(key(roomId), copied ? "copied" : "failed");
  } catch {
    // 저장하지 못하면 안내 없이 방으로 간다.
  }
}

// 있으면 복사 성공 여부를 돌려주고 지운다. 없으면 null.
export function takeRoomCreated(roomId: string): boolean | null {
  try {
    const value = sessionStorage.getItem(key(roomId));
    if (value === null) return null;
    sessionStorage.removeItem(key(roomId));
    return value === "copied";
  } catch {
    return null;
  }
}
