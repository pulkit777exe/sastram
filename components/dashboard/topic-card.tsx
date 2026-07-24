import { MessageSquare, TrendingUp, Users, ArrowRight, Hash } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/config/routes';

interface TopicCardProps {
  id: string;
  slug: string;
  name: string;
  description: string;
  activeUsers: number;
  messagesCount: number;
  unreadCount?: number;
  trending?: boolean;
  tags: string[];
}

export function TopicCard({
  slug,
  name,
  description,
  activeUsers,
  messagesCount,
  unreadCount = 0,
  trending,
  tags,
}: TopicCardProps) {
  return (
    <div className="group relative flex flex-col justify-between h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:shadow-linear-sm">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:text-brand group-hover:bg-brand/90/10 transition-colors">
            <Hash size={20} />
          </div>
          {trending && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold">
              <TrendingUp size={12} /> TRENDING
            </div>
          )}
        </div>

        <Link href={ROUTES.THREAD(slug)}>
          <h3 className="mb-2 text-lg font-bold text-foreground hover:text-brand transition-colors">
            {name}
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
              className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-medium border border-border hover:bg-brand/10 hover:text-brand"
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
        <Link href={ROUTES.THREAD(slug)} className="inline-flex items-center">
          <ArrowRight
            size={14}
            className="opacity-100 translate-x-0 md:opacity-0 md:-translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-all text-brand"
          />
        </Link>
      </div>
    </div>
  );
}
