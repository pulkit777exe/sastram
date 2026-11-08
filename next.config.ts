import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

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
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

// Vercel ignores the standalone directory and building it causes ENOENT on
// next-server.js.nft.json. Only enable for Docker / self-hosted deploys.
const isVercel = process.env.VERCEL === '1';

const baseNextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // React Compiler (stable in Next 16) auto-memoizes components; the native Rust
  // port runs inside Turbopack so no babel-plugin-react-compiler dependency is needed.
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  turbopack: {
    root: process.cwd(),
  },
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
    optimizePackageImports: ['lucide-react', '@tanstack/react-virtual', 'date-fns', 'motion'],
    // Native Rust React Compiler inside Turbopack (avoids the slower Babel transform).
    turbopackRustReactCompiler: true,
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
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

      // Server-only packages must not be bundled for the client
      config.externals = config.externals || [];
      config.externals.push(
        'resend',
        '@prisma/client',
        '@prisma/adapter-neon',
        '@prisma/adapter-pg',
        '@neondatabase/serverless',
        'pg',
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

const nextConfig: NextConfig = isVercel
  ? baseNextConfig
  : { ...baseNextConfig, output: 'standalone' as const };

const hasSentryReleaseCreds = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

const sentryConfig = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  // Avoid 403/build noise when release credentials are unavailable; set
  // SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT in CI/production builds.
  sourcemaps: {
    disable: !hasSentryReleaseCreds,
  },
  // Sentry 11+: span-based Vercel cron monitoring (replaces legacy webpack automaticVercelMonitors).
  _experimental: {
    vercelCronsMonitoring: true,
  },
};

export default withSentryConfig(nextConfig, sentryConfig);
