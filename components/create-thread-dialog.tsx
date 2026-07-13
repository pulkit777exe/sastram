'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { createThreadAction } from '@/modules/threads/actions';
import { toasts } from '@/lib/utils/toast';

export function CreateThreadDialog({ communities }: { communities?: Array<{ id: string; title: string }> }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createThreadAction(formData);
      if (result && 'error' in result && result.error) {
        toasts.error(result.error as string);
      } else {
        toasts.success('Thread created');
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-brand hover:bg-brand-hover cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          Create Thread
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create a new thread</DialogTitle>
          <DialogDescription>
            Start a new conversation. You can add a poll optionally.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="thread-title">Title</Label>
            <Input
              id="thread-title"
              name="title"
              placeholder="What is this thread about?"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="thread-description">Description</Label>
            <Textarea
              id="thread-description"
              name="description"
              placeholder="Provide some context..."
            />
          </div>
          {communities && communities.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="thread-community">Community</Label>
              <select
                id="thread-community"
                name="communityId"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No parent community</option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          )}
          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <Label className="text-sm font-medium">Poll (optional)</Label>
            <Input name="pollQuestion" placeholder="Poll question" />
            <Textarea name="pollOptions" placeholder="Option 1&#10;Option 2" className="font-mono text-sm" />
            <p className="text-xs text-muted-foreground">One option per line, at least 2.</p>
            <Input name="pollExpiresAt" type="datetime-local" />
          </div>
          <Button type="submit" className="w-full bg-brand hover:bg-brand-hover text-white font-bold" disabled={isPending}>
            {isPending ? 'Creating...' : 'Publish thread'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
