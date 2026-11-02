# 미션 부여 (MISSION_ASSIGN)

기획은 `PLANNING.md`의 "미션 부여 방법 결정", 화면은 `ROUTES.md`, 데이터는 `DATA_MODEL.md`, 보안은 `SECURITY.md` 참고.
게임 설정(`/room/:roomId/settings`)에서 방장이 정한 값이 미션지정(`/room/:roomId/assign`)에서 실제로 어떻게 쓰이는지 정리한다.

## 설정값이 반영되는 곳

| 설정 | 값 | 반영되는 동작 |
|---|---|---|
| `assigner` | `app` | 방장이 **미션 뽑기**를 누르면 앱이 모두의 미션을 정한다. |
| | `players` | 플레이어가 직접 미션을 적는다. (아래 "직접 부여") |
| `scope` | `different` | 사람마다 다른 미션. `app`이면 **서로 겹치지 않게** 뽑고, `players`면 각자 다음 사람에게 적어 준다. |
| | `same` | 모두가 같은 미션. `app`이면 앱이 하나를 뽑고, `players`면 방장이 하나를 적는다. |
| `visibility` | `private` | 미션 공개 후에도 내 미션만 보인다. |
| | `public` | 미션 공개 후 모두의 미션 목록(받는 사람, 직접 부여면 정해준 사람)이 보인다. |
| `resultAt` | 시각 | 이 시각 이후에 결과가 열린다. 게임 설정에서 지금보다 뒤로 정해야 설정을 마칠 수 있다. |

## 흐름

```
게임 설정 완료 (phase = assign)
 ├─ assigner = app
 │    방장: 미션 뽑기 → 배정 문서를 한 번에 만들고 phase = play
 └─ assigner = players
      scope = different: 각자 "다음 사람"에게 줄 미션을 적는다 → 모두 정하면 방장이 미션 공개하기 → phase = play
      scope = same:      방장이 모두가 할 미션 하나를 적는다   → 방장이 미션 공개하기 → phase = play
phase = play: 받은 미션이 보이고, 미션 하러 가기(사진 업로드)로 이어진다
```

- `phase = assign`인 동안에는 받은 미션이 이미 만들어져 있어도 화면에서 숨긴다. (읽기 자체를 규칙으로 막지는 않는다. 아래 "한계")
- 직접 부여 화면에는 사진 인증 안내(`PhotoNotice`)를 항상 보여준다.

## 앱이 정해주기: 겹치지 않게

- `scope = different`이면 미션 목록을 섞은 뒤 앞에서 인원수만큼 뽑는다. (복원 추출이 아니므로 겹치지 않는다) 구현: `pickDistinctMissions` (`apps/web/src/lib/missions.ts`).
- 준비된 미션(`PRESET_MISSIONS`, 현재 13개)보다 인원이 많으면 겹칠 수밖에 없다. 이 경우 **뽑지 않는다**.
  - 게임 설정에서 `app + different`인데 인원이 미션 수를 넘으면 **설정 완료**가 막히고 안내가 나온다.
  - 미션지정 화면에서도 한 번 더 확인하고, 저장소 함수(`assignRandomMissions`)는 `MissionPoolError`를 던진다.
  - 해결 방법: 인원을 줄이거나, `scope = same` / `assigner = players`로 바꾸거나, 기본 제공 미션을 늘린다.
- `scope = same`이면 미션 하나를 뽑아 모두에게 준다. 이것은 "겹침"이 아니라 설정에 따른 의도된 동작이다.

## 직접 부여

### 누가 누구에게 주나 (`scope = different`)

- 참가 시각 순서(같으면 id 순)로 줄을 세우고, 각자 **다음 사람**에게 준다. 마지막 사람은 첫 사람에게 준다. (`PLANNING.md`의 "오른쪽 사람의 미션을 내가 정해주기") 구현: `apps/web/src/lib/pairing.ts`.
- 모두가 정확히 한 번씩 받고, 자기 자신에게 주지 않는다. (혼자일 때만 자기 자신)
- 게임 시작 이후에는 새 참가를 받지 않으므로 순서는 바뀌지 않는다.

### 저장

- 받는 사람마다 `rooms/{roomId}/assignments/a-{받는사람 uid}` 문서를 만든다. 같은 문서에는 한 번만 만들 수 있다. (update 금지)
- 직접 적은 미션은 별도 Mission 문서 없이 `Assignment.missionText`(1~60자)에 담는다. `missionId`와 둘 중 하나만 있다.
- 정한 사람은 같은 batch에서 자기 `members/{uid}.assignmentDone = true`를 저장한다. 이것으로 진행 현황(✅/⏳)을 보여준다. (참가자는 남의 배정을 읽을 수 없으므로 별도 표시가 필요하다)
- `scope = same`이면 방장이 모든 멤버의 배정 문서를 한 batch로 만들고, `giverId`는 방장이다.

### 미션 공개

- 방장의 **미션 공개하기**는 모두 정했을 때만 켜진다. (`different`: 전원 `assignmentDone`, `same`: 방장 `assignmentDone`)
- 누르면 `rounds/r1`을 만들고 `status = playing`, `phase = play`로 바꾼다. 모두의 화면이 받은 미션으로 바뀐다.

## 보안 규칙 (`firestore.rules`)

| 대상 | 규칙 |
|---|---|
| 배정 만들기 | 미션지정 단계(`phase = assign`)에서만. 허용 필드만 사용하고, `id`는 문서 ID, `order`는 1, `createdAt`은 서버 시각. |
| 앱이 정하는 방식 | 방장만, `giverId`는 null, `missionId`는 문자열이고 `missionText`는 없음. |
| 직접 부여 | `giverId`가 본인, `missionText`는 1~60자, `missionId`는 없음. `scope = same`이면 방장만. |
| 배정 수정·삭제 | 불가 |
| `assignmentDone` | 본인 문서만, `true`로만, 미션지정 단계에서만 바꿀 수 있다. (`animal`과 함께 바꿀 수 있는 키는 이 둘뿐) |
| 배정 읽기 | 기존과 같다. 받는 사람, 준 사람, 공개 범위가 `public`인 방, 결과 공개 이후. |

## 배포 전 확인

`firestore.rules`를 다시 게시한 뒤 개발용 프로젝트에서 확인한다. 방법은 `SECURITY.md`의 "배포 전 확인"과 같다. (일반 창·시크릿 창, 규칙 플레이그라운드)

| # | 상황 | 기대 결과 |
|---|---|---|
| M1 | 방장이 아닌 사용자가 앱 방식(`giverId = null`, `missionId`) 배정 만들기 | 거부 |
| M2 | 직접 부여에서 `giverId`가 내가 아닌 배정 만들기 | 거부 |
| M3 | `scope = same`인데 방장이 아닌 사용자가 배정 만들기 | 거부 |
| M4 | `missionText`가 비었거나 61자 이상 | 거부 |
| M5 | `missionId`와 `missionText`를 둘 다 넣거나 둘 다 빼기 | 거부 |
| M6 | `phase`가 `assign`이 아닐 때(`settings`, `play`) 배정 만들기 | 거부 |
| M7 | 이미 있는 배정 문서 덮어쓰기·수정·삭제 | 거부 |
| M8 | 남의 `members` 문서의 `assignmentDone` 바꾸기, `false`로 바꾸기, 다른 키 바꾸기 | 거부 |
| M9 | 미션 공개 전·후, `private`인 방에서 남의 배정 읽기 | 거부 (결과 공개 전) |
| M10 | `public`인 방에서 배정 전체 조회 | 허용 |
| M11 | 정상적인 직접 부여(다음 사람에게 1~60자) | 허용 |
| M12 | `scope = same`, 방장이 전원에게 같은 미션 부여 | 허용 |

## 한계와 열린 질문

- 직접 부여한 배정 문서는 만들어지는 즉시 받는 사람이 **규칙상 읽을 수 있다**. 화면은 `phase = play`가 되기 전까지 숨기지만, 개발자 도구로 보면 미리 알 수 있다. 진짜 비밀이 필요하면 공개 시점까지 배정 문서를 만들지 않거나(방장 기기에 모아 두기), 서버(Cloud Function)가 공개해야 한다.
- 직접 적은 미션 본문은 길이만 검사한다. 내용 검수나 신고 기능은 없다.
- 규칙은 받는 사람이 방 멤버인지 확인하지 않는다. (한 batch에서 확인할 수 있는 문서 수 제한 때문이다) 악의적인 멤버가 멤버가 아닌 uid로 배정을 만들 수는 있지만, 아무도 읽지 못한다.
- 누군가 미션을 정하지 않고 나가면 미션 공개가 막힌다. 방장이 대신 정하거나 건너뛰는 방법이 필요하다.
- 같은 사람이 `giverId`를 속여 남의 배정 문서 ID를 선점할 수 있다. 규칙은 "다음 사람"인지 검증하지 않는다. (친구끼리 쓰는 앱이라 허용하는 범위, 필요하면 Cloud Function으로 옮긴다)
- 미션 목록이 13개뿐이다. 인원이 많은 방에서 `app + different`를 쓰려면 목록을 늘려야 한다.
