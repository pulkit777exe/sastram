import { notFound } from 'next/navigation';
import { getSession } from '@/modules/auth/session';
import { getThreadWithFullContext } from '@/modules/threads';
import ThreadHeader from '@/components/thread/ThreadHeader';
import { ThreadLiveWrapper } from '@/components/thread/thread-live-wrapper';
import ReplyBox from '@/components/thread/ReplyBox';
import RightPanel from '@/components/panels/RightPanel';
import AcceptedAnswerBanner from '@/components/thread/AcceptedAnswerBanner';

interface ThreadPageParams {
  params: {
    community: string;
    thread: string;
  };
}

export default async function ThreadPage({ params }: ThreadPageParams) {
  const { thread: slug } = params;
  const session = await getSession();
  if (!session) return null;

  const thread = await getThreadWithFullContext(slug, session.user.id);

  if (!thread) {
    notFound();
  }

  const isBookmarked = thread.isBookmarked;
  const isSubscribed = thread.isSubscribed;

  return (
    <div className="h-full w-full bg-(--bg) text-(--text)">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_300px] gap-6 p-6">
        <main className="flex min-w-0 flex-col gap-4 overflow-y-auto">
          <ThreadHeader thread={thread} isBookmarked={isBookmarked} isSubscribed={isSubscribed} />

          <div className="mt-2 flex-1 rounded-[10px] bg-(--surface) p-5">
            <AcceptedAnswerBanner answer={null} />
            <ThreadLiveWrapper
              threadId={thread.id}
              messages={thread.messages as unknown as Parameters<typeof ThreadLiveWrapper>[0]['messages']}
              initialUnreadCount={0}
              initialFirstUnreadMessageId={null}
              poll={null}
              canManagePoll={false}
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
