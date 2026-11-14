import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/modules/auth';
import {
  getPendingReportCount,
  getPublicThreadBySlug,
  getPublicThreadMessages,
  shouldNoIndexThread,
} from '@/lib/public-content/thread';
import { ROUTES } from '@/lib/config/routes';
import { PublicClaimSummaryList } from '@/components/thread/public-claim-summary';
import type { PublicClaimSummary } from '@/modules/claims/types';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const thread = await getPublicThreadBySlug(slug);
  if (!thread) return {};
  const pendingReports = await getPendingReportCount(thread.id);
  const noindex = shouldNoIndexThread(thread, pendingReports);
  const title = thread.name;
  const description =
    thread.aiSummary?.trim() || thread.description?.trim() || `Public discussion on Sastram: ${thread.name}`;
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = `${siteUrl}/q/${thread.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { title, description, url, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default async function PublicThreadPage({ params }: Props) {
  const { slug } = await params;
  const [thread, session] = await Promise.all([getPublicThreadBySlug(slug), getSession()]);
  if (!thread) notFound();
  const [messages, pendingReports] = await Promise.all([
    getPublicThreadMessages(thread.id),
    getPendingReportCount(thread.id),
  ]);
  const noindex = shouldNoIndexThread(thread, pendingReports);
  const publicClaims: PublicClaimSummary[] = messages.flatMap((m) =>
    (m.claims ?? []).map((c) => ({
      id: c.id,
      messageId: c.messageId,
      position: c.position,
      text: c.text,
      status: c.status,
      sourceLabel: c.sourceLabel,
      sourceUrl: c.sourceUrl,
      excerpt: c.excerpt,
      confidence: c.confidence,
      confirmCount: c.confirmCount,
      disputeCount: c.disputeCount,
      net: c.confirmCount - c.disputeCount,
    }))
  );
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const canonical = `${siteUrl}/q/${thread.slug}`;
  const answerText = thread.aiSummary?.trim() || thread.description?.trim() || undefined;
  const qaJsonLd = answerText
    ? {
        '@context': 'https://schema.org',
        '@type': 'QAPage',
        mainEntity: {
          '@type': 'Question',
          name: thread.name,
          text: thread.description || thread.name,
          answerCount: 1,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answerText,
            url: canonical,
            dateCreated: thread.createdAt.toISOString(),
            ...(thread.verifiedAt ? { dateModified: thread.verifiedAt.toISOString() } : {}),
            author: { '@type': 'Organization', name: 'Sastram' },
          },
        },
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      {qaJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(qaJsonLd).replace(/</g, '\\u003c') }}
        />
      ) : null}
      <nav className="mb-6 text-sm text-ink-3">
        <Link href="/" className="hover:text-ink">Sastram</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-2">Public discussion</span>
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {thread.verifiedAt ? (
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2">
              Verified answer
            </span>
          ) : null}
          {noindex ? (
            <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-3">
              Limited indexing
            </span>
          ) : null}
        </div>
        <h1 className="font-serif-heading text-3xl leading-tight text-ink md:text-4xl">{thread.name}</h1>
        {thread.description ? <p className="text-base leading-relaxed text-ink-2">{thread.description}</p> : null}
        <p className="text-sm text-ink-3">
          Updated {formatDate(thread.updatedAt)} · {thread._count.messages} messages
        </p>
      </header>

      {thread.aiSummary ? (
        <section className="mt-8 rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Synthesized answer</h2>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{thread.aiSummary}</p>
          <p className="mt-3 text-xs text-ink-3">AI-estimated summary. Verify important claims against the discussion and sources.</p>
        </section>
      ) : null}

      {publicClaims.length > 0 ? <PublicClaimSummaryList claims={publicClaims} /> : null}

      <section className="mt-8 flex flex-wrap gap-3">
        {session ? (
          <Link href={`/dashboard/threads/${thread.slug}`} className="rounded-control bg-brand px-4 py-2 text-sm font-medium text-white">
            Open in dashboard
          </Link>
        ) : (
          <>
            <Link href={`${ROUTES.LOGIN}?redirect=/dashboard/threads/${thread.slug}`} className="rounded-control bg-brand px-4 py-2 text-sm font-medium text-white">
              Sign in to verify, fork, or ask
            </Link>
            <Link href={`${ROUTES.LOGIN}?redirect=/dashboard/threads/${thread.slug}`} className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium text-ink">
              Ask the community to verify
            </Link>
          </>
        )}
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Discussion</h2>
        {messages.length === 0 ? (
          <p className="text-sm text-ink-3">No messages yet.</p>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-card border border-line bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                  <span className="font-medium text-ink-2">{m.author?.name ?? (m.isAI ? 'Sai' : 'Member')}</span>
                  <span>·</span>
                  <time dateTime={m.createdAt.toISOString()}>{formatDate(m.createdAt)}</time>
                  {m.isAI ? <span className="rounded-full border border-line px-2 py-0.5">AI</span> : null}
                  {m.isEdited ? <span>(edited)</span> : null}
                </div>
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{m.content}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
