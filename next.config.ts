import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// NOTE: The active CSP is set in proxy.ts (per-request, with a nonce for
// script-src). This file no longer sets a CSP to avoid sending two conflicting
// CSP headers. HSTS is kept here for non-proxied static responses; the proxy
// sets a stronger HSTS in production.

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=300',
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  redirects: async () => [
    {
      source: '/dashboard/threads/thread/:slug',
      destination: '/dashboard/threads/:slug',
      permanent: true,
    },
    {
      source: '/thread/:slug',
      destination: '/dashboard/threads/:slug',
      permanent: true,
    },
  ],
  experimental: {
    optimizePackageImports: ['lucide-react', '@tanstack/react-virtual', 'date-fns', 'framer-motion'],
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

      config.externals = config.externals || [];
      config.externals.push(
        'fs',
        'net',
        'tls',
        'dgram',
        'child_process',
        'worker_threads',
        'path',
        'os',
        'url',
        'resend',
        'ioredis',
        'native-dns',
        '@prisma/client',
        '@prisma/adapter-neon',
        '@neondatabase/serverless',
        'ws',
        '@google/genai',
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