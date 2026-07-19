import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ThreadLiveWrapper } from '@/components/thread/thread-live-wrapper';
import { ShieldCheck, Activity } from 'lucide-react';
import type { Message } from '@/lib/types/index';
import { isAdmin, requireSession, type SessionUser } from '@/modules/auth/session';
import { getThreadWithFullContext, getThreadMessagesPaginated } from '@/modules/threads';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import ThreadDnaCard from '@/components/panels/ThreadDnaCard';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import { ThreadSummaryCard } from '@/components/thread/thread-summary-card';
import { getThreadReadReceipt } from '@/modules/read-receipts/repository';
import { prisma } from '@/lib/infrastructure/prisma';
import ThreadResolutionCard from '@/components/panels/ThreadResolutionCard';
import RelatedThreadsCard from '@/components/panels/RelatedThreadsCard';
import ParticipantsCard from '@/components/panels/ParticipantsCard';
import { Skeleton } from '@/components/ui/skeleton';
import { ThreadDetailsPanel } from '@/components/thread/thread-details-panel';

const INITIAL_MESSAGE_LIMIT = 50;

function ThreadContentSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-border/60">
      <div className="flex-1 p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 p-4">
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function ThreadSidebarSkeleton() {
  return (
    <aside className="w-[320px] hidden xl:flex flex-col overflow-y-auto bg-background/50">
      <div className="p-6 border-b border-border/60">
        <Skeleton className="h-3 w-24 mb-4" />
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3 mt-1" />
      </div>
      <div className="p-4 flex flex-col gap-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </aside>
  );
}

async function ThreadContent({
  thread,
  session,
  subscription,
}: {
  thread: Awaited<ReturnType<typeof getThreadWithFullContext>>;
  session: { user: { id: string; name: string | null; image: string | null; role: string } };
  subscription: { frequency: string } | null;
}) {
  if (!thread) return null;

  const paginatedResult = await getThreadMessagesPaginated(thread.id, null, INITIAL_MESSAGE_LIMIT);

  const allMessages: Message[] = paginatedResult.messages.map((m) => {
    const raw = m as { sender?: { name?: string; image?: string }; author?: { name?: string; image?: string }; content?: string; body?: string; isAiResponse?: boolean; isAI?: boolean; id: string; createdAt: Date; senderId: string; parentId?: string | null; depth?: number; isEdited?: boolean; isPinned?: boolean; likeCount?: number; replyCount?: number; deletedAt?: Date | null; attachments?: Array<{ id: string; name?: string | null; url: string; type: string; size?: number | null }> };
    const senderName: string = raw.sender?.name ?? raw.author?.name ?? 'Anonymous';
    const senderImage: string | null = raw.sender?.image ?? raw.author?.image ?? null;
    const messageContent: string = raw.content ?? raw.body ?? '';
    const isAiResponse: boolean = raw.isAiResponse ?? raw.isAI ?? false;

    return {
      id: raw.id,
      content: messageContent,
      createdAt: raw.createdAt,
      senderId: raw.senderId,
      parentId: raw.parentId ?? null,
      threadId: thread.id,
      depth: raw.depth ?? 0,
      isEdited: raw.isEdited ?? false,
      isPinned: raw.isPinned ?? false,
      likeCount: raw.likeCount ?? 0,
      replyCount: raw.replyCount ?? 0,
      isAiResponse,
      updatedAt: raw.createdAt,
      deletedAt: raw.deletedAt ?? null,
      sender: {
        id: raw.senderId,
        name: senderName,
        image: senderImage,
      },
      attachments: (raw.attachments ?? []).map((att) => ({
        id: att.id,
        name: att.name ?? null,
        url: att.url,
        type: att.type,
        size: att.size ?? null,
      })),
      thread: {
        id: thread.id,
        name: thread.name,
        slug: thread.slug,
      },
    };
  });

  // getThreadMessagesPaginated returns DESC (newest first); reverse to ASC for rendering
  allMessages.reverse();

  const unreadMessages = paginatedResult.messages.filter((message) => {
    if (message.senderId === session.user.id) return false;
    return true;
  });

  const initialUnreadCount = unreadMessages.length;
  const firstUnreadMessageId = unreadMessages[0]?.id ?? null;

  return (
    <ThreadLiveWrapper
      messages={allMessages}
      threadId={thread.id}
      initialUnreadCount={initialUnreadCount}
      initialFirstUnreadMessageId={firstUnreadMessageId}
      hasMoreMessages={paginatedResult.hasMore}
      nextCursor={paginatedResult.nextCursor}
      totalMessageCount={paginatedResult.totalCount}
      poll={
        thread.poll
          ? {
              id: thread.poll.id,
              question: thread.poll.question,
              options: thread.poll.options as string[],
              isActive: thread.poll.isActive,
              expiresAt: thread.poll.expiresAt,
            }
          : null
      }
      canManagePoll={
        thread.createdBy === session.user.id ||
        session.user.role === 'MODERATOR' ||
        session.user.role === 'ADMIN'
      }
      currentUser={{
        id: session.user.id,
        name: session.user.name ?? 'User',
        image: session.user.image ?? null,
        role: session.user.role,
      }}
      title={thread.name}
      slug={thread.slug}
      initialFrequency={(subscription?.frequency as 'DAILY' | 'WEEKLY' | 'NEVER') ?? null}
    />
  );
}

async function ThreadSidebar({
  thread,
  session,
}: {
  thread: Awaited<ReturnType<typeof getThreadWithFullContext>>;
  session: { user: SessionUser };
}) {
  if (!thread) return null;

  const [readReceipt, subscription] = await Promise.all([
    getThreadReadReceipt(thread.id, session.user.id),
    prisma.threadSubscription.findUnique({
      where: {
        threadId_userId: {
          threadId: thread.id,
          userId: session.user.id,
        },
      },
      select: { frequency: true },
    }),
  ]);

  const threadDna = parseThreadDna(thread.threadDna);

  return (
    <aside className="w-[320px] flex flex-col overflow-y-auto bg-background/50">
      <div className="p-6 border-b border-border/60">
        <div className="flex items-center gap-2 mb-6">
          <Activity size={14} />
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Thread Details
          </p>
        </div>

        <h2 className="text-xl font-bold mb-3 text-foreground">{thread.name}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{thread.description}</p>
      </div>

      <div className="p-6 border-b border-border/60">
        <ThreadResolutionCard
          threadId={thread.id}
          score={thread.resolutionScore}
          lastVerifiedAt={thread.lastVerifiedAt ?? thread.updatedAt}
        />
      </div>

      <div className="p-6 flex flex-col gap-6">
        <ThreadSummaryCard threadId={thread.id} initialSummary={thread.aiSummary} />

        {threadDna && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Thread DNA</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
                {threadDna.questionType}
              </span>
              <span className="inline-flex items-center rounded-full bg-(--bg) px-2.5 py-1 text-[11px] font-medium text-(--text)">
                {threadDna.expertiseLevel}
              </span>
              {threadDna.topics.slice(0, 4).map((topic) => (
                <span
                  key={topic}
                  className="inline-flex items-center rounded-full border border-border/60 px-2.5 py-1 text-[10px] font-(--font-dm-mono) uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        <RelatedThreadsCard threadId={thread.id} />

        <ParticipantsCard threadId={thread.id} ownerId={thread.createdBy} />
      </div>

      {isAdmin(session.user) && (
        <div className="p-6 mt-auto border-t border-border/60">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={14} className="text-muted-foreground" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Admin Controls
            </span>
          </div>
          <Link
            href={`/dashboard/admin?threadId=${thread.id}`}
            className="flex items-center justify-center w-full py-2.5 text-xs font-medium border rounded-lg hover:text-foreground transition-all shadow-linear-sm"
          >
            Manage Thread
          </Link>
        </div>
      )}
    </aside>
  );
}

export default async function ThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireSession();

  const thread = await getThreadWithFullContext(slug, session.user.id);
  if (!thread) notFound();

  const subscription = await prisma.threadSubscription.findUnique({
    where: {
      threadId_userId: {
        threadId: thread.id,
        userId: session.user.id,
      },
    },
    select: { frequency: true },
  });

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <main className="flex flex-1 flex-col min-w-0 border-r border-border/60">
        <Suspense fallback={<ThreadContentSkeleton />}>
          <ThreadContent
            thread={thread}
            session={{
              user: {
                id: session.user.id,
                name: session.user.name ?? 'User',
                image: session.user.image ?? null,
                role: session.user.role,
              },
            }}
            subscription={subscription}
          />
        </Suspense>
      </main>

      <ThreadDetailsPanel>
        <Suspense fallback={<ThreadSidebarSkeleton />}>
          <ThreadSidebar
            thread={thread}
            session={{ user: { id: session.user.id, email: session.user.email, name: session.user.name, image: session.user.image, role: session.user.role, status: session.user.status } }}
          />
        </Suspense>
      </ThreadDetailsPanel>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col p-3 rounded-xl border border-border/60 bg-card/50">
      <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-lg font-bold text-foreground tabular-nums">{value}</span>
    </div>
  );
}
