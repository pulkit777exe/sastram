'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

export function ThemeVideo({ className }: { className?: string }) {
  const { theme } = useTheme();
  const videoSrc = theme === 'dark' ? '/sastram-video-dark.mp4' : '/sastram-video-light.mp4';
  const posterSrc = theme === 'dark' ? '/sastram-image-dark.png' : '/sastram-image-light.png';
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVisible) return;

    video.play().catch(() => {
      // Autoplay blocked — user interaction needed
    });
  }, [isVisible]);

  return (
    <div className={className}>
      <div className="relative rounded-2xl border border-border bg-background overflow-hidden shadow-xl shadow-black/5">
        <video
          ref={videoRef}
          loop
          muted
          playsInline
          preload={isVisible ? 'auto' : 'none'}
          className="w-full h-auto"
          poster={posterSrc}
        >
          {isVisible && <source src={videoSrc} type="video/mp4" suppressHydrationWarning />}
        </video>
      </div>
    </div>
  );
}
