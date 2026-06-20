'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { AvatarFallback } from '@/components/ui/avatar';

interface DeletedMessagePlaceholderProps {
  originalContent: string;
  canViewOriginal: boolean;
}

export function DeletedMessagePlaceholder({
  originalContent,
  canViewOriginal,
}: DeletedMessagePlaceholderProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <div className="py-2 flex items-start gap-3 opacity-70">
      <Avatar className="w-8 h-8 shrink-0 mt-0.5">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">?</AvatarFallback>
      </Avatar>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground italic">This message was removed</p>
        {canViewOriginal && (
          <>
            <button
              type="button"
              onClick={() => setShowOriginal((prev) => !prev)}
              className="text-[11px] text-brand hover:text-brand underline"
            >
              {showOriginal ? 'Hide original' : 'View original'}
            </button>
            {showOriginal && (
              <p className="text-xs text-foreground/70 blur-sm hover:blur-none transition">
                {originalContent}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}