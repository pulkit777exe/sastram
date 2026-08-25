'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import {
  subscribeToThreadAction,
  unsubscribeFromThread,
  updateSubscriptionFrequencyAction,
} from '@/modules/newsletter/actions';
import { toasts } from '@/lib/utils/toast';
import { Button } from '@/components/ui/button';
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
  threadName = 'this thread',
  threadId,
  slug,
  initialFrequency,
  iconOnly = false,
}: ThreadSubscribeButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [frequency, setFrequency] = useState<SubscriptionFrequency>(initialFrequency);

  const triggerLabel = frequency === null ? 'Not subscribed' : frequency.charAt(0) + frequency.slice(1).toLowerCase();

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
    return (
      <Select
        value={frequency ?? 'null'}
        onValueChange={(v) => void setSubscription(v === 'null' ? null : v as SubscriptionFrequency)}
        disabled={isSaving}
      >
        <SelectTrigger className="h-8 w-8 !p-0 flex items-center justify-center !rounded-lg border-border/70">
          <Bell className="h-4 w-4" />
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
        <SelectTrigger className="w-full justify-between rounded-xl border-border/70">
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
