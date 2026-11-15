"use client";

import type { Assignment } from "@pawpaw/shared";
import Popup from "../../components/Popup";
import { describeAssignmentMission } from "../../lib/missions";

// 미션 도착 팝업: 미션이 공개되면 편지를 열어 내 미션을 확인한다.
// 확인을 누르면 닫히고, 그 뒤로는 방 화면 위쪽에 내 미션이 보인다.
export default function MissionArrivedPopup({
  assignment,
  onConfirm,
}: {
  assignment: Assignment;
  onConfirm: () => void;
}) {
  const mission = describeAssignmentMission(assignment);
  return (
    <Popup title="미션이 도착했어요">
      <div className="w-full rounded-sheet bg-surface p-6 shadow-float">
        <p className="text-xl font-bold">
          {mission?.text ?? "미션을 불러오지 못했어요"}
        </p>
      </div>
      <button
        onClick={onConfirm}
        className="rounded-full bg-primary px-8 py-3 text-lg font-bold text-primary-foreground active:scale-95"
      >
        확인
      </button>
    </Popup>
  );
}
