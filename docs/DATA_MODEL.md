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
| `RoomPhase` | `assign` `reveal` `play` `waitResult` | `playing` 안의 단계 |
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
| settings | RoomSettings | 모드와 미션 부여 방법 |
| status | RoomStatus | |
| phase | RoomPhase \| null | `status = playing`일 때만 값이 있음 |
| deadlineAt | timestamp \| null | 미션 수행 마감 |
| resultAt | timestamp \| null | 결과 공개 시각(n시) |
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
| source | `preset` \| `player` | 기본 제공 / 플레이어가 직접 작성 |
| createdBy | string \| null | 직접 작성한 Player id |

### Assignment
누가 누구에게 어떤 미션을 줬는지.

| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| roomId | string | |
| roundId | string | |
| giverId | string \| null | Player id, 앱이 정한 경우 null |
| receiverId | string | Player id |
| missionId | string | |
| order | number | 무한미션의 순서, 그 외는 1 |
| createdAt | timestamp | |

### Submission
| 필드 | 타입 | 비고 |
|---|---|---|
| id | string | |
| assignmentId | string | |
| photoUrl | string | 사진 인증이므로 필수 |
| submittedAt | timestamp | |

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

## 열린 질문

1. 시상 종류(`AwardType`) 목록과 각 상의 선정 기준(정량 집계인지 투표인지).
2. 선착순 "한 명 살아남기"의 규칙(탈락 조건, 생존 상태 저장 방식).
3. 매일매일 모드의 보상/벌칙을 데이터로 다룰지.
4. `Room.status`와 `phase`를 둘로 나누는 현재 방식이 맞는지.
5. 모드별 설정(`durationDays`, `timeLimitSec`)을 지금처럼 한 구조에 둘지, 모드별 타입으로 나눌지.
6. 백엔드 저장소(Firestore 등)에 따라 `Player`, `Round`를 Room 하위 컬렉션으로 둘지.
7. 사용자 인증 방식: 익명/게스트 vs 로그인.
8. `User.animal`과 `Player.animal`을 둘 다 둘지, `Player.animal`만 둘지.
