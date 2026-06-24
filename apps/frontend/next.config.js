/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: ブラウザは同一オリジンの /api/* (BFF) のみを叩く。backend の URL は
  // サーバ側 (server-api.ts) が BACKEND_API_URL から読むため、クライアントへ
  // 焼き込む NEXT_PUBLIC_API_URL は不要。
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
