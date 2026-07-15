'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Trash2, Ban, MessageSquare } from 'lucide-react';
import { deleteThread, banUser } from '@/modules/moderation/actions';
import { toasts } from '@/lib/utils/toast';
import type { ThreadSummary } from '@/modules/threads/types';

interface AdminModerationPanelProps {
  threads: ThreadSummary[];
}

export function AdminModerationPanel({ threads: initialThreads }: AdminModerationPanelProps) {
  const [threads, setThreads] = useState<ThreadSummary[]>(initialThreads);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [deleteThreadDialogOpen, setDeleteThreadDialogOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState<string>('');
  const [banReason, setBanReason] = useState<string>('');
  const [banCustomReason, setBanCustomReason] = useState<string>('');
  const [banUserId, setBanUserId] = useState<string>('');
  const [banThreadId, setBanThreadId] = useState<string>('');
  const [deleteReason, setDeleteReason] = useState<string>('');

  async function handleBanUser() {
    if (!banUserId || !banReason) {
      toasts.error('Please fill in all required fields');
      return;
    }

    setBanDialogOpen(false);
    setBanUserId('');
    setBanThreadId('');
    setBanReason('');
    setBanCustomReason('');
    toasts.success('User banned successfully');

    const result = await banUser(
      banUserId,
      banReason,
      banCustomReason || undefined,
      banThreadId || undefined
    );

    if (result?.error) {
      toasts.error(result.error);
    }
  }

  async function handleDeleteThread() {
    if (!selectedThread) {
      toasts.error('Please select a thread');
      return;
    }

    const prev = threads;
    const threadName = threads.find((t) => t.id === selectedThread)?.name ?? '';
    setThreads((p) => p.filter((t) => t.id !== selectedThread));
    setDeleteThreadDialogOpen(false);
    setSelectedThread('');
    setDeleteReason('');
    toasts.success(`Thread "${threadName}" deleted`);

    const result = await deleteThread(selectedThread, deleteReason || undefined);

    if (result?.error) {
      setThreads(prev);
      toasts.error(result.error);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" />
            Ban User
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Ban a user from a specific thread or the entire platform.
          </p>
          <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Ban className="h-4 w-4 mr-2" />
                Ban User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Ban User</DialogTitle>
                <DialogDescription>
                  Enter user ID and select ban reason. You can ban from a specific thread or
                  globally.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="ban-user-id">User ID</Label>
                  <Input
                    id="ban-user-id"
                    value={banUserId}
                    onChange={(e) => setBanUserId(e.target.value)}
                    placeholder="Enter user ID"
                    className="bg-background"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ban-thread">Thread (Optional - leave empty for global ban)</Label>
                  <Select value={banThreadId} onValueChange={setBanThreadId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select thread (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Global Ban</SelectItem>
                      {threads.map((thread) => (
                        <SelectItem key={thread.id} value={thread.id}>
                          {thread.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ban-reason">Ban Reason</Label>
                  <Select value={banReason} onValueChange={setBanReason}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SPAM">Spam</SelectItem>
                      <SelectItem value="HARASSMENT">Harassment</SelectItem>
                      <SelectItem value="HATE_SPEECH">Hate Speech</SelectItem>
                      <SelectItem value="ILLEGAL_CONTENT">Illegal Content</SelectItem>
                      <SelectItem value="IMPERSONATION">Impersonation</SelectItem>
                      <SelectItem value="THREATS">Threats</SelectItem>
                      <SelectItem value="DOXXING">Doxxing</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ban-custom-reason">Custom Reason (Optional)</Label>
                  <Textarea
                    id="ban-custom-reason"
                    value={banCustomReason}
                    onChange={(e) => setBanCustomReason(e.target.value)}
                    placeholder="Additional details..."
                    rows={3}
                    className="resize-none bg-background"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBanDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBanUser}
                  disabled={!banUserId || !banReason}
                >
                  Ban User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-500" />
            Delete Thread
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Soft-delete a thread. Hidden immediately, permanently purged 30 days later.
          </p>
          <Dialog open={deleteThreadDialogOpen} onOpenChange={setDeleteThreadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Thread
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Delete Thread</DialogTitle>
                <DialogDescription>
                  The thread will be soft-deleted and hidden from all listings immediately.
                  It is permanently purged 30 days after deletion.
                  There is no recovery UI in this build — once purged, the data is gone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="delete-thread">Select Thread</Label>
                  <Select value={selectedThread} onValueChange={setSelectedThread}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select thread to delete" />
                    </SelectTrigger>
                    <SelectContent>
                      {threads.map((thread) => (
                        <SelectItem key={thread.id} value={thread.id}>
                          {thread.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="delete-thread-reason">Reason (Optional)</Label>
                  <Textarea
                    id="delete-thread-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Reason for deletion..."
                    rows={3}
                    className="resize-none bg-background"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteThreadDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteThread}
                  disabled={!selectedThread}
                >
                  Delete Thread
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
