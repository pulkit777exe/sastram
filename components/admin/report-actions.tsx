'use client';

import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  REPORT_ACTION_OPTIONS,
  ReportActionDialog,
  type ReportAction,
} from './report-action-dialog';

interface ReportActionsProps {
  reportId: string;
}

function getButtonVariant(action: ReportAction): 'outline' | 'destructive' | 'default' {
  if (action === 'DISMISS') return 'outline';
  if (action === 'BAN_USER') return 'destructive';
  return 'default';
}

function getButtonClass(action: ReportAction): string {
  if (action === 'REMOVE_MESSAGE') {
    return 'bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-700 dark:hover:bg-amber-600';
  }
  return '';
}

export function ReportActions({ reportId }: ReportActionsProps) {
  const [selectedAction, setSelectedAction] = useState<ReportAction | null>(null);
  const [open, setOpen] = useState(false);

  function handleOpen(action: ReportAction) {
    setSelectedAction(action);
    setOpen(true);
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {REPORT_ACTION_OPTIONS.map((option) => (
          <Button
            type="button"
            key={option.value}
            variant={getButtonVariant(option.value)}
            onClick={() => handleOpen(option.value)}
            className={getButtonClass(option.value)}
          >
            {option.value === 'DISMISS' && <XCircle className="w-4 h-4 mr-1" />}
            {option.label}
          </Button>
        ))}
      </div>

      <ReportActionDialog
        reportId={reportId}
        action={selectedAction}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSelectedAction(null);
        }}
      />
    </>
  );
}
