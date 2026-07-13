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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { UserPlus, Mail } from 'lucide-react';
import { inviteFriendToThread } from '@/modules/invitations/actions';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';


interface InviteFriendButtonProps {
  threadId: string;
  threadName: string;
}

export function InviteFriendButton({ threadId, threadName }: InviteFriendButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState(false);
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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setEmailError(true);
      triggerShake();
      return;
    }
    setEmailError(false);

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
      toasts.error(result.error);
    } else {
      toasts.success('Invitation sent successfully!');
      setEmail('');
      setMessage('');
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Friend
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
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
                    onChange={(e) => { setEmail(e.target.value); setEmailError(false); }}
                    className="pl-10"
                    required
                  />
                </div>
                <p className="t-error-msg text-[11px] text-red-500 mt-1">Please enter an email address</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Personal Message (Optional)</Label>
              <Textarea
                id="message"
                placeholder={`Check out this discussion: ${threadName}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="resize-none min-h-[100px]"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="bg-brand hover:bg-brand/90 text-white"
            >
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
