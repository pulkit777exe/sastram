import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getSession } from '@/modules/auth/session';
import { getThreadWithFullContext, getThreadMessagesPaginated } from '@/modules/threads';
import ThreadHeader from '@/components/thread/ThreadHeader';
import dynamic from 'next/dynamic';
import ReplyBox from '@/components/thread/ReplyBox';
import RightPanel from '@/components/panels/RightPanel';
import AcceptedAnswerBanner from '@/components/thread/AcceptedAnswerBanner';
import type { Message } from '@/lib/types/index';
import { Skeleton } from '@/components/ui/skeleton';

const ThreadLiveWrapper = dynamic(() => import('@/components/thread/thread-live-wrapper').then(m => ({ default: m.ThreadLiveWrapper })), {
  loading: () => (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex-1 p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
});

const INITIAL_MESSAGE_LIMIT = 50;

interface ThreadPageParams {
  params: {
    community: string;
    thread: string;
  };
}

async function ThreadContent({ slug, userId }: { slug: string; userId: string }) {
  const thread = await getThreadWithFullContext(slug, userId);

  if (!thread) {
    notFound();
  }

  const paginatedResult = await getThreadMessagesPaginated(thread.id, null, INITIAL_MESSAGE_LIMIT);

  const allMessages: Message[] = paginatedResult.messages.map((m) => ({
    id: m.id,
    content: m.body,
    createdAt: m.createdAt,
    senderId: m.senderId,
    parentId: m.parentId ?? null,
    threadId: thread.id,
    depth: m.depth ?? 0,
    isEdited: m.isEdited ?? false,
    isPinned: m.isPinned ?? false,
    likeCount: m.likeCount ?? 0,
    replyCount: m.replyCount ?? 0,
    isAiResponse: m.isAI,
    updatedAt: m.createdAt,
    deletedAt: m.deletedAt ?? null,
    sender: {
      id: m.author.id,
      name: m.author.name ?? 'Anonymous',
      image: m.author.image ?? null,
    },
    attachments: (m.attachments ?? []).map((att) => ({
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
  }));

  return (
    <>
      <ThreadHeader thread={thread} isBookmarked={thread.isBookmarked} isSubscribed={thread.isSubscribed} />
      <div className="mt-2 flex-1 rounded-[10px] bg-(--surface) p-5">
        <AcceptedAnswerBanner answer={null} />
        <ThreadLiveWrapper
          threadId={thread.id}
          messages={allMessages}
          initialUnreadCount={0}
          initialFirstUnreadMessageId={null}
          hasMoreMessages={paginatedResult.hasMore}
          nextCursor={paginatedResult.nextCursor}
          totalMessageCount={paginatedResult.totalCount}
          poll={null}
          canManagePoll={false}
          title={thread.name ?? thread.slug}
          slug={thread.slug}
          memberCount={thread._count?.members ?? 0}
          initialFrequency={null}
          currentUser={{
            id: userId,
            name: '',
            image: null,
            role: 'USER',
          }}
        />
      </div>
      <div className="mt-3 rounded-[12px] bg-(--surface) p-4 shadow-sm">
        <ReplyBox threadId={thread.id} onSuccess={() => {}} />
      </div>
    </>
  );
}

async function ThreadSidebar({ slug, userId }: { slug: string; userId: string }) {
  const thread = await getThreadWithFullContext(slug, userId);
  if (!thread) return null;
  return <RightPanel thread={thread} />;
}

export default async function ThreadPage({ params }: ThreadPageParams) {
  const { thread: slug } = await params;
  const session = await getSession();
  if (!session) return null;

  return (
    <div className="h-full w-full bg-(--bg) text-(--text)">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_300px] gap-6 p-6">
        <main className="flex min-w-0 flex-col gap-4 overflow-y-auto">
          <Suspense fallback={<Skeleton className="h-12 w-full rounded-[10px]" />}>
            <ThreadContent slug={slug} userId={session.user.id} />
          </Suspense>
        </main>

        <aside className="hidden h-full min-h-0 flex-col gap-4 md:flex">
          <Suspense fallback={<Skeleton className="h-full w-[300px] rounded-[10px]" />}>
            <ThreadSidebar slug={slug} userId={session.user.id} />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
