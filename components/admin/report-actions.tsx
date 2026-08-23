'use client';

import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { resolveReport } from '@/modules/reports/actions';
import { toasts } from '@/lib/utils/toast';
import { ReportStatus } from '@/lib/config/constants';
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

interface ReportActionsProps {
  reportId: string;
  currentStatus: ReportStatus;
  onStatusChange?: (reportId: string, newStatus: ReportStatus) => (() => void) | void;
}

const ACTION_OPTIONS = [
  { value: 'DISMISS', label: 'Dismiss' },
  { value: 'REMOVE_MESSAGE', label: 'Remove Message' },
  { value: 'WARN_USER', label: 'Warn User' },
  { value: 'SUSPEND_USER', label: 'Suspend User' },
  { value: 'BAN_USER', label: 'Ban User' },
] as const;

const DURATION_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
] as const;

type ActionType = (typeof ACTION_OPTIONS)[number]['value'];

export function ReportActions({ reportId, currentStatus, onStatusChange }: ReportActionsProps) {
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [note, setNote] = useState('');
  const [notifyReporter, setNotifyReporter] = useState(true);
  const [duration, setDuration] = useState<string>('24h');
  const [submitting, setSubmitting] = useState(false);

  function handleOpen(action: ActionType) {
    setSelectedAction(action);
    setNote('');
    setDuration('24h');
    setNotifyReporter(true);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!selectedAction) return;

    if (selectedAction !== 'DISMISS' && note.trim().length < 10) {
      toasts.error('Please provide a resolution note (at least 10 characters)');
      return;
    }

    setSubmitting(true);
    const rollback = onStatusChange?.(
      reportId,
      selectedAction === 'DISMISS' ? 'DISMISSED' : 'RESOLVED'
    );

    const result = await resolveReport({
      reportId,
      action: selectedAction,
      note: note.trim(),
      notifyReporter,
      duration: selectedAction === 'SUSPEND_USER' ? duration : undefined,
    });

    setSubmitting(false);

    if (result?.error) {
      rollback?.();
      toasts.error(result.error);
    } else {
      toasts.success(result?.data?.message ?? 'Report resolved');
      setOpen(false);
      setSelectedAction(null);
    }
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {ACTION_OPTIONS.map((opt) => (
          <button type="button"
            key={opt.value}
            onClick={() => handleOpen(opt.value)}
            className={
              opt.value === 'DISMISS'
                ? 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                : opt.value === 'BAN_USER'
                  ? 'bg-destructive hover:bg-destructive/90 text-white dark:bg-destructive/80 dark:hover:bg-destructive/70'
                  : opt.value === 'REMOVE_MESSAGE'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-700 dark:hover:bg-amber-600'
                    : ''
            }
          >
            {opt.value === 'DISMISS' && <XCircle className="w-4 h-4 mr-1" />}
            {opt.label}
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAction === 'DISMISS' ? 'Dismiss Report' : 'Resolve Report'}</DialogTitle>
            <DialogDescription>
              {selectedAction === 'DISMISS'
                ? 'Dismiss this report. No action will be taken against the reported user.'
                : 'Take action on this report. The reported user will be notified.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reported user action</Label>
              <Select
                value={selectedAction ?? undefined}
                onValueChange={(v) => setSelectedAction(v as ActionType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
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
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
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
                onChange={(e) => setNote(e.target.value)}
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
            <button type="button" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </button>
            <button type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={
                selectedAction === 'BAN_USER'
                  ? 'bg-destructive hover:bg-destructive/90 text-white'
                  : selectedAction === 'REMOVE_MESSAGE'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : selectedAction === 'DISMISS'
                      ? 'bg-muted hover:bg-muted/80 text-foreground'
                      : 'bg-green-600 hover:bg-green-500 text-white'
              }
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
