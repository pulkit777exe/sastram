'use client';

import { BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InlinePollButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function InlinePollButton({ onClick, disabled }: InlinePollButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={onClick}
      disabled={disabled}
    >
      <BarChart2 className="h-4 w-4" />
    </Button>
  );
}