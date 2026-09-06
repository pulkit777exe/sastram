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
import { Button } from '@/components/ui/button';

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

function getActionButtonVariant(
  action: ActionType
): 'outline' | 'destructive' | 'default' {
  if (action === 'DISMISS') return 'outline';
  if (action === 'BAN_USER') return 'destructive';
  return 'default';
}

function getActionButtonClass(action: ActionType): string {
  if (action === 'REMOVE_MESSAGE') {
    return 'bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-700 dark:hover:bg-amber-600';
  }
  return '';
}

function getDialogTitle(action: ActionType | null): string {
  if (action === 'DISMISS') return 'Dismiss Report';
  return 'Resolve Report';
}

function getDialogDescription(action: ActionType | null): string {
  if (action === 'DISMISS') {
    return 'Dismiss this report. No action will be taken against the reported user.';
  }
  return 'Take action on this report. The reported user will be notified.';
}

function getSubmitVariant(action: ActionType | null): 'destructive' | 'outline' | 'default' {
  if (action === 'BAN_USER') return 'destructive';
  if (action === 'DISMISS') return 'outline';
  return 'default';
}

function getSubmitClass(action: ActionType | null): string {
  if (action === 'REMOVE_MESSAGE') return 'bg-amber-600 hover:bg-amber-500 text-white';
  if (action === 'DISMISS') return 'bg-muted hover:bg-muted/80 text-foreground';
  if (action && action !== 'BAN_USER') return 'bg-green-600 hover:bg-green-500 text-white';
  return '';
}

export function ReportActions({ reportId, currentStatus: _currentStatus, onStatusChange }: ReportActionsProps) {
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
          <Button
            type="button"
            key={opt.value}
            variant={getActionButtonVariant(opt.value)}
            onClick={() => handleOpen(opt.value)}
            className={getActionButtonClass(opt.value)}
          >
            {opt.value === 'DISMISS' && <XCircle className="w-4 h-4 mr-1" />}
            {opt.label}
          </Button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              variant={getSubmitVariant(selectedAction)}
              className={getSubmitClass(selectedAction)}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
