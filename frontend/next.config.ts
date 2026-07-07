import type { NextConfig } from "next";

// Internal URL for the Go API backend (used by Next.js rewrites/proxy)
const API_UPSTREAM = process.env.API_UPSTREAM_URL || 'http://localhost:8080';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8080',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' ${API_UPSTREAM}; frame-src 'none'; object-src 'none'` },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_UPSTREAM}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API_UPSTREAM}/uploads/:path*` },
      { source: '/rss.xml', destination: `${API_UPSTREAM}/rss.xml` },
      { source: '/sitemap.xml', destination: `${API_UPSTREAM}/sitemap.xml` },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
