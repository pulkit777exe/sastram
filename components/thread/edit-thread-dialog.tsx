'use client';

import React from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toasts } from '@/lib/utils/toast';
import { updateThreadAction } from '@/modules/threads/actions';

interface EditThreadDialogProps {
  threadId: string;
  initialTitle: string;
  initialDescription?: string | null;
  /** Called after a successful save so the parent can update in place. */
  onSaved: (title: string, description: string | null) => void;
}

/**
 * Inline thread editing (title + description) for the OP/moderator.
 * Updates local state on success — no page refresh.
 */
export function EditThreadDialog({ threadId, initialTitle, initialDescription, onSaved }: EditThreadDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(initialTitle);
  const [description, setDescription] = React.useState(initialDescription ?? '');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setDescription(initialDescription ?? '');
    }
  }, [open, initialTitle, initialDescription]);

  const canSave = title.trim().length >= 3 && title.trim().length <= 120 && description.length <= 480;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    const result = await updateThreadAction({
      threadId,
      title: title.trim(),
      description: description.trim(),
    });
    setSaving(false);
    if (result?.error) {
      toasts.error(result.error);
      return;
    }
    onSaved(result.data?.title ?? title.trim(), result.data?.description ?? null);
    toasts.success('Thread updated');
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-ink-3 hover:text-ink hover:bg-hover"
              aria-label="Edit thread"
            >
              <Pencil size={14} />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Edit title and description
        </TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md rounded-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pencil size={16} /> Edit thread</DialogTitle>
          <DialogDescription className="text-xs">
            Rename the thread or update its description. The URL stays the same so existing links keep working.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-thread-title" className="text-xs">Title</Label>
            <Input
              id="edit-thread-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
              maxLength={120}
            />
            <p className="text-xs text-ink-3">{title.trim().length}/120</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-thread-description" className="text-xs">Description (optional)</Label>
            <Textarea
              id="edit-thread-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-20 max-h-48 resize-none text-sm"
              maxLength={480}
              placeholder="Add context so readers know what this thread is about"
            />
            <p className="text-xs text-ink-3">{description.length}/480</p>
          </div>
          <Button onClick={handleSave} disabled={saving || !canSave} className="w-full h-8 gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
