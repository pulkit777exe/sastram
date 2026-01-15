"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, ArrowRight } from "lucide-react";

interface Message {
  id: string;
  content: string;
  createdAt: Date;
  sectionId: string;
  section: {
    name: string;
    slug: string;
  };
}

interface MessageGridProps {
  messages: Message[];
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function MessageGrid({ messages }: MessageGridProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-semibold text-foreground">No messages yet</p>
        <p className="text-muted-foreground">
          You haven&apos;t posted any messages yet.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-4"
    >
      {messages.map((message) => (
        <motion.div key={message.id} variants={item}>
          <Link href={`/dashboard/threads/thread/${message.section.slug}`}>
            <div className="group flex flex-col gap-2 rounded-xl bg-card border border-border p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-500/20 hover:bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-indigo-500">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <span>
                    Posted in{" "}
                    <span className="text-indigo-500">
                      {message.section.name}
                    </span>
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(message.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>

              <p className="pl-10 text-sm text-foreground/80 line-clamp-2 group-hover:text-foreground transition-colors">
                {message.content}
              </p>

              <div className="pl-10 mt-2 flex items-center text-xs font-medium text-indigo-500 opacity-80 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                View Discussion <ArrowRight className="ml-1 h-3 w-3" />
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
