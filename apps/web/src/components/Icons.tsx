// 색 없는 선 아이콘. 글자색(currentColor)을 따른다.
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "size-6"}
    >
      {children}
    </svg>
  );
}

// 초대: 편지 봉투
export function InviteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  );
}

// 멤버: 두 사람
export function MembersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Svg>
  );
}

// 미션: 깃발
export function MissionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </Svg>
  );
}

// 결과 공개: 트로피 (결과가 열리면 시상식이 함께 열린다)
export function RevealIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4.4" />
      <path d="M17 6h2.5a2.5 2.5 0 0 1-2.6 4.4" />
      <path d="M12 14v3" />
      <path d="M8 20h8" />
      <path d="M9.5 17h5l.5 3h-6l.5-3Z" />
    </Svg>
  );
}

// 붐따: 엄지 내리기
export function ThumbDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 14V3" />
      <path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.5l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.7 1L12 22a3.1 3.1 0 0 1-3-3.9Z" />
    </Svg>
  );
}

// 앱 로고: 발바닥. 선이 아니라 채워서 그리며, 글자색(currentColor)을 따른다.
export function PawIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className ?? "size-6"}>
      <ellipse cx="6" cy="10" rx="2.1" ry="2.7" transform="rotate(-20 6 10)" />
      <ellipse cx="9.6" cy="5.6" rx="2.1" ry="2.8" transform="rotate(-6 9.6 5.6)" />
      <ellipse cx="14.4" cy="5.6" rx="2.1" ry="2.8" transform="rotate(6 14.4 5.6)" />
      <ellipse cx="18" cy="10" rx="2.1" ry="2.7" transform="rotate(20 18 10)" />
      <path d="M12 11c-2.6 0-5.5 3.2-5.5 6 0 1.7 1.2 2.6 2.7 2.6 1.1 0 1.8-.5 2.8-.5s1.7.5 2.8.5c1.5 0 2.7-.9 2.7-2.6 0-2.8-2.9-6-5.5-6Z" />
    </svg>
  );
}
