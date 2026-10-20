'use client';

import { useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

const NULL_SENTINEL = 'null';

function frequencyToValue(frequency: SubscriptionFrequency): string {
  if (frequency === null) return NULL_SENTINEL;
  return frequency;
}

function valueToFrequency(value: string): SubscriptionFrequency {
  if (value === NULL_SENTINEL) return null;
  return value as SubscriptionFrequency;
}

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
    const tooltipLabel =
      frequency === null
        ? 'Subscribe to thread'
        : frequency === 'NEVER'
          ? 'Notifications off — change subscription'
          : `Subscribed ${frequency.toLowerCase()} — change subscription`;
    const SubscriptionIcon = frequency === null ? Bell : frequency === 'NEVER' ? BellOff : BellRing;

    return (
      <Select
        value={frequencyToValue(frequency)}
        onValueChange={(v) => void setSubscription(valueToFrequency(v))}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              aria-label={tooltipLabel}
              aria-busy={isSaving}
              className={`!h-8 !w-8 !p-0 !rounded-control !border-0 !bg-transparent !ring-0 !ring-offset-0 flex items-center justify-center !shadow-none hover:bg-hover transition-colors [&>span]:hidden ${frequency === null ? 'text-ink-3 hover:text-ink' : 'text-sai-accent'}`}
            >
              <SubscriptionIcon className="h-4 w-4" />
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {tooltipLabel}
          </TooltipContent>
        </Tooltip>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.label} value={frequencyToValue(option.value)}>
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
        value={frequencyToValue(frequency)}
        onValueChange={(v) => void setSubscription(valueToFrequency(v))}
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
            <SelectItem key={option.label} value={frequencyToValue(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">{isSaving ? 'Saving...' : 'Change'}</span>
    </div>
  );
}
