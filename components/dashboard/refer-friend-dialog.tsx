'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Mail, Share2, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toasts } from '@/lib/utils/toast';

interface ReferFriendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReferFriendDialog({ open, onOpenChange }: ReferFriendDialogProps) {
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (!open) return;
    setInviteUrl(window.location.origin);
    setCanShare(typeof navigator.share === 'function');
  }, [open]);

  async function copyInviteUrl() {
    if (!inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toasts.success('Invite link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toasts.error('Could not copy the link. Select it and copy manually.');
    }
  }

  async function shareInvite() {
    if (!inviteUrl) return;

    try {
      await navigator.share({
        title: 'Sastram',
        text: 'Join me on Sastram — discussions with Sai built in.',
        url: inviteUrl,
      });
    } catch {
      // The user dismissed the share sheet; nothing to report.
    }
  }

  const emailHref = inviteUrl
    ? `mailto:?subject=${encodeURIComponent('Join me on Sastram')}&body=${encodeURIComponent(
        `I thought you would like Sastram — a discussion platform with Sai built into every thread.\n\n${inviteUrl}`
      )}`
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-brand" />
            Invite a friend
          </DialogTitle>
          <DialogDescription>
            Sastram is better with company. Share the link and start a discussion together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={inviteUrl}
              readOnly
              aria-label="Sastram invite link"
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={copyInviteUrl} disabled={!inviteUrl}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <p className="text-xs text-ink-3">
            Anyone with the link can create an account. Thread invitations are sent from inside a
            thread.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          {emailHref && (
            <Button asChild variant="outline">
              <a href={emailHref}>
                <Mail className="mr-2 h-4 w-4" />
                Email invite
              </a>
            </Button>
          )}
          {canShare && (
            <Button type="button" onClick={shareInvite}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
