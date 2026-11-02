# 데이터 모델 (DATA_MODEL)

기획은 `PLANNING.md`, 화면은 `ROUTES.md` 참고. 타입 정의는 `packages/shared/src/models.ts`.

## 엔티티 관계

```
User 1 ── N Player N ── 1 Room
Room 1 ── N Round 1 ── N Assignment N ── 1 Mission
Assignment: giver(Player, 없으면 앱) → receiver(Player)
Assignment 1 ── 0..1 Submission
Room 1 ── N Vote N ── 1 Submission
Room 1 ── N Award N ── 1 Player
```

## 열거형

| 이름 | 값 | 설명 |
|---|---|---|
| `GameMode` | `daily` `oneshot` `race` `solo` `endless` | 매일매일 / 일회성 / 선착순 / 1인 / 무한미션 |
| `RoomStatus` | `waiting` `playing` `finished` | 대기 / 진행 / 종료 |
| `RoomPhase` | `settings` `assign` `reveal` `play` `waitResult` | `playing` 안의 단계. `settings`는 방장이 게임 설정을 하는 단계 |
| `MissionAssigner` | `players` `app` | 서로 정해주기 / 앱이 정해주기 |
| `MissionVisibility` | `public` `private` | 미리 전체 공개 / 본인만 확인 |
| `MissionScope` | `same` `different` | 전체 동일 / 각자 다름 |
| `AwardType` | `podium` `fastest` `mostCompleted` `bestMission` `funniest` `hardest` `bestPhoto` `challenger` | 시상 종류 (목록은 확정 아님) |
| `AwardBasis` | `metric` `vote` | 정량 결과 / 투표 |

## 엔티티

### User
| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| nickname | string | |
| animal | AnimalCharacter | 기본 동물 캐릭터 (방에서 따로 고르면 `Player.animal`) |
| createdAt | timestamp | |

### Room
| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| hostId | string | 방장의 User id (Firebase Auth uid) |
| settings | RoomSettings | 모드와 미션 부여 방법 |
| status | RoomStatus | `finished`는 방장이 결과를 먼저 공개하면 바뀐다 (`RESULT_REVEAL.md`) |
| phase | RoomPhase \| null | `status = playing`일 때만 값이 있음. 게임 시작 직후에는 `settings` |
| deadlineAt | timestamp \| null | 미션 수행 마감. 방장이 결과를 먼저 공개하면 그 시각으로 채워진다 |
| resultAt | timestamp \| null | 결과 공개 시각(n시). 게임 설정에서 방장이 정하며, 지금보다 뒤여야 설정을 완료할 수 있음. 비어 있으면 결과는 열리지 않음. 방장이 먼저 공개하면 그 시각으로 바뀐다 |
| createdAt | timestamp | |

### RoomSettings
| 필드 | 타입 | 비고 |
|---|---|---|
| mode | GameMode | |
| assigner | MissionAssigner | |
| visibility | MissionVisibility | |
| scope | MissionScope | |
| durationDays | number \| null | `daily`: 진행 일수 |
| timeLimitSec | number \| null | `endless`: 제한 시간 |

### Player
방 안의 사용자. `User`를 참조한다.

| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| roomId | string | |
| userId | string | |
| animal | AnimalCharacter | 방에서 선택한 동물 캐릭터 |
| isHost | boolean | |
| joinedAt | timestamp | |
| assignmentDone | boolean (선택) | 직접 부여 단계에서 내가 정해줄 미션을 모두 정했는지. 값이 없으면 false. 본인만 `true`로 바꿀 수 있다 |
| submitted | boolean (선택) | 미션 사진을 제출했는지. 값이 없으면 false. 같은 방 멤버 모두(방장 포함)에게 보인다. 사진·경로·시각은 담지 않는다. 본인만, 내 제출 문서가 있을 때 `true`로 바꿀 수 있다 (`RESULT_REVEAL.md`) |

### Round
하루(또는 한 판) 단위. `daily`는 날마다 하나씩, 나머지 모드는 방당 하나.

| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| roomId | string | |
| index | number | 1부터 |
| startsAt | timestamp | |
| endsAt | timestamp \| null | |

### Mission
| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| text | string | |
| category | string | 카테고리 목록 미정 |
| difficulty | number | 난이도 스케일 미정 |
| source | `preset` \| `player` | 기본 제공 / 플레이어가 직접 작성. 직접 정한 미션은 별도 Mission 문서를 만들지 않고 `Assignment.missionText`에 담는다 |
| createdBy | string \| null | 직접 작성한 Player id |

### Assignment
누가 누구에게 어떤 미션을 줬는지.

| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| roomId | string | |
| roundId | string | |
| giverId | string \| null | Player id, 앱이 정한 경우 null. `scope = same`으로 직접 부여하면 방장 |
| receiverId | string | Player id |
| missionId | string \| null | 기본 제공 미션 id. 직접 정한 미션이면 null |
| missionText | string (선택) | 직접 정한 미션 본문(1~60자). `missionId`와 둘 중 하나만 있다 |
| order | number | 무한미션의 순서, 그 외는 1 |
| createdAt | timestamp | |

### Submission
| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| assignmentId | string | |
| ownerId | string | 제출한 Player id (Firebase Auth uid) |
| photoPath | string | 사진 저장 경로. 다운로드 URL은 저장하지 않는다 (`SECURITY.md` 참고) |
| submittedAt | timestamp | 서버 시각 |

### Vote
투표로 수상자를 정하는 시상용.

| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| roomId | string | |
| voterId | string | Player id |
| awardType | AwardType | 어떤 상에 대한 투표인지 |
| submissionId | string | 투표 대상 제출물 |
| createdAt | timestamp | |

### Invite
친구 초대 링크용 코드. 링크는 `/invite/{roomId}/{code}`.

| 필드 | 타입 | 비고 |
|---|---|---|
| code | string | 영숫자 24자. 문서 ID와 같다 |
| createdBy | string | 방장의 User id |
| createdAt | timestamp | 서버 시각 |
| expiresAt | timestamp | 만든 시각 + 24시간 (규칙상 최대 7일) |

방장만 만들고 조회하고 폐기할 수 있다.

### Award
시상 결과.

| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| roomId | string | |
| type | AwardType | |
| playerId | string | 수상자 |
| submissionId | string \| null | 연관 제출물 |
| basis | AwardBasis | 정량 / 투표 |
| rank | 1 \| 2 \| 3 \| null | `podium`일 때 등수 |
| comment | string \| null | 시상 코멘트 |
| createdAt | timestamp | |

## 연출 요소 (데이터 없음)

- 사회자 개미와 베짱이: 시상식 연출용이라 모델에 두지 않는다.

## 보류

- 1인모드 캐릭터 성장(레벨·경험치), 집 꾸미기: 키우기 요소를 추가할 때 설계한다.

## Firestore 저장 구조

`Player`는 문서 ID를 `userId`(= Firebase Auth uid)와 같게 둔다. 보안 규칙이 `members/{uid}` 문서의 존재로 방 멤버를 판단하기 때문이다.

```
users/{uid}                          User
rooms/{roomId}                       Room
rooms/{roomId}/members/{uid}         Player (초대로 참가한 멤버는 inviteCode 필드를 함께 저장)
rooms/{roomId}/invites/{code}        Invite
rooms/{roomId}/rounds/{roundId}      Round
rooms/{roomId}/assignments/{id}      Assignment
rooms/{roomId}/submissions/{id}      Submission (사진은 Cloud Storage)
rooms/{roomId}/votes/{id}            Vote
rooms/{roomId}/awards/{id}           Award
missions/{id}                        Mission (기본 제공 목록)
```

## 열린 질문

1. 시상 종류(`AwardType`) 목록과 각 상의 선정 기준(정량 집계인지 투표인지).
2. 선착순 "한 명 살아남기"의 규칙(탈락 조건, 생존 상태 저장 방식).
3. 매일매일 모드의 보상/벌칙을 데이터로 다룰지.
4. `Room.status`와 `phase`를 둘로 나누는 현재 방식이 맞는지.
5. 모드별 설정(`durationDays`, `timeLimitSec`)을 지금처럼 한 구조에 둘지, 모드별 타입으로 나눌지.
6. 백엔드 저장소(Firestore 등)에 따라 `Player`, `Round`를 Room 하위 컬렉션으로 둘지.
7. 사용자 인증 방식: 익명/게스트 vs 로그인.
8. `User.animal`과 `Player.animal`을 둘 다 둘지, `Player.animal`만 둘지.
9. 게임 설정 변경을 참가자에게 알리는 방식: 현재는 `rooms/{roomId}` 문서 구독으로 실시간 반영한다. 백엔드가 바뀌면 같은 방식이 가능한지 확인한다.
10. 직접 정한 미션을 Mission 문서로 정규화할지(재사용·통계). 지금은 `Assignment.missionText`에 담는다. (`MISSION_ASSIGN.md`)
