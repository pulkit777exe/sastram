'use client';

import { FileIcon, Download } from 'lucide-react';
import Image from 'next/image';
import type { Attachment } from '@/lib/types/index';
import React from 'react';

interface AttachmentItemProps {
  file: Attachment;
}

export const AttachmentItem = React.memo(function AttachmentItem({ file }: AttachmentItemProps) {
  const isImage =
    file.type === 'IMAGE' || (file.type && (file.type.startsWith('image/') || file.type === 'GIF'));

  if (isImage) {
    return (
      <div className="relative group overflow-hidden rounded-lg border">
        <Image
          src={file.url}
          alt={file.name || 'attachment'}
          width={200}
          height={150}
          className="max-w-[200px] max-h-[150px] object-cover hover:scale-105 transition-transform duration-300"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border transition-colors group">
      <div className="p-1.5 rounded-md border shadow-sm text-muted-foreground">
        <FileIcon size={14} />
      </div>
      <div className="max-w-[120px]">
        <p className="text-xs font-medium text-foreground truncate">{file.name || 'File'}</p>
        <p className="text-[10px] text-muted-foreground">
          {file.type?.split('/').pop()?.toUpperCase()}
        </p>
      </div>
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-1 p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100"
      >
        <Download size={12} />
      </a>
    </div>
  );
});