import { notFound } from 'next/navigation';
import { ThreadLiveWrapper } from '@/components/thread/thread-live-wrapper';
import { ShieldCheck, Activity } from 'lucide-react';
import type { Message } from '@/lib/types/index';
import { isAdmin, requireSession } from '@/modules/auth/session';
import { getThreadWithFullContext } from '@/modules/threads';
import Link from 'next/link';
import TimeAgo from '@/components/ui/TimeAgo';
import ThreadDnaCard from '@/components/panels/ThreadDnaCard';
import { parseThreadDna } from '@/lib/schemas/thread-dna';
import { ThreadSummaryCard } from '@/components/thread/thread-summary-card';
import { getThreadReadReceipt } from '@/modules/read-receipts/repository';
import { prisma } from '@/lib/infrastructure/prisma';
import ThreadInfoCard from '@/components/panels/ThreadInfoCard';
import RelatedThreadsCard from '@/components/panels/RelatedThreadsCard';
import ParticipantsCard from '@/components/panels/ParticipantsCard';

export default async function ThreadPage({ params }: { params: { slug: string } }) {
  const { slug } = await params;
  const session = await requireSession();

  // Fetch thread first — readReceipt and subscription both need thread.id
  const thread = await getThreadWithFullContext(slug, session.user.id);
  if (!thread) notFound();

  // Fetch dependent data in parallel
  const [readReceipt, subscription] = await Promise.all([
    getThreadReadReceipt(thread.id, session.user.id),
    // Inline query — avoids creating a repository function for a single
    // select used only in this page
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
  const canManagePoll =
    thread.createdBy === session.user.id || ['ADMIN', 'MODERATOR'].includes(session.user.role);

  const allMessages: Message[] = thread.messages.map((m) => {
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
        name: thread.title,
        slug: thread.slug,
      },
    };
  });

  const unreadMessages = thread.messages.filter((message) => {
    if (message.senderId === session.user.id) return false;
    if (!readReceipt?.readAt) return true;
    return message.createdAt > readReceipt.readAt;
  });

  const initialUnreadCount = unreadMessages.length;
  const firstUnreadMessageId = unreadMessages[0]?.id ?? null;

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <main className="flex flex-1 flex-col min-w-0 border-r border-border/60">
        <ThreadLiveWrapper
          messages={allMessages}
          threadId={thread.id}
          initialUnreadCount={initialUnreadCount}
          initialFirstUnreadMessageId={firstUnreadMessageId}
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
          canManagePoll={canManagePoll}
          currentUser={{
            id: session.user.id,
            name: session.user.name ?? 'User',
            image: session.user.image ?? null,
            role: session.user.role,
          }}
          title={thread.title}
          slug={thread.slug}
          memberCount={thread._count.members}
          initialFrequency={subscription?.frequency ?? null}
        />
      </main>

      <aside className="w-[320px] hidden xl:flex flex-col overflow-y-auto bg-background/50">
        <div className="p-6 border-b border-border/60">
          <div className="flex items-center gap-2 mb-6">
            <Activity size={14} />
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
              Thread Details
            </p>
          </div>

          <h2 className="text-xl font-bold mb-3 text-foreground">{thread.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{thread.description}</p>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <ThreadInfoCard thread={thread} />

          <ThreadSummaryCard threadId={thread.id} initialSummary={thread.aiSummary} />

          {threadDna && <ThreadDnaCard dna={threadDna} />}

          <RelatedThreadsCard threadId={thread.id} />

          <ParticipantsCard thread={thread} />

          {thread.isOutdated && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-[10px] text-amber-600 font-medium mb-2 uppercase tracking-wider">
                Stale Content Warning
              </p>
              <p className="text-xs text-amber-800">
                This thread may contain outdated information that contradicts newer content.
              </p>
            </div>
          )}

          <div className="rounded-[10px] border border-border bg-card p-4">
            <p className="text-[10px] text-zinc-400 font-bold mb-2 uppercase tracking-wider">
              Created
            </p>
            <p className="text-xs text-zinc-600 font-medium">
              <TimeAgo date={thread.createdAt} />
            </p>
          </div>
        </div>

        {isAdmin(session.user) && (
          <div className="p-6 mt-auto border-t border-border/60">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={14} className="text-zinc-500" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Admin Controls
              </span>
            </div>
            <Link
              href={`/dashboard/admin?threadId=${thread.id}`}
              className="flex items-center justify-center w-full py-2.5 text-xs font-medium border rounded-lg hover:text-zinc-900 transition-all shadow-sm"
            >
              Manage Thread
            </Link>
          </div>
        )}
      </aside>
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
