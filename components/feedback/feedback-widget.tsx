'use client';

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { toasts } from '@/lib/utils/toast';
import { submitFeedback } from '@/modules/feedback/actions';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'BUG' | 'SUGGESTION' | 'OTHER'>('BUG');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (message.trim().length < 10) {
      toasts.error('Please provide at least 10 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitFeedback({
        type,
        message: message.trim(),
        route: window.location.pathname,
      });

      if (result?.ok) {
        toasts.success('Feedback submitted! Thank you.');
        setMessage('');
        setOpen(false);
      } else {
        toasts.error(result?.error || 'Failed to submit feedback.');
      }
    } catch {
      toasts.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button"
          className="fixed bottom-4 right-4 z-40 rounded-full shadow-lg h-10 px-4 bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Report a bug or suggest a feature. Your input helps shape Sastram.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="feedback-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger id="feedback-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUG">Bug Report</SelectItem>
                <SelectItem value="SUGGESTION">Suggestion</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feedback-message">Details</Label>
            <Textarea
              id="feedback-message"
              placeholder="Describe the bug or suggestion in detail…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-32 resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {message.length < 10 ? `${10 - message.length} more characters needed` : `${message.length}/2000`}
            </p>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button"
            onClick={handleSubmit}
            disabled={submitting || message.trim().length < 10}
          >
            {submitting ? 'Sending…' : 'Submit'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
