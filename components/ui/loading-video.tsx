"use client";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

interface LoadingVideoProps {
  className?: string;
  fullScreen?: boolean;
}

export function LoadingVideo({
  className,
  fullScreen = false,
}: LoadingVideoProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  if (!mounted) {
    setMounted(true);
    return null;
  }

  const videoSrc =
    theme === "dark" ? "/Sastram-Dark.mp4" : "/Sastram-Light.mp4";

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        fullScreen && "fixed inset-0 z-50 bg-background",
        className
      )}
    >
      <video
        autoPlay
        loop
        muted
        playsInline
        className="h-auto w-full max-w-md"
      >
        <source src={videoSrc} type="video/mp4" />
      </video>
    </div>
  );
}