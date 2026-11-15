# 포포 (pawpaw)

친구들과 서로 미션을 주고, 사진으로 인증하고, 정해진 시각에 함께 결과를 확인하는 웹 게임입니다.
동물 발바닥(= 도장) 컨셉으로, 학교 끝나고 놀이터에서 놀던 기억을 떠올리게 하는 것이 목표입니다.

## 게임 흐름

1. **방 만들기**: 닉네임과 동물 캐릭터를 정하고 친구를 초대합니다.
2. **게임 설정**: 방장이 미션 부여 방법(앱이 정하기 / 서로 정해주기), 공개 범위, 결과 공개 시각을 정합니다.
3. **미션 도착**: 각자 편지로 미션을 받습니다.
4. **미션 수행**: 미션을 하고 사진을 올립니다.
5. **결과**: 결과 공개 시각이 되면(또는 방장이 먼저 공개하면) 투표, 시상식, 결과 카드를 봅니다.

자세한 기획은 [docs/PLANNING.md](docs/PLANNING.md)를 참고하세요.

## 기술 스택

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS 4**, **framer-motion**
- **Firebase**: 익명 Authentication, Firestore, Cloud Storage
- **pnpm workspace** 모노레포, 테스트는 **Vitest**

## 폴더 구조

```
apps/web/            Next.js 웹 앱
  app/               라우트 (페이지는 src/screens의 화면을 불러옴)
  src/screens/       화면 컴포넌트 (room/ 아래는 방 화면 위 팝업)
  src/components/    공통 컴포넌트
  src/lib/           Firebase 연동, 미션, 초대 코드 등 로직
  public/            배경, 캐릭터 이미지
packages/shared/     웹과 공유하는 데이터 모델, 라우트 상수
docs/                기획, 데이터 모델, 보안, 설정 문서
firestore.rules      Firestore 보안 규칙
storage.rules        Storage 보안 규칙
cors.json            Storage 버킷 CORS 설정
```

## 시작하기

필요한 것: Node.js 20 이상, pnpm, Firebase 프로젝트

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # Firebase 웹 앱 설정값 채우기
pnpm dev                                        # http://localhost:3000
```

Firebase 프로젝트 준비(익명 로그인, Firestore, Storage, 규칙, CORS)는 [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)를 따라 하세요.

## 명령어

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | 개발 서버 실행 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm lint` | ESLint 검사 |
| `pnpm --filter web exec vitest run` | 테스트 실행 |

## 배포

1. 호스팅 서비스에 `apps/web/.env.example`에 있는 `NEXT_PUBLIC_FIREBASE_*` 환경변수를 등록합니다.
2. `firestore.rules`, `storage.rules`를 운영 Firebase 프로젝트에 배포합니다.
3. `cors.json`의 `origin`에 운영 도메인을 추가하고 Storage 버킷에 다시 적용합니다.
4. Firebase Authentication의 승인된 도메인에 운영 도메인을 추가합니다.

## 문서

| 문서 | 내용 |
|---|---|
| [PLANNING.md](docs/PLANNING.md) | 기획, 미션 예시 |
| [ROUTES.md](docs/ROUTES.md) | 화면 흐름과 라우트 |
| [DATA_MODEL.md](docs/DATA_MODEL.md) | Firestore 데이터 구조 |
| [MISSION_ASSIGN.md](docs/MISSION_ASSIGN.md) | 미션 부여 방식 |
| [RESULT_REVEAL.md](docs/RESULT_REVEAL.md) | 결과 공개 규칙 |
| [INVITE.md](docs/INVITE.md) | 초대 링크, 인앱 브라우저 처리 |
| [SECURITY.md](docs/SECURITY.md) | 보안 설계 |
| [FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) | Firebase 설정 |
| [DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md) | 디자인 토큰 |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | 커밋 규칙 등 기여 가이드 |
