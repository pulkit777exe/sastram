'use client';

import { FileIcon, Download, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import Image from 'next/image';
import type { Attachment } from '@/lib/types/index';
import React, { useRef, useState } from 'react';

interface AttachmentItemProps {
  file: Attachment;
}

export const AttachmentItem = React.memo(function AttachmentItem({ file }: AttachmentItemProps) {
  const isImage = file.type === 'IMAGE' || file.type === 'GIF' || (file.type && file.type.startsWith('image/'));
  const isVideo = file.type === 'VIDEO' || (file.type && file.type.startsWith('video/'));

  if (isImage) {
    return (
       <div className="relative group animate-in fade-in duration-200 overflow-hidden rounded-[10px] border border-border/50 bg-(--surface) max-w-[260px] transition-all duration-300 hover:shadow-linear-md hover:border-border">
        <Image
          src={file.url}
          alt={file.name || 'attachment'}
          width={260}
          height={180}
          className="w-full h-auto max-h-[180px] object-cover transition-transform duration-500 ease-out group-hover:scale-102"
        />
        {file.name && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <p className="text-[10px] text-white truncate font-medium">{file.name}</p>
          </div>
        )}
      </div>
    );
  }

  if (isVideo) {
    return <VideoPlayer file={file} />;
  }

  return (
    <div className="flex animate-in fade-in duration-200 items-center gap-3 rounded-[10px] border border-border/60 bg-(--surface) p-2.5 transition-all duration-200 hover:border-border hover:shadow-linear-sm group max-w-[280px]">
      <div className="p-2 rounded-lg border border-border/50 bg-(--bg) text-muted-foreground shadow-linear-sm transition-transform duration-200 group-hover:scale-105">
        <FileIcon size={16} className="text-(--text) opacity-80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-(--text) truncate">{file.name || 'File Attachment'}</p>
        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mt-0.5">
          {file.type?.split('/').pop()?.toUpperCase() || 'FILE'}
          {file.size ? ` • ${(Number(file.size) / (1024 * 1024)).toFixed(1)} MB` : ''}
        </p>
      </div>
      <a
        href={file.url}
        download={file.name || 'attachment'}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded-full transition-all duration-200 opacity-60 hover:opacity-100 hover:bg-(--bg) text-(--text) border border-transparent hover:border-border"
        title="Download file"
      >
        <Download size={14} />
      </a>
    </div>
  );
});

function VideoPlayer({ file }: { file: Attachment }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div 
      className="relative group animate-in fade-in duration-200 overflow-hidden rounded-[10px] border border-border/50 bg-black max-w-[320px] aspect-video cursor-pointer"
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={file.url}
        preload="metadata"
        loop
        className="w-full h-full object-cover"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* Overlay controls */}
      <div className="absolute inset-0 bg-black/20 opacity-100 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
          >
            {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/90 font-medium truncate max-w-[200px] drop-shadow-sm">
            {file.name || 'Video'}
          </span>
          <button
            type="button"
            className="p-2 rounded-full bg-brand text-white shadow-lg hover:scale-105 transition-transform"
          >
            {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          </button>
        </div>
      </div>
    </div>
  );
}