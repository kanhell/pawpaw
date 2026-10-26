# 디자인 토큰 (DESIGN_TOKENS)

정의 위치: `apps/web/app/globals.css`의 `@theme` 블록 (Tailwind v4).
값은 결과/시상식 화면에서 쓰던 색·모서리·그림자를 의미 이름으로 정리한 것이다.

## 규칙

1. 컴포넌트에서는 **의미 토큰만** 사용한다. (`bg-red-500` ❌ → `bg-primary` ✅)
2. 새 토큰은 `globals.css`에만 추가하고, 이 문서 표도 함께 갱신한다.
3. 다크 모드는 아직 지원하지 않는다. 지원 시 `@media (prefers-color-scheme: dark)`에서 색 토큰을 재정의한다.

## Color

| 토큰 | 값 | 클래스 예 | 용도 |
|---|---|---|---|
| `--color-canvas` | `#fffbeb` | `bg-canvas` | 화면 배경 |
| `--color-surface` | `#ffffff` | `bg-surface` | 카드·시트 배경 |
| `--color-primary` | `#ef4444` | `bg-primary` | 주요 버튼·강조 |
| `--color-primary-foreground` | `#ffffff` | `text-primary-foreground` | primary 위의 글자 |
| `--color-ink` | `#171717` | `text-ink` | 기본 글자 |
| `--color-ink-muted` | `#4b5563` | `text-ink-muted` | 보조 글자 |
| `--color-ink-subtle` | `#6b7280` | `text-ink-subtle` | 가장 약한 글자 |

## Radius

| 토큰 | 값 | 클래스 | 용도 |
|---|---|---|---|
| `--radius-card` | `1rem` | `rounded-card` | 리스트 항목, 일반 카드 |
| `--radius-sheet` | `1.5rem` | `rounded-sheet` | 큰 카드(공유 카드 등) |
| (기본) | - | `rounded-full` | 버튼(pill) |

## Shadow

| 토큰 | 클래스 | 용도 |
|---|---|---|
| `--shadow-card` | `shadow-card` | 일반 카드 |
| `--shadow-float` | `shadow-float` | 떠 있는 큰 카드 |

## Layout

| 토큰 | 값 | 클래스 | 용도 |
|---|---|---|---|
| `--container-app` | `28rem` | `max-w-app` | 모바일 앱 폭 |

## Typography

- 폰트: Geist(영문) → Pretendard → Apple SD Gothic Neo → Malgun Gothic → sans-serif
- 글자 크기·굵기·간격은 Tailwind 기본 스케일을 그대로 사용한다.
