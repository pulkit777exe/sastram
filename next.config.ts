import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.blob.vercel-storage.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dgram: false,
        child_process: false,
        worker_threads: false,
        path: false,
        os: false,
      };

      // Treat server-only packages as external on the client to prevent bundling
      config.externals = config.externals || [];
      config.externals.push(
        // Node built-ins that shouldn't be bundled
        'fs',
        'net',
        'tls',
        'dgram',
        'child_process',
        'worker_threads',
        'path',
        'os',
        'url',
        // Server-only npm packages that depend on Node built-ins
        'nodemailer',
        'bullmq',
        'ioredis',
        'native-dns',
        '@prisma/client',
        '@prisma/adapter-neon',
        '@neondatabase/serverless',
        'ws',
        '@google/generative-ai',
        'better-auth',
        '@upstash/ratelimit',
        '@upstash/redis',
        '@vercel/blob'
      );
    }
    return config;
  },
};

const sentryConfig = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  wideOrientation: true,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  webpack: {
    automaticVercelMonitors: true,
  },
};

export default withSentryConfig(nextConfig, sentryConfig);