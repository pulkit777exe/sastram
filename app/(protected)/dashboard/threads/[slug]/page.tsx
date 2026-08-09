import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ThreadLiveWrapper } from '@/components/thread/thread-live-wrapper';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Activity } from 'lucide-react';
import type { Message } from '@/lib/types/index';
import { isAdminUser as isAdmin, requireSession, type SessionUser } from '@/modules/auth/session';
import { getThreadWithFullContext, toClientMessage } from '@/modules/threads';
import Link from 'next/link';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import { ThreadSummaryCard } from '@/components/thread/thread-summary-card';
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
    <aside className="w-80 hidden xl:flex flex-col overflow-y-auto bg-background/50">
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

  const threadRef = { id: thread.id, name: thread.name, slug: thread.slug };

  // getThreadWithFullContext already returned every message (ASC, including
  // soft-deleted ones); no second paginated query is needed here.
  const liveMessages = thread.messages.filter((m) => m.deletedAt === null);
  const hasMoreMessages = liveMessages.length > INITIAL_MESSAGE_LIMIT;
  const visibleMessages = hasMoreMessages
    ? liveMessages.slice(-INITIAL_MESSAGE_LIMIT)
    : liveMessages;

  const allMessages: Message[] = visibleMessages.map((m) => toClientMessage(m, threadRef));

  const unreadMessages = allMessages.filter((message) => message.senderId !== session.user.id);

  const initialUnreadCount = unreadMessages.length;
  const firstUnreadMessageId = unreadMessages[unreadMessages.length - 1]?.id ?? null;

  return (
    <ThreadLiveWrapper
      messages={allMessages}
      threadId={thread.id}
      initialUnreadCount={initialUnreadCount}
      initialFirstUnreadMessageId={firstUnreadMessageId}
      hasMoreMessages={hasMoreMessages}
      nextCursor={hasMoreMessages ? (visibleMessages[0]?.id ?? null) : null}
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
  thread: Awaited<ReturnType<typeof getThreadWithFullContext>>;
  session: { user: SessionUser };
}) {
  if (!thread) return null;

  const threadDna = parseThreadDna(thread.threadDna);

  return (
    <aside className="w-80 flex flex-col overflow-y-auto bg-background/50 shadow-linear-md">
      <div className="p-6 border-b border-border/60">
        <div className="flex items-center gap-2 mb-6">
          <Activity size={14} />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
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
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Thread DNA</p>
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
                  className="px-2.5 py-1 text-xs font-(--font-dm-mono) uppercase tracking-[0.08em]"
                >
                  {topic}
                </Badge>
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
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
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
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-lg font-bold text-foreground tabular-nums">{value}</span>
    </div>
  );
}
