'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { clientLogger } from '@/lib/utils/client-logger';
import { Button } from '@/components/ui/button';
import { toasts } from '@/lib/utils/toast';

interface AppealMessageModalProps {
  messageId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AppealMessageModal({ messageId, isOpen, onClose }: AppealMessageModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toasts.error('Please provide a reason for your appeal');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/v1/moderation/appeals/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, reason }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit appeal');
      }

      toasts.success('Appeal submitted successfully');
      setReason('');
      onClose();
    } catch (error) {
      clientLogger.error('AppealModal', 'Failed to submit appeal', error);
      toasts.error('Failed to submit appeal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appeal moderation decision</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Explain why you believe this message should be reinstated. A moderator will review your
            appeal.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide details for your appeal..."
            className="min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? 'Submitting...' : 'Submit appeal'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
