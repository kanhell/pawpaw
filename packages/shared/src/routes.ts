export const ROUTES = {
  splash: '/',
  roomList: '/room',
  roomNew: '/room/new',
  roomSettings: '/room/new/settings',
  lobby: (roomId: string) => `/room/${roomId}/lobby`,
  assign: (roomId: string) => `/room/${roomId}/assign`,
  reveal: (roomId: string) => `/room/${roomId}/reveal`,
  play: (roomId: string) => `/room/${roomId}/play`,
  result: (roomId: string) => `/room/${roomId}/result`,
  share: (roomId: string) => `/room/${roomId}/share`,
  invite: (roomId: string, code: string) => `/invite/${roomId}/${code}`,
} as const;
