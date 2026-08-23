'use client';

import { BarChart2 } from 'lucide-react';
interface InlinePollButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function InlinePollButton({ onClick, disabled }: InlinePollButtonProps) {
  return (
    <button
      type="button"
      className="h-8 w-8 p-0"
      onClick={onClick}
      disabled={disabled}
    >
      <BarChart2 className="h-4 w-4" />
    </button>
  );
}