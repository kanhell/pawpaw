# 화면 라우팅 (ROUTES)

기획 흐름은 `PLANNING.md`, 데이터는 `DATA_MODEL.md` 참고.
표의 **상태**: `확정` = 코드(`packages/shared/src/routes.ts`)와 페이지가 있음 / `제안` = 기획 반영을 위해 추가를 제안한 화면, 확인 후 확정.

## 플로우

```
스플래시 → 방찾기 / 방만들기(모드 선택)
  → 방설정(미션 부여 방법) → 캐릭터 선택 → 대기실(친구 초대)
  → [미션지정: '서로 정해주기'일 때만] → 사진 인증 주의사항
  → 미션공개(편지) → 미션 진행(사진 업로드) → 결과 대기(n시)
  → 결과/시상식 → 결과 공유
```

- 방만들기에서 모드를 고르고, 방설정에서 미션 부여 방법(정하는 주체 / 공개 범위 / 동일·각자)을 정한다.
- 방찾기로 입장하면 방설정은 건너뛰고 캐릭터 선택으로 간다.
- 초대 링크(`/invite/:roomId/:code`)로 들어온 사람은 닉네임과 동물을 고른 뒤 바로 대기실로 간다. 인앱 브라우저에서 열렸다면 먼저 기본 브라우저로 옮긴다. (`INVITE.md`)
- 미션지정은 `assigner = players`(서로 정해주기)일 때만 거친다. 앱이 정하는 경우는 건너뛴다.
- 결과는 `Room.resultAt`(n시) 이후에만 열린다.

## 라우트 표

| 화면 | 경로 | 상태 | 진입 조건 | 허용 Room 상태 / 단계 |
|---|---|---|---|---|
| 스플래시 | `/` | 확정 | 없음 | - |
| 방찾기 | `/room` | 확정 | User 있음 | - |
| 방만들기 (모드 선택) | `/room/new` | 확정 | User 있음 | - |
| 방설정 | `/room/new/settings` | 확정 | 방만들기 완료 | - |
| 캐릭터 선택 | `/room/:roomId/character` | 제안 | 방 생성 또는 방찾기로 입장 | `waiting` |
| 초대 참가 | `/invite/:roomId/:code` | 확정 | 초대 링크 (로그인은 익명으로 자동) | `waiting` |
| 대기실 | `/room/:roomId/lobby` | 확정 | Player로 참가 | `waiting` |
| 미션지정 | `/room/:roomId/assign` | 확정 | Player, `assigner = players` | `playing` / `assign` |
| 사진 인증 주의사항 | `/room/:roomId/notice` | 제안 | Player | `playing` / `reveal` 직전 |
| 미션공개 | `/room/:roomId/reveal` | 확정 | Player | `playing` / `reveal` |
| 미션 진행 | `/room/:roomId/play` | 확정 | Player | `playing` / `play` |
| 결과 대기 | `/room/:roomId/waiting` | 제안 | Player, 미션 제출 완료 | `playing` / `waitResult` |
| 결과/시상식 | `/room/:roomId/result` | 확정 | Player, `now >= resultAt` | `finished` |
| 결과 공유 | `/room/:roomId/share` | 확정 | Player | `finished` |
| 404 | `*` | 확정 | - | - |

## 가드 규칙

1. **User 가드**: 닉네임이 없으면 스플래시에서 프로필 생성 후 진행한다.
2. **Room 가드**: `:roomId` 하위 경로는 해당 방의 Player여야 접근 가능하다.
3. **상태 가드**: 현재 `Room.status` / `Room.phase`에 맞지 않는 경로는 맞는 경로로 `replace` 이동한다.
4. **결과 시각 가드**: `resultAt` 이전에 결과/시상식·공유로 오면 결과 대기로 보낸다.

## 열린 질문

1. 방만들기가 모드 선택을 겸하는 구성이 맞는지, 모드 선택 화면을 따로 둘지.
2. 사진 인증 주의사항을 화면(`/notice`)으로 둘지, 방설정 마지막의 안내 팝업으로 둘지.
3. 사진 업로드는 미션 진행 화면 안에서 처리하는지, 별도 화면인지.
4. 모드별로 달라지는 화면(선착순 생존 상태, 무한미션 타이머, 1인모드 성장 화면)을 어떻게 분기할지.
