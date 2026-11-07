# 결과 화면 관련 정리 (친구 확인 필요)

결과 화면(`apps/web/app/room/[roomId]/result/`)을 모드별로 만들면서 정리한 내용이에요.

## 1. firestore.rules: objections 컬렉션 (추가함, 확인 요청)

콘솔에 게시했고 레포 `firestore.rules`에도 같은 블록을 넣었어요. 확인 부탁해요.

- 문서 ID: `{objectorId}_{submissionId}` (반대), `{objectorId}_done` (이의제기 완료 표시)
- 본인 이름으로만 생성, 자기 제출물에는 반대 불가, 수정/삭제 불가

## 2. votes 문서 모양 (models.ts의 Vote 기준)

- 문서 ID: `{voterId}_{funniest|hardest}` (같은 항목 중복 투표 방지)
- 필드: `id, roomId, voterId, awardType, submissionId, createdAt`
- 투표 대상은 사람이 아니라 제출물(submissionId)
- 예전 버전으로 만든 `_funny`/`_hard` 문서는 새 코드가 읽지 않아요 (테스트 방 `P6BAt8...`에 남아 있음)
- 확인 요청: 규칙에서 "자기 제출물에는 투표 불가"를 넣을지

## 3. resultAt

- 현재 마감 시각(deadlineAt)과 같은 값으로 채워지고 있어요. 이 방식을 유지하는지 확인 요청.
- 기획의 "방장이 직접 종료"가 필요하면 방장이 resultAt을 현재 시각으로 바꾸는 버튼이 필요해요. (방 수정은 이미 방장만 가능)

## 4. RoomSettings 필드 추가 제안

- `survivorCount: number | null` — 선착순 모드 생존자 수 (없으면 결과 화면은 3으로 처리)

## 5. 선착순 다음 라운드

- 방장이 생존자끼리 / 탈락자끼리 / 직접 선택을 고르는 화면까지 만들었고, 저장은 아직 없어요.
- 필요한 것: 새 round 문서, 선택된 참가자에게만 assignment 생성, rounds/assignments 규칙 확인.

## 6. 방장이 미션을 정하는 경우 (심판)

- MissionAssigner에 'host' 값이 없어요 ('players' | 'app'만 있음).
- 방장 판정이면 과반 이의제기 대신 방장이 성공/실패를 정하는 필드가 Submission에 필요해요 (예: `verdict: 'pass' | 'fail' | null`).

## 7. 기타

- 사진 미제출자가 있어도 마감 후 결과 단계로 넘어가야 해요. 지금은 이의제기/투표를 전원이 끝내야 넘어가요.
- `solo`는 `daily`에 합쳐져 있어서 결과 화면은 daily와 같아요. `GameMode`에서 `solo`를 지울지 확인 요청.
- 동점일 때 공동 수상 여부.