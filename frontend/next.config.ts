import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080',
      },
    ],
  },
  async rewrites() {
    return [
      { source: '/upload/:path*', destination: `${API_URL}/upload/:path*` },
      { source: '/rss.xml', destination: `${API_URL}/rss.xml` },
      { source: '/sitemap.xml', destination: `${API_URL}/sitemap.xml` },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
