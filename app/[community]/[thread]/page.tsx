import { notFound } from 'next/navigation';
import { getSession } from '@/modules/auth/session';
import { getThreadWithFullContext, getThreadMessagesPaginated } from '@/modules/threads';
import ThreadHeader from '@/components/thread/ThreadHeader';
import { ThreadLiveWrapper } from '@/components/thread/thread-live-wrapper';
import ReplyBox from '@/components/thread/ReplyBox';
import RightPanel from '@/components/panels/RightPanel';
import AcceptedAnswerBanner from '@/components/thread/AcceptedAnswerBanner';
import type { Message } from '@/lib/types/index';

const INITIAL_MESSAGE_LIMIT = 50;

interface ThreadPageParams {
  params: {
    community: string;
    thread: string;
  };
}

export default async function ThreadPage({ params }: ThreadPageParams) {
  const { thread: slug } = await params;
  const session = await getSession();
  if (!session) return null;

  const thread = await getThreadWithFullContext(slug, session.user.id);

  if (!thread) {
    notFound();
  }

  const isBookmarked = thread.isBookmarked;
  const isSubscribed = thread.isSubscribed;

  // Fetch only the most recent N messages for initial load (instead of all 500)
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

  return (
    <div className="h-full w-full bg-(--bg) text-(--text)">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_300px] gap-6 p-6">
        <main className="flex min-w-0 flex-col gap-4 overflow-y-auto">
          <ThreadHeader thread={thread} isBookmarked={isBookmarked} isSubscribed={isSubscribed} />

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
                id: session.user.id,
                name: session.user.name ?? '',
                image: session.user.image ?? null,
                role: session.user.role,
              }}
            />
          </div>

          <div className="mt-3 rounded-[12px] bg-(--surface) p-4 shadow-sm">
            <ReplyBox threadId={thread.id} onSuccess={() => {}} />
          </div>
        </main>

        <aside className="hidden h-full min-h-0 flex-col gap-4 md:flex">
          <RightPanel thread={thread} />
        </aside>
      </div>
    </div>
  );
}
