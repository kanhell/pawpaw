"use client";

import Popup from "../../components/Popup";
import SubmissionStatus from "../../components/SubmissionStatus";
import type { MemberProfile } from "../../lib/firebase/roomRepo";

// 참여 멤버 팝업.
// - 미션 공개 전: 참가자 목록
// - 미션 공개 후: 제출 현황(✅/⏳)
export default function MembersPopup({
  members,
  uid,
  showSubmissions,
  onClose,
}: {
  members: MemberProfile[];
  uid: string;
  showSubmissions: boolean;
  onClose: () => void;
}) {
  return (
    <Popup title={`참여 멤버 ${members.length}명`} onClose={onClose}>
      {showSubmissions ? (
        <SubmissionStatus profiles={members} myId={uid} />
      ) : (
        <ul className="w-full space-y-2">
          {members.map(({ player, nickname }) => (
            <li
              key={player.id}
              className="rounded-card bg-surface px-4 py-3 text-left font-bold shadow-card"
            >
              {player.animal} {nickname}
              {player.isHost ? " 👑" : ""}
              {player.id === uid ? " (나)" : ""}
            </li>
          ))}
        </ul>
      )}
    </Popup>
  );
}
