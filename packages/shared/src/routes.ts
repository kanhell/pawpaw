export const ROUTES = {
  home: '/', // 메인 (방만들기 / 방찾기)
  roomList: '/room',
  roomNew: '/room/new',
  roomSettings: '/room/new/settings',
  // 방(대기실). 게임 설정·미션 설정·미션 도착·미션 수행은 이 화면의 팝업이다.
  room: (roomId: string) => `/room/${roomId}`,
  result: (roomId: string) => `/room/${roomId}/result`,
  share: (roomId: string) => `/room/${roomId}/share`,
  invite: (roomId: string, code: string) => `/invite/${roomId}/${code}`,
} as const;
