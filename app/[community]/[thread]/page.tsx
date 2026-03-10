import { notFound } from "next/navigation";
import { requireSession } from "@/modules/auth/session";
import { getThreadWithFullContext } from "@/modules/threads";
import ThreadHeader from "@/components/thread/ThreadHeader";
import MessageTree from "@/components/thread/MessageTree";
import ReplyBox from "@/components/thread/ReplyBox";
import RightPanel from "@/components/panels/RightPanel";
import AcceptedAnswerBanner from "@/components/thread/AcceptedAnswerBanner";

interface ThreadPageParams {
  params: {
    community: string;
    thread: string;
  };
}

export default async function ThreadPage({ params }: ThreadPageParams) {
  const { thread: slug } = params;
  const session = await requireSession();

  const thread = await getThreadWithFullContext(slug, session.user.id);

  if (!thread) {
    notFound();
  }

  const isBookmarked = thread.bookmarks.some(
    (b) => b.userId === session.user.id,
  );
  const isSubscribed = thread.subscriptions.some(
    (s) => s.userId === session.user.id,
  );

  return (
    <div className="h-full w-full bg-(--bg) text-(--text)">
      <div className="grid h-full grid-cols-[minmax(0,1fr)_300px] gap-[24px] px-[24px] pb-[24px] pt-[16px]">
        <main className="flex min-w-0 flex-col gap-[16px] overflow-y-auto">
          <ThreadHeader
            thread={thread}
            isBookmarked={isBookmarked}
            isSubscribed={isSubscribed}
          />

          <div className="mt-[8px] flex-1 rounded-[10px] bg-(--surface) p-[20px]">
            <AcceptedAnswerBanner answer={null} />
            <MessageTree
              threadId={thread.id}
              initialMessages={thread.messages}
              currentUserId={session.user.id}
            />
          </div>

          <div className="mt-[12px] rounded-[12px] bg-(--surface) p-[16px] shadow-sm">
            <ReplyBox threadId={thread.id} onSuccess={() => {}} />
          </div>
        </main>

        <aside className="hidden h-full min-h-0 flex-col gap-[16px] md:flex">
          <RightPanel thread={thread} />
        </aside>
      </div>
    </div>
  );
}

