import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getPublicKnowledgeBySlug,
} from '@/lib/public-content/thread';
import { ROUTES } from '@/lib/config/routes';

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublicKnowledgeBySlug(slug);
  if (!page) return {};
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = `${siteUrl}/k/${page.thread.slug}`;
  const description =
    page.thread.aiSummary?.trim() || page.thread.description?.trim() || page.thread.name;
  return {
    title: page.thread.name,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title: page.thread.name, description, url, type: 'article' },
    twitter: { card: 'summary_large_image', title: page.thread.name, description },
  };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

export default async function KnowledgePage({ params }: Props) {
  const { slug } = await params;
  const page = await getPublicKnowledgeBySlug(slug);
  if (!page) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const canonical = `${siteUrl}/k/${page.thread.slug}`;
  const qaJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'QAPage',
    mainEntity: {
      '@type': 'Question',
      name: page.thread.name,
      text: page.thread.description || page.thread.name,
      answerCount: 1,
      acceptedAnswer: {
        '@type': 'Answer',
        text: page.synthesizedContent,
        url: canonical,
        dateCreated: page.thread.createdAt.toISOString(),
        ...(page.thread.verifiedAt ? { dateModified: page.thread.verifiedAt.toISOString() } : {}),
        author: { '@type': 'Organization', name: 'Sastram' },
      },
    },
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(qaJsonLd).replace(/</g, '\\u003c') }}
      />
      <nav className="mb-6 text-sm text-ink-3">
        <Link href="/" className="hover:text-ink">Sastram</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-2">Knowledge</span>
      </nav>

      <header className="space-y-3">
        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-2">
          Verified knowledge · v{page.version}
        </span>
        <h1 className="font-serif-heading text-3xl leading-tight text-ink md:text-4xl">{page.thread.name}</h1>
        <p className="text-sm text-ink-3">
          Updated {formatDate(page.updatedAt)} · {page.thread._count.messages} source messages
        </p>
      </header>

      <article className="mt-8 rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{page.synthesizedContent}</div>
        <p className="mt-4 text-xs text-ink-3">AI-estimated synthesis of a verified public discussion.</p>
      </article>

      <section className="mt-8 flex flex-wrap gap-3">
        <Link href={`/q/${page.thread.slug}`} className="rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium text-ink">
          View discussion
        </Link>
        <Link href={`${ROUTES.LOGIN}?redirect=/dashboard/threads/${page.thread.slug}`} className="rounded-control bg-brand px-4 py-2 text-sm font-medium text-white">
          Sign in to verify, fork, or ask
        </Link>
      </section>
    </main>
  );
}
