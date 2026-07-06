import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@tanstack/react-virtual', 'date-fns', 'framer-motion'],
  },
  async headers() {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'} wss: ws: https://api.gemini.google.com https://api.openai.com https://api.exa.ai https://api.tavily.com https://*.upstash.io`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: cspDirectives },
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
        'resend',
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