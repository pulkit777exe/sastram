'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resolveReport } from '@/modules/reports/actions';
import { toasts } from '@/lib/utils/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

export const REPORT_ACTION_OPTIONS = [
  { value: 'DISMISS', label: 'Dismiss' },
  { value: 'REMOVE_MESSAGE', label: 'Remove Message' },
  { value: 'WARN_USER', label: 'Warn User' },
  { value: 'SUSPEND_USER', label: 'Suspend User' },
  { value: 'BAN_USER', label: 'Ban User' },
] as const;

export type ReportAction = (typeof REPORT_ACTION_OPTIONS)[number]['value'];

const DURATION_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
] as const;

function getDialogTitle(action: ReportAction | null): string {
  if (action === 'DISMISS') return 'Dismiss Report';
  return 'Resolve Report';
}

function getDialogDescription(action: ReportAction | null): string {
  if (action === 'DISMISS') {
    return 'Dismiss this report. No action will be taken against the reported user.';
  }
  return 'Take action on this report. The reported user will be notified.';
}

function getSubmitVariant(action: ReportAction | null): 'destructive' | 'outline' | 'default' {
  if (action === 'BAN_USER') return 'destructive';
  if (action === 'DISMISS') return 'outline';
  return 'default';
}

function getSubmitClass(action: ReportAction | null): string {
  if (action === 'REMOVE_MESSAGE') return 'bg-amber-600 hover:bg-amber-500 text-white';
  if (action === 'DISMISS') return 'bg-muted hover:bg-muted/80 text-foreground';
  if (action && action !== 'BAN_USER') return 'bg-green-600 hover:bg-green-500 text-white';
  return '';
}

interface ReportActionDialogProps {
  reportId: string;
  action: ReportAction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: () => void;
}

/**
 * One confirmation flow for every moderation surface. The dialog owns the
 * mutation so the queue and the report cards cannot drift apart.
 */
export function ReportActionDialog({
  reportId,
  action,
  open,
  onOpenChange,
  onResolved,
}: ReportActionDialogProps) {
  const router = useRouter();
  const [selectedAction, setSelectedAction] = useState<ReportAction | null>(action);
  const [note, setNote] = useState('');
  const [notifyReporter, setNotifyReporter] = useState(true);
  const [duration, setDuration] = useState<string>('24h');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedAction(action);
    setNote('');
    setDuration('24h');
    setNotifyReporter(true);
  }, [action, open]);

  async function handleSubmit() {
    if (!selectedAction) return;

    if (selectedAction !== 'DISMISS' && note.trim().length < 10) {
      toasts.error('Please provide a resolution note (at least 10 characters)');
      return;
    }

    setSubmitting(true);
    const result = await resolveReport({
      reportId,
      action: selectedAction,
      note: note.trim(),
      notifyReporter,
      duration: selectedAction === 'SUSPEND_USER' ? duration : undefined,
    });
    setSubmitting(false);

    if (result?.error) {
      toasts.error(result.error);
      return;
    }

    toasts.success(result?.data?.message ?? 'Report resolved');
    onResolved?.();
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getDialogTitle(selectedAction)}</DialogTitle>
          <DialogDescription>{getDialogDescription(selectedAction)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reported user action</Label>
            <Select
              value={selectedAction ?? undefined}
              onValueChange={(value) => setSelectedAction(value as ReportAction)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_ACTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAction === 'SUSPEND_USER' && (
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="moderator-note">Moderator note</Label>
            <Textarea
              id="moderator-note"
              placeholder="Provide a reason for this action..."
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="notify-reporter"
              checked={notifyReporter}
              onCheckedChange={(checked) => setNotifyReporter(checked === true)}
            />
            <Label htmlFor="notify-reporter" className="text-sm font-normal">
              Notify the reporter of this action
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !selectedAction}
            variant={getSubmitVariant(selectedAction)}
            className={getSubmitClass(selectedAction)}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
