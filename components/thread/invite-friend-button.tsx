'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { UserPlus, Mail } from 'lucide-react';
import { inviteFriendToThread } from '@/modules/invitations/actions';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';

const SHAKE_DURATION_MS = 300;


interface InviteFriendButtonProps {
  threadId: string;
  threadName: string;
  iconOnly?: boolean;
}

export function InviteFriendButton({ threadId, threadName, iconOnly = false }: InviteFriendButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [serverEmailError, setServerEmailError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const triggerShake = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const input = wrap.querySelector('.t-input');
    if (!input) return;
    input.classList.remove('is-shaking');
    void (input as HTMLElement).offsetWidth;
    input.classList.add('is-shaking');
    setTimeout(() => input.classList.remove('is-shaking'), SHAKE_DURATION_MS);
  };

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setEmailError(true);
      setServerEmailError(null);
      triggerShake();
      return;
    }
    setEmailError(false);
    setServerEmailError(null);

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('threadId', threadId);
    formData.append('email', email.trim());
    if (message.trim()) {
      formData.append('message', message.trim());
    }

    const result = await inviteFriendToThread(formData);
    setIsSubmitting(false);

    if (result?.error) {
      if (result.errorCode === 'CONFLICT') {
        setServerEmailError(result.error);
        setEmailError(true);
        triggerShake();
        toasts.info(result.error);
        return;
      } else if (result.errorCode === 'FORBIDDEN') {
        setServerEmailError(result.error);
        setEmailError(true);
        triggerShake();
        toasts.error(result.error);
        return;
      } else if (result.errorCode === 'AUTH_REQUIRED') {
        toasts.error('Please sign in again');
        return;
      } else {
        toasts.error(result.error);
        return;
      }
    }

    // Check if email failed but invite was created
    const data = result?.data as unknown as { emailed?: boolean } | undefined;
    if (data && 'emailed' in data && data.emailed === false) {
      toasts.info('Invited, but email failed — share the link manually from thread members');
    } else {
      toasts.success('Invitation sent successfully!');
    }
    setEmail('');
    setMessage('');
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={iconOnly ? 'icon' : 'default'}
          className={iconOnly ? '!h-8 !w-8 !p-0 !rounded-control !border-0 !bg-transparent !ring-0 !ring-offset-0 !shadow-none text-ink-3 hover:text-ink hover:bg-hover transition-colors' : undefined}
          aria-label="Invite friend"
        >
          <UserPlus className="w-4 h-4" />
          {!iconOnly && <span className="ml-2">Invite Friend</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a Friend</DialogTitle>
          <DialogDescription>
            Share this discussion thread with a friend via email
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleInvite}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div ref={wrapRef} className={cn('t-input-wrap', emailError && 'is-error')}>
                <div className={cn('t-input relative', emailError && 'is-error')}>
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="friend@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailError(false); setServerEmailError(null); }}
                    className="pl-10"
                    required
                  />
                </div>
                <p className="t-error-msg text-xs text-destructive mt-1">Please enter an email address</p>
                {serverEmailError && <p className="text-xs text-destructive mt-1">{serverEmailError}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Personal Message (Optional)</Label>
              <Textarea
                id="message"
                placeholder={`Check out this discussion: ${threadName}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="resize-none min-h-25"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !email.trim()}
            >
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
