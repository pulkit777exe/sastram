'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, X, Loader2 } from 'lucide-react';
import { createThreadAction } from '@/modules/threads/actions';
import { toasts } from '@/lib/utils/toast';
import { cn } from '@/lib/utils/cn';

interface SimilarThread {
  id: string;
  name: string;
  slug: string;
  similarity: number;
}

// Each check costs one unit of the 30/day AI analysis quota, so a single
// compose session must not be able to drain it while the user iterates.
const MAX_CHECKS_PER_SESSION = 3;

// Wait for a real pause in typing, not a micro-pause mid-sentence.
const SIMILARITY_DEBOUNCE_MS = 1500;

export function CreateThreadDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [similarThreads, setSimilarThreads] = useState<SimilarThread[]>([]);
  const [checkingSimilar, setCheckingSimilar] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checksUsedRef = useRef(0);
  const lastCheckedRef = useRef<string | null>(null);

  const checkSimilar = useCallback(async (titleText: string, descText: string) => {
    if (titleText.trim().length < 10) {
      setSimilarThreads([]);
      return;
    }

    // Never spend more than MAX_CHECKS_PER_SESSION quota units while the user
    // iterates on a draft. The daily AI analysis quota is only 30.
    if (checksUsedRef.current >= MAX_CHECKS_PER_SESSION) return;

    // Skip identical payloads (retyping the same text, description-only edits
    // that leave the analysed text unchanged).
    const payload = `${titleText.trim()}\u0000${descText.trim()}`;
    if (lastCheckedRef.current === payload) return;
    lastCheckedRef.current = payload;
    checksUsedRef.current += 1;

    setCheckingSimilar(true);
    try {
      const res = await fetch('/api/threads/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleText, description: descText || undefined }),
      });
      const data = await res.json();
      if (data?.ok && data.data?.similar) {
        setSimilarThreads(data.data.similar);
      } else {
        setSimilarThreads([]);
      }
    } catch {
      setSimilarThreads([]);
    } finally {
      setCheckingSimilar(false);
    }
  }, []);

  useEffect(() => {
    if (dismissed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void checkSimilar(title, description);
    }, SIMILARITY_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title, description, dismissed, checkSimilar]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setTitle('');
      setDescription('');
      setSimilarThreads([]);
      setDismissed(false);
      checksUsedRef.current = 0;
      lastCheckedRef.current = null;
    }
  };

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

  const showSimilar = similarThreads.length > 0 && !dismissed && title.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create Thread
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-120">
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="thread-description">Description</Label>
            <Textarea
              id="thread-description"
              name="description"
              placeholder="Provide some context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {checkingSimilar && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking for similar threads…
            </div>
          )}

          {showSimilar && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Similar threads found
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDismissed(true)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ul className="space-y-1.5">
                {similarThreads.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`/dashboard/threads/${t.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex items-center justify-between text-xs px-2 py-1.5 rounded',
                        'bg-background/60 hover:bg-background border border-line/50',
                        'transition-colors'
                      )}
                    >
                      <span className="truncate flex-1">{t.name}</span>
                      <span className="text-muted-foreground ml-2 shrink-0">
                        {Math.round(t.similarity * 100)}% match
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Consider joining an existing conversation before creating a new one.
              </p>
            </div>
          )}

          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <Label className="text-sm font-medium">Poll (optional)</Label>
            <Input name="pollQuestion" placeholder="Poll question" />
            <Textarea name="pollOptions" placeholder="Option 1&#10;Option 2" className="font-mono text-sm" />
            <p className="text-xs text-muted-foreground">One option per line, at least 2.</p>
            <Input name="pollExpiresAt" type="datetime-local" />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Creating...' : 'Publish thread'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
