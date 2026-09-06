import { MessageSquare, TrendingUp, Users, ArrowRight, Hash } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/config/routes';
import { Badge } from '@/components/ui/badge';

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
    <div className="group relative flex h-full flex-col justify-between rounded-control border border-line bg-surface p-5 transition-all duration-300 hover:shadow-linear-sm">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-control border border-line bg-field text-ink-3 transition-colors group-hover:border-brand/20 group-hover:bg-brand/10 group-hover:text-brand">
            <Hash size={20} />
          </div>
          {trending && (
            <Badge variant="warning" className="gap-1">
              <TrendingUp size={12} /> TRENDING
            </Badge>
          )}
        </div>

        <Link href={ROUTES.THREAD(slug)}>
          <h3 className="mb-2 text-lg font-bold text-ink hover:text-brand transition-colors">
            {name}
          </h3>
        </Link>
        {unreadCount > 0 && (
          <Badge variant="live" className="mb-2 gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {unreadCount} unread
          </Badge>
        )}
        <p className="mb-4 text-sm text-ink-3 line-clamp-2 leading-relaxed">
          {description}
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/dashboard?tag=${encodeURIComponent(tag.toLowerCase())}`}
            >
              <Badge variant="outline" className="hover:bg-brand/10 hover:text-brand">
                #{tag}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-4 text-xs font-medium text-ink-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-ink-3" />
            <span>{activeUsers} active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare size={14} className="text-ink-3" />
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
