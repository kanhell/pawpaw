// 팝업 안의 선택지 버튼 두 개. 팝업의 선택지는 화면 아래가 아니라 팝업 안에 둔다.
// 왼쪽은 물러나기(취소 등), 오른쪽은 하기(강조색)다.
export default function ChoiceButtons({
  cancelLabel = "취소",
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      <button
        onClick={onCancel}
        disabled={busy}
        className="rounded-full bg-surface px-4 py-3 font-bold text-ink shadow-card active:scale-95 disabled:opacity-50"
      >
        {cancelLabel}
      </button>
      <button
        onClick={onConfirm}
        disabled={busy}
        className="rounded-full bg-primary px-4 py-3 font-bold text-primary-foreground active:scale-95 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
