import {
  MessageSquare,
  TrendingUp,
  Users,
  ArrowRight,
  Hash,
} from "lucide-react";
import Link from "next/link";

interface TopicCardProps {
  id: string;
  slug: string;
  title: string;
  description: string;
  activeUsers: number;
  messagesCount: number;
  trending?: boolean;
  tags: string[];
}

export function TopicCard({
  slug,
  title,
  description,
  activeUsers,
  messagesCount,
  trending,
  tags,
}: TopicCardProps) {
  return (
    <Link href={`/dashboard/threads/thread/${slug}`}>
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

          <h3 className="mb-2 text-lg font-bold text-foreground group-hover:text-indigo-500 transition-colors">
            {title}
          </h3>
          <p className="mb-4 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {description}
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-medium border border-border"
              >
                {tag}
              </span>
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
          <ArrowRight
            size={14}
            className="opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-indigo-500"
          />
        </div>
      </div>
    </Link>
  );
}
