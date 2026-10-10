'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getMessageEditHistory } from '@/modules/messages/actions';

interface EditRecord {
  id: string;
  content: string;
  editedAt: Date | string;
}

/**
 * Clickable "edited" label — fetches prior versions on demand.
 * Fully local state, no page refresh.
 */
export function EditHistory({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<EditRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (history !== null) return;
    setLoading(true);
    try {
      const res = await getMessageEditHistory({ messageId });
      if (!res?.error && Array.isArray(res.data)) {
        setHistory(res.data as EditRecord[]);
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => void toggle()}
        className="text-xs text-muted-foreground/40 italic hover:text-ink-2 hover:underline underline-offset-2 transition-colors"
        title="View edit history"
      >
        edited
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-64 rounded-card border border-line bg-surface p-2 shadow-overlay">
          <span className="block px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Edit history
          </span>
          {loading ? (
            <span className="flex items-center gap-1.5 px-1 py-2 text-xs text-ink-3">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </span>
          ) : history && history.length > 0 ? (
            <span className="block max-h-48 space-y-1.5 overflow-y-auto">
              {history.map((h) => (
                <span key={h.id} className="block rounded-control bg-canvas px-2 py-1.5">
                  <span className="block text-xs leading-relaxed text-ink-2 line-clamp-3">{h.content}</span>
                  <span className="block pt-0.5 text-[11px] text-ink-3">
                    {new Date(h.editedAt).toLocaleString()}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="block px-1 py-2 text-xs text-ink-3">No prior versions found.</span>
          )}
        </span>
      )}
    </span>
  );
}
