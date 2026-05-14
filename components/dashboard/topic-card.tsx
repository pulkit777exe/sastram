import { MessageSquare, TrendingUp, Users, ArrowRight, Hash } from 'lucide-react';
import Link from 'next/link';

interface TopicCardProps {
  id: string;
  slug: string;
  title: string;
  description: string;
  activeUsers: number;
  messagesCount: number;
  unreadCount?: number;
  trending?: boolean;
  tags: string[];
}

export function TopicCard({
  slug,
  title,
  description,
  activeUsers,
  messagesCount,
  unreadCount = 0,
  trending,
  tags,
}: TopicCardProps) {
  return (
    <div className="group relative flex flex-col justify-between h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:shadow-[0_0_30px_rgba(99,102,241,0.05)]">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors">
            <Hash size={20} />
          </div>
          {trending && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold">
              <TrendingUp size={12} /> TRENDING
            </div>
          )}
        </div>

        <Link href={`/dashboard/threads/thread/${slug}`}>
          <h3 className="mb-2 text-lg font-bold text-foreground hover:text-indigo-500 transition-colors">
            {title}
          </h3>
        </Link>
        {unreadCount > 0 && (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            {unreadCount} unread
          </div>
        )}
        <p className="mb-4 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {description}
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/dashboard?tag=${encodeURIComponent(tag.toLowerCase())}`}
              className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-medium border border-border hover:bg-indigo-50 hover:text-indigo-700"
            >
              #{tag}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4 text-[11px] font-medium text-muted-foreground">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-muted-foreground" />
            <span>{activeUsers} active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare size={14} className="text-muted-foreground" />
            <span>{messagesCount} msgs</span>
          </div>
        </div>
        <Link href={`/dashboard/threads/thread/${slug}`} className="inline-flex items-center">
          <ArrowRight
            size={14}
            className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-indigo-500"
          />
        </Link>
      </div>
    </div>
  );
}
