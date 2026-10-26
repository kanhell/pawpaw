# 기여 가이드 (CONTRIBUTING)

## 커밋 메시지

커밋 메시지는 **영어**로 작성한다.

```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional)>
```

예시:

```
feat(web): add result screen

- Implement opening, awards, ranking, and share card steps
- Use mock data for awards and ranking

Refs: #12
```

scope가 필요 없는 변경(루트 설정 등)은 scope를 생략한다.

```
chore: set up monorepo workspace
```

### type

| type | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `docs` | 문서 추가·수정 |
| `style` | 동작 변화 없는 포맷·스타일 수정 |
| `refactor` | 동작 변화 없는 구조 개선 |
| `test` | 테스트 추가·수정 |
| `chore` | 빌드·패키지·설정 변경 |
| `ci` | CI 설정 변경 |

### scope (선택)

| scope | 대상 |
|---|---|
| `web` | `apps/web` |
| `shared` | `packages/shared` |

### subject 규칙

- 50자 이내
- 명령형 동사 원형으로 시작한다. (`add`, `fix`, `update`, `remove`)
- 소문자로 시작하고 마침표를 붙이지 않는다.
- 무엇을 했는지만 간결하게 쓴다.

### body 규칙

- subject와 한 줄 띄운다.
- 한 줄 72자 내외
- "how"보다 "what"과 "why"를 쓴다.
- 여러 줄은 `-`로 나눈다.

### footer

- 이슈 번호는 `Refs: #12`, 해결하는 경우 `Closes: #12`

## 커밋 단위

- 하나의 커밋에는 하나의 목적만 담는다.
- 설정 변경, 문서, 기능 구현은 서로 다른 커밋으로 나눈다.
- 동작하지 않는 상태로 커밋하지 않는다. (최소한 `pnpm build`가 통과해야 한다)

## 브랜치

- `main`: 항상 동작하는 상태를 유지한다.
- 작업 브랜치: `<type>/<description>` (예: `feat/room-lobby`, `fix/result-share`, `docs/data-model`)
- description은 영어 소문자와 `-`로 쓴다.

## Pull Request

- 제목은 커밋 subject 규칙을 따른다.
- 기본 병합 방식은 squash merge이다.
- PR 템플릿은 `.github/pull_request_template.md`에 둔다. (추가 예정)

## 문서

- 기획: `docs/PLANNING.md`
- 데이터 모델: `docs/DATA_MODEL.md`
- 라우팅: `docs/ROUTES.md`
- 디자인 토큰: `docs/DESIGN_TOKENS.md`
- 코드와 문서가 어긋나면 문서를 먼저 고친다.
