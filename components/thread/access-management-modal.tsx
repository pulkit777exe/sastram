'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Trash2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { TimeAgo } from '@/components/ui/TimeAgo';
import {
  listThreadInvitationsAction,
  revokeThreadInvitationAction,
  type ThreadInvitationView,
} from '@/modules/invitations/actions';

interface ThreadAccessModalProps {
  threadId: string;
  creatorId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ThreadAccessModal({
  threadId,
  creatorId: _creatorId,
  isOpen,
  onClose,
}: ThreadAccessModalProps) {
  const [invitations, setInvitations] = useState<ThreadInvitationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await listThreadInvitationsAction(threadId);
        if (cancelled) return;
        if (result?.error) {
          toast.error(result.error);
          setInvitations([]);
        } else {
          setInvitations(result?.data ?? []);
        }
      } catch {
        if (cancelled) return;
        toast.error('Failed to load invitations');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, threadId]);

  const handleRevoke = async (invitationId: string) => {
    setRevokingId(invitationId);
    try {
      const result = await revokeThreadInvitationAction(invitationId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Invitation revoked');
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke invitation');
    } finally {
      setRevokingId(null);
    }
  };

  function renderContent() {
    if (loading) {
      return (
        <div className="flex justify-center p-8">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (invitations.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground text-sm">No invitations found.</div>
      );
    }

    return (
      <ScrollArea className="h-88 pr-4 -mr-4">
        <div className="space-y-4 pr-4">
          {invitations.map((invitation) => {
            const isRevoking = revokingId === invitation.id;
            return (
              <div key={invitation.id} className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full border bg-brand/10 flex items-center justify-center">
                    <Mail size={14} className="text-brand" />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-none">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Invited <TimeAgo date={invitation.createdAt} />
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs h-4 px-1 flex gap-1">
                    {invitation.status}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isRevoking}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRevoke(invitation.id)}
                  >
                    {isRevoking ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Access</DialogTitle>
          <DialogDescription>
            People with accepted or pending invitations to this thread.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
