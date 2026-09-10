'use client';

import React from 'react';
import Image from 'next/image';
import { ExternalLink, Link2, Globe } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

type Preview = { title: string; description: string | null; image: string | null; images?: string[]; domain: string; url: string };

function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/https?:\/\/[^\s"')\]]+/);
  return m ? m[0].replace(/[.,;!?]+$/, '') : null;
}

export function ExternalLinkPreview({ url, compact }: { url?: string | null; compact?: boolean }) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [loading, setLoading] = React.useState(false);

  const targetUrl = url ?? null;

  React.useEffect(() => {
    if (!targetUrl) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/link-preview?url=${encodeURIComponent(targetUrl)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.data) setPreview(j.data as Preview);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetUrl]);

  const [imgErrors, setImgErrors] = React.useState<Record<number, boolean>>({});

  if (!targetUrl) return null;
  if (loading) {
    return (
      <div className={`rounded-card border border-line bg-canvas overflow-hidden ${compact ? 'p-3' : 'p-0'}`}>
        <div className="flex gap-3 p-3">
          <Skeleton className="w-10 h-10 rounded-control shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </div>
    );
  }
  if (!preview) return null;

  const imgs = (preview.images && preview.images.length ? preview.images : preview.image ? [preview.image] : []).slice(0, 3);
  const hasImage = imgs.length > 0;

  return (
    <a href={preview.url} target="_blank" rel="noopener noreferrer" className="group block rounded-card border border-line bg-surface hover:bg-hover hover:border-line-strong hover:shadow-card transition-all overflow-hidden">
      {hasImage ? (
        <div className={`grid gap-px bg-line ${imgs.length === 1 ? 'grid-cols-1' : imgs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} max-h-56 overflow-hidden`}>
          {imgs.map((src, i) => (
            <div key={i} className="relative bg-canvas overflow-hidden h-32" style={{ display: imgErrors[i] ? 'none' : undefined }}>
              <Image
                src={src}
                alt=""
                fill
                unoptimized
                className="object-cover"
                referrerPolicy="no-referrer"
                onError={() => setImgErrors((prev) => ({ ...prev, [i]: true }))}
              />
            </div>
          ))}
        </div>
      ) : null}
      {/* Always show a header bar with domain, even when we have images, for context */}
      {!hasImage && (
        <div className="h-20 bg-gradient-to-br from-zinc-800 via-zinc-800 to-zinc-900 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center border border-white/10">
              <Globe size={20} className="text-white/90" />
            </div>
          </div>
          <div className="absolute bottom-2 left-3 right-3 flex items-center gap-1.5 text-xs text-white/80">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {preview.domain}
          </div>
        </div>
      )}
      <div className="p-3.5">
        <div className="flex items-center gap-1.5 text-xs text-ink-3 mb-1">
          <span className="w-5 h-5 rounded-full bg-canvas border border-line flex items-center justify-center shrink-0"><Globe size={10}/></span>
          <span className="truncate font-medium">{preview.domain}</span>
          <span className="text-ink-3/40 hidden sm:inline">·</span>
          <span className="truncate hidden sm:inline text-ink-3/70">{new URL(preview.url).hostname.replace(/^www\./, '')}</span>
          <ExternalLink size={12} className="ml-auto opacity-60 group-hover:opacity-100 transition-opacity text-ink-3 shrink-0" />
        </div>
        <p className="text-sm font-semibold text-ink line-clamp-2 group-hover:text-brand leading-snug">{preview.title}</p>
        {preview.description ? (
          <p className="text-xs text-ink-3 line-clamp-2 mt-1.5 leading-relaxed">{preview.description}</p>
        ) : (
          <p className="text-xs text-ink-3/70 mt-1 italic">No description available — click to view original</p>
        )}
      </div>
    </a>
  );
}

function getDiscussionPoints(title: string): string[] {
  const t = title.toLowerCase();
  if (t.includes('next') || t.includes('react') || t.includes('javascript')) {
    return ['What do you think about the DX trade-offs?', 'Have you tried this in production? Any gotchas?', 'How does this compare to your current stack?'];
  }
  if (t.includes('ai') || t.includes('gpt') || t.includes('llm')) {
    return ['Where would you actually use this in your workflow?', 'What are the risks/limitations you see?', 'Any better alternatives you’ve tried?'];
  }
  return ['What’s your take — agree or disagree?', 'Have you seen this in the wild? Share an example.', 'What would you do differently?'];
}

export function ThreadExternalPreview({ description, content, title }: { description?: string | null; content?: string | null; title?: string | null }) {
  const url = React.useMemo(() => extractUrl(description) ?? extractUrl(content), [description, content]);
  const points = React.useMemo(() => getDiscussionPoints(title ?? description ?? ''), [title, description]);
  if (!url) return null;
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-card border border-line bg-canvas p-3">
        <p className="text-xs font-semibold tracking-widest uppercase text-ink-3 flex items-center gap-1.5"><Link2 size={12}/> Source preview — images from post</p>
        <div className="mt-2">
          <ExternalLinkPreview url={url} />
        </div>
      </div>
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-ink flex items-center gap-1.5">💬 Open to discussion</p>
        <p className="text-xs text-ink-3 mt-1">We’re keeping this thread open-ended — jump in with questions or takes. No wrong answers.</p>
        <ul className="mt-2 space-y-1.5">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
              <span className="leading-relaxed">{p}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-3 mt-3">Tip: Mention <span className="font-medium text-brand">@sai</span> to get a grounded summary of the source.</p>
      </div>
    </div>
  );
}
