'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Flag, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createReport } from '@/modules/reports/actions';
import { toasts } from '@/lib/utils/toast';
import { REPORT_CATEGORY_LABELS } from '@/lib/config/constants';
import { cn } from '@/lib/utils/cn';

interface ReportButtonProps {
  messageId: string;
  variant?: 'icon' | 'text' | 'full';
}

const reportCategories = Object.entries(REPORT_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function ReportButton({ messageId, variant = 'text' }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const triggerShake = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const input = wrap.querySelector('.t-input');
    if (!input) return;
    input.classList.remove('is-shaking');
    void (input as HTMLElement).offsetWidth;
    input.classList.add('is-shaking');
    setTimeout(() => input.classList.remove('is-shaking'), 300);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) {
      setCategoryError(true);
      triggerShake();
      return;
    }
    setCategoryError(false);

    setIsSubmitting(true);
    const result = await createReport({
      messageId,
      category,
      details: details.trim() || undefined,
    });
    setIsSubmitting(false);

    if (result?.error) {
      toasts.error(result.error);
    } else if (result?.data) {
      setSubmitted(true);
      setReportId(result.data.reportId);
      toasts.success(result.data.message || 'Report submitted successfully');
    }
  }

  function handleClose() {
    setOpen(false);
    // Reset form after closing
    setTimeout(() => {
      setCategory('');
      setDetails('');
      setSubmitted(false);
      setReportId(null);
    }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (isOpen ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        {variant === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label="Report message"
          >
            <Flag className="w-3.5 h-3.5" />
          </Button>
        ) : variant === 'full' ? (
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:text-destructive hover:border-destructive"
          >
            <Flag className="w-3.5 h-3.5 mr-1.5" />
            Report Message
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          >
            <Flag className="w-3 h-3 mr-1" />
            Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[480px]">
        {submitted ? (
          <>
            <DialogHeader className="text-center items-center pt-4">
              <div className="t-success-check w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3" data-state="in">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Report Submitted
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-2">
                Thank you for helping keep our community safe.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Report ID</p>
                <p className="font-mono text-sm text-foreground">{reportId}</p>
              </div>
              <div className="flex items-start gap-3 bg-amber-500/10 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  We&apos;ll review this report and take action if it violates our community
                  guidelines. You can track the status in your Settings.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} className="w-full">
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Flag className="w-5 h-5 text-destructive" />
                Report Message
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Help us keep the community safe by reporting inappropriate content.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-foreground">
                  What&apos;s the issue? <span className="text-destructive">*</span>
                </Label>
                <div ref={wrapRef} className={cn('t-input-wrap', categoryError && 'is-error')}>
                  <div className={cn('t-input', categoryError && 'is-error')}>
                    <Select value={category} onValueChange={(v) => { setCategory(v); setCategoryError(false); }}>
                      <SelectTrigger id="category" className="bg-muted border-border text-foreground">
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {reportCategories.map((cat) => (
                          <SelectItem
                            key={cat.value}
                            value={cat.value}
                            className="text-popover-foreground"
                          >
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="t-error-msg text-[11px] text-red-500 mt-1">Please select a report category</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="details" className="text-foreground">
                  Additional details{' '}
                  <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Please explain why you're reporting this message..."
                  className="min-h-[100px] bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {details.length}/500 characters
                </p>
              </div>
              <DialogFooter className="pt-2 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !category}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Report'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
