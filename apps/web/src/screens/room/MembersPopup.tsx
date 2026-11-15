"use client";

import type { Room } from "@pawpaw/shared";
import Popup from "../../components/Popup";
import SubmissionStatus, { type MemberMission } from "../../components/SubmissionStatus";
import { useRoomAssignments } from "../../lib/firebase/hooks";
import type { MemberProfile } from "../../lib/firebase/roomRepo";
import { describeAssignmentMission } from "../../lib/missions";

// 참여 멤버 팝업.
// - 미션 공개 전: 참가자 목록
// - 미션 공개 후: 제출 현황 (제출함 / 아직이에요를 글자 색으로 구분)
//   미션을 '미리 전체 공개'로 정한 방이면 이름 아래에 각자 받은 미션도 보여준다. (누가 정해줬는지는 보여주지 않는다)
export default function MembersPopup({
  room,
  uid,
  members,
  showSubmissions,
  onClose,
}: {
  room: Room;
  uid: string;
  members: MemberProfile[];
  showSubmissions: boolean;
  onClose: () => void;
}) {
  const showMissions = showSubmissions && room.settings.visibility === "public";
  const everyone = useRoomAssignments(room.id, uid, showMissions);

  let missions: Map<string, MemberMission> | undefined;
  if (showMissions && everyone.status === "ready") {
    missions = new Map(
      everyone.data.map((item) => [
        item.receiverId,
        { text: describeAssignmentMission(item)?.text ?? "미션을 불러오지 못했어요" },
      ]),
    );
  }

  return (
    <Popup title={`참여 멤버 ${members.length}명`} onClose={onClose}>
      {showSubmissions ? (
        <>
          <SubmissionStatus profiles={members} missions={missions} />
          {showMissions && everyone.status === "loading" && (
            <p className="text-sm text-ink-muted">친구들의 미션을 불러오는 중…</p>
          )}
          {showMissions && everyone.status === "error" && (
            <p className="text-sm text-primary">{everyone.message}</p>
          )}
        </>
      ) : (
        <ul className="w-full space-y-2">
          {members.map(({ player, nickname }) => (
            <li
              key={player.id}
              className="rounded-card bg-surface px-4 py-3 text-left font-bold shadow-card"
            >
              {player.animal} {nickname}
              {player.isHost ? " 👑" : ""}
            </li>
          ))}
        </ul>
      )}
    </Popup>
  );
}
