import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  webpack: (config, { isServer }) => {
    // Fix for webpack module resolution issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    
    return config;
  },
  // Disable React strict mode temporarily to avoid hydration issues
  reactStrictMode: false,
};

export default nextConfig;
