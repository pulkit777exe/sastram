'use client';

import { useTheme } from 'next-themes';

export function ThemeVideo({ className }: { className?: string }) {
  const { theme } = useTheme();
  const videoSrc = theme === 'dark' ? '/sastram-video-dark.mp4' : '/sastram-video-light.mp4';
  const posterSrc = theme === 'dark' ? '/sastram-image-dark.png' : '/sastram-image-light.png';

  return (
    <div className={className}>
      <div className="relative rounded-2xl border border-border bg-background overflow-hidden shadow-xl shadow-black/5">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-auto"
          poster={posterSrc}
        >
          <source src={videoSrc} type="video/mp4" suppressHydrationWarning />
        </video>
      </div>
    </div>
  );
}
