import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ThreadLiveWrapper } from '@/components/thread/thread-live-wrapper';
import { Badge } from '@/components/ui/badge';
import type { Message } from '@/lib/types/index';
import { isAdminUser as isAdmin, requireSession, type SessionUser } from '@/modules/auth';
import { getThreadWithFullContext, getThreadMessagesPaginated, toClientMessage, type ThreadWithFullContext } from '@/modules/threads';
import Link from 'next/link';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import { ThreadSummaryCard } from '@/components/thread/thread-summary-card';
import { prisma } from '@/lib/infrastructure/prisma';
import ThreadResolutionCard from '@/components/panels/ThreadResolutionCard';
import RelatedThreadsCard from '@/components/panels/RelatedThreadsCard';
import ParticipantsCard from '@/components/panels/ParticipantsCard';
import { Skeleton } from '@/components/ui/skeleton';
import { ThreadDetailsPanel } from '@/components/thread/thread-details-panel';
import { DetailCard } from '@/components/ui/detail-card';

const INITIAL_MESSAGE_LIMIT = 50;

function ThreadContentSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-line/60">
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
      <div className="border-t border-line/60 p-4">
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function ThreadSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-5">
      <Skeleton className="h-20 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
      <Skeleton className="h-16 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
    </div>
  );
}

async function ThreadContent({
  thread,
  session,
}: {
  thread: ThreadWithFullContext;
  session: { user: SessionUser };
}) {
  const subscription = await prisma.threadSubscription.findUnique({
    where: {
      threadId_userId: {
        threadId: thread.id,
        userId: session.user.id,
      },
    },
    select: { frequency: true },
  });

  const threadRef = { id: thread.id, name: thread.name, slug: thread.slug };

  const { messages: messagePage, hasMore: hasMoreMessages, nextCursor: oldestCursor } =
    await getThreadMessagesPaginated(thread.id, null, INITIAL_MESSAGE_LIMIT);
  const visibleMessages = [...messagePage].reverse();

  const allMessages: Message[] = visibleMessages.map((m) => toClientMessage(m, threadRef));

  const unreadMessages = allMessages.filter((message) => message.senderId !== session.user.id);

  const initialUnreadCount = unreadMessages.length;

  const firstUnreadMessageId = unreadMessages[0]?.id ?? null;

  return (
    <ThreadLiveWrapper
      messages={allMessages}
      threadId={thread.id}
      initialUnreadCount={initialUnreadCount}
      initialFirstUnreadMessageId={firstUnreadMessageId}
      hasMoreMessages={hasMoreMessages}
      nextCursor={hasMoreMessages ? oldestCursor : null}
      totalMessageCount={thread._count.messages}
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
  thread: ThreadWithFullContext;
  session: { user: SessionUser };
}) {
  const threadDna = parseThreadDna(thread.threadDna);

  return (
    <aside className="flex flex-col gap-4 p-5">
      <ThreadResolutionCard
        threadId={thread.id}
        score={thread.resolutionScore}
        lastVerifiedAt={thread.lastVerifiedAt ?? thread.updatedAt}
      />

      <ThreadSummaryCard threadId={thread.id} initialSummary={thread.aiSummary} />

      {threadDna && (
        <DetailCard className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="live" className="px-2.5 py-1 text-xs">
              {threadDna.questionType}
            </Badge>
            <Badge variant="secondary" className="px-2.5 py-1 text-xs">
              {threadDna.expertiseLevel}
            </Badge>
            {threadDna.topics.slice(0, 4).map((topic) => (
              <Badge
                key={topic}
                variant="outline"
                className="px-2.5 py-1 text-xs font-mono uppercase tracking-[0.08em]"
              >
                {topic}
              </Badge>
            ))}
          </div>
        </DetailCard>
      )}

      <RelatedThreadsCard threadId={thread.id} />

      <ParticipantsCard threadId={thread.id} ownerId={thread.createdBy} />

      {isAdmin(session.user) && (
        <Link
          href={`/dashboard/admin?threadId=${thread.id}`}
          className="flex items-center justify-center w-full py-2.5 text-xs font-medium border border-line rounded-card text-ink-2 hover:text-ink hover:bg-hover transition-colors"
        >
          Manage Thread
        </Link>
      )}
    </aside>
  );
}

export default async function ThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireSession();

  const thread = await getThreadWithFullContext(slug, session.user.id);
  if (!thread) notFound();

  return (
    <div className="flex h-full w-full overflow-hidden">
      <main className="flex flex-1 flex-col min-w-0">
        <Suspense fallback={<ThreadContentSkeleton />}>
          <ThreadContent thread={thread} session={session} />
        </Suspense>
      </main>

      <ThreadDetailsPanel>
        <Suspense fallback={<ThreadSidebarSkeleton />}>
          <ThreadSidebar thread={thread} session={session} />
        </Suspense>
      </ThreadDetailsPanel>
    </div>
  );
}
