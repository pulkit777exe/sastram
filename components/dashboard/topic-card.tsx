import { MessageSquare, TrendingUp, Users, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface TopicCardProps {
  id: string;
  title: string;
  description: string;
  activeUsers: number;
  messagesCount: number;
  trending?: boolean;
  tags: string[];
}

export function TopicCard({
  id,
  title,
  description,
  activeUsers,
  messagesCount,
  trending,
  tags,
}: TopicCardProps) {
  return (
    <Link href={`/dashboard/topics/${id}`}>
      <div className="group relative flex flex-col justify-between rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
        <div>
          <div className="flex items-start justify-between mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
               <span className="text-lg font-bold">#</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
          
          <h3 className="mb-2 text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
            {title}
          </h3>
          <p className="mb-4 text-sm text-slate-500 line-clamp-2">
            {description}
          </p>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {tag}
              </span>
            ))}
            {trending && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                <TrendingUp className="mr-1 h-3 w-3" />
                Trending
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-50 pt-4 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{activeUsers} active</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>{messagesCount} msgs</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
