'use client';

import { BarChart2 } from 'lucide-react';
import { PressDepth } from '@/components/ui/button-press-depth';

interface InlinePollButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function InlinePollButton({ onClick, disabled }: InlinePollButtonProps) {
  return (
    <PressDepth
      type="button"
      className="h-8 w-8 p-0"
      onClick={onClick}
      disabled={disabled}
    >
      <BarChart2 className="h-4 w-4" />
    </PressDepth>
  );
}