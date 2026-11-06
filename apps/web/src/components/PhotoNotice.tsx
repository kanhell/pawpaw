// 사진으로 인증한다는 안내 (게임 설정, 미션 직접 부여 화면에서 함께 쓴다)
// 공개 범위는 docs/SECURITY.md의 접근 규칙과 같다.
export default function PhotoNotice() {
  return (
    <div className="w-full rounded-card bg-surface p-4 text-left shadow-card">
      <p className="font-bold">📸 사진으로 인증해요</p>
      <ul className="mt-2 space-y-1 text-sm text-ink-muted">
        <li>미션을 마치면 관련 있는 사진을 올려 주세요.</li>
        <li>사진은 결과가 공개되기 전까지 나만 볼 수 있어요.</li>
        <li>결과가 공개되면 같은 방 친구들에게 보여요.</li>
      </ul>
    </div>
  );
}
