import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sastram - AI-Powered Discussion & Research Platform',
    short_name: 'Sastram',
    description:
      'Sastram is an AI-powered discussion and research platform. Verified resolutions, thread DNA, AI-assisted search, and collaborative collections.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f0f14',
    icons: [
      {
        src: '/light.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/favicon.ico',
        sizes: '32x32',
        type: 'image/x-icon',
      },
    ],
  };
}