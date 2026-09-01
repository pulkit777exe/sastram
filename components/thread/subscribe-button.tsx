'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import {
  subscribeToThreadAction,
  unsubscribeFromThread,
  updateSubscriptionFrequencyAction,
} from '@/modules/newsletter/actions';
import { toasts } from '@/lib/utils/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SubscriptionFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER' | null;

interface ThreadSubscribeButtonProps {
  threadName?: string;
  threadId: string;
  slug: string;
  initialFrequency: SubscriptionFrequency;
  iconOnly?: boolean;
}

const OPTIONS: Array<{ label: string; value: SubscriptionFrequency }> = [
  { label: 'Not subscribed', value: null },
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Never', value: 'NEVER' },
];

export function ThreadSubscribeButton({
  threadName: _threadName = 'this thread',
  threadId,
  slug,
  initialFrequency,
  iconOnly = false,
}: ThreadSubscribeButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [frequency, setFrequency] = useState<SubscriptionFrequency>(initialFrequency);

  const setSubscription = async (nextFrequency: SubscriptionFrequency) => {
    if (isSaving || nextFrequency === frequency) {
      return;
    }

    const previous = frequency;
    setFrequency(nextFrequency);
    setIsSaving(true);

    try {
      if (nextFrequency === null || nextFrequency === 'NEVER') {
        const result = await unsubscribeFromThread({ threadId });
        if (result.error) {
          setFrequency(previous);
          toasts.serverError();
          return;
        }

        toasts.saved();
        return;
      }

      if (!previous || previous === 'NEVER') {
        const subscribe = await subscribeToThreadAction({ threadId, slug });
        if (subscribe.error) {
          setFrequency(previous);
          toasts.serverError();
          return;
        }
      }

      const update = await updateSubscriptionFrequencyAction({
        threadId,
        frequency: nextFrequency,
      });
      if (update.error) {
        setFrequency(previous);
        toasts.serverError();
        return;
      }

      toasts.saved();
    } finally {
      setIsSaving(false);
    }
  };

  if (iconOnly) {
    const previewLabel = frequency === null ? 'N' : frequency.charAt(0);

    return (
      <Select
        value={frequency ?? 'null'}
        onValueChange={(v) => void setSubscription(v === 'null' ? null : v as SubscriptionFrequency)}
        disabled={isSaving}
      >
        <SelectTrigger className="!h-8 !w-auto !px-2 !py-0 !rounded-control !border-0 !bg-transparent !ring-0 !ring-offset-0 flex items-center gap-1.5 !shadow-none text-ink-3 hover:text-ink hover:bg-hover transition-colors [&>svg]:hidden">
          <Bell className="h-4 w-4" />
          {frequency !== null && (
            <span className="text-[10px] font-semibold leading-none">{previewLabel}</span>
          )}
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.label} value={option.value ?? 'null'}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={frequency ?? 'null'}
        onValueChange={(v) => void setSubscription(v === 'null' ? null : v as SubscriptionFrequency)}
        disabled={isSaving}
      >
        <SelectTrigger className="w-full justify-between rounded-card border-line/70">
          <span className="inline-flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <SelectValue placeholder="Not subscribed" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.label} value={option.value ?? 'null'}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">{isSaving ? 'Saving...' : 'Change'}</span>
    </div>
  );
}
