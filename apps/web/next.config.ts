import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 예전 단계별 주소는 모두 방 화면 하나로 합쳤다. (docs/ROUTES.md)
  async redirects() {
    return [
      {
        source: "/room/:roomId/:step(lobby|settings|assign|reveal|play)",
        destination: "/room/:roomId",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
