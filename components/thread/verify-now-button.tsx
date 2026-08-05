'use client';

import { useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { markThreadVerified } from '@/modules/threads/actions';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';

interface VerifyNowButtonProps {
  threadId: string;
}

export function VerifyNowButton({ threadId }: VerifyNowButtonProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleVerify = async () => {
    if (isVerifying) return;
    setIsVerifying(true);
    const res = await markThreadVerified({ threadId });
    setIsVerifying(false);
    if (res?.error) {
      toasts.error('Could not verify the thread. Try again.');
      return;
    }
    setVerified(true);
    toasts.success('Marked as verified — resolution score refreshed.');
  };

  return (
    <button
      type="button"
      onClick={handleVerify}
      disabled={isVerifying || verified}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200',
        verified
          ? 'bg-chart-2/10 text-chart-2 cursor-default'
          : 'bg-chart-4/10 text-chart-4 hover:bg-chart-4/15'
      )}
    >
      {verified ? (
        <>
          <Check size={12} />
          Verified
        </>
      ) : (
        <>
          <RefreshCw size={12} className={isVerifying ? 'animate-spin' : ''} />
          {isVerifying ? 'Verifying…' : 'Verify now'}
        </>
      )}
    </button>
  );
}
