"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { MessageSquare, Calendar, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils/cn";

interface Thread {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  messageCount: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface UserThreadsListProps {
  threads: Thread[];
}

export function UserThreadsList({ threads }: UserThreadsListProps) {
  if (threads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No threads yet</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {threads.map((thread, index) => (
        <motion.div
          key={thread.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
        >
          <Link
            href={`/dashboard/threads/thread/${thread.slug}`}
            className="block rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
          >
            <h3 className="font-semibold text-foreground mb-2">{thread.name}</h3>
            {thread.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {thread.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {thread.messageCount}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {thread.memberCount}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDistanceToNow(thread.createdAt, { addSuffix: true })}
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

