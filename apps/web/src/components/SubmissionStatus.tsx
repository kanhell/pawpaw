import type { MemberProfile } from "../lib/firebase/roomRepo";

interface SubmissionStatusProps {
  profiles: MemberProfile[];
  myId: string | null;
}

// 멤버별 제출 여부. 방장을 포함한 모든 멤버에게 보인다.
// "제출했는지"만 알려 주며, 사진이나 사진 경로, 제출 시각은 보여주지 않는다. (docs/RESULT_REVEAL.md)
export default function SubmissionStatus({ profiles, myId }: SubmissionStatusProps) {
  const ordered = [...profiles].sort((a, b) =>
    a.player.joinedAt === b.player.joinedAt
      ? a.player.id.localeCompare(b.player.id)
      : a.player.joinedAt.localeCompare(b.player.joinedAt),
  );
  const submittedCount = ordered.filter(
    ({ player }) => player.submitted === true,
  ).length;

  return (
    <section className="w-full rounded-sheet bg-surface p-5 text-left shadow-card">
      <p className="font-bold">
        제출 현황{" "}
        <span className="text-sm font-normal text-ink-subtle">
          {submittedCount}/{ordered.length}
        </span>
      </p>
      <p className="mt-1 text-xs text-ink-subtle">
        누가 제출했는지만 보여요. 사진은 결과가 공개된 뒤에 볼 수 있어요.
      </p>
      <ul className="mt-3 space-y-2">
        {ordered.map(({ player, nickname }) => {
          const submitted = player.submitted === true;
          return (
            <li
              key={player.id}
              className="flex items-center justify-between rounded-card bg-canvas px-4 py-3"
            >
              <span className="font-bold">
                {player.animal} {nickname}
                {player.isHost ? " 👑" : ""}
                {player.id === myId ? " (나)" : ""}
              </span>
              <span className={submitted ? "text-sm font-bold" : "text-sm text-ink-subtle"}>
                {submitted ? "✅ 제출함" : "⏳ 아직이에요"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
