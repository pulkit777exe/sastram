"use client";

import { motion } from "framer-motion";
import { TopicCard } from "@/components/dashboard/topic-card";

interface Topic {
  id: string;
  title: string;
  description: string;
  activeUsers: number;
  messagesCount: number;
  trending: boolean;
  tags: string[];
}

interface TopicGridProps {
  topics: Topic[];
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export function TopicGrid({ topics }: TopicGridProps) {
  if (topics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">No topics found</p>
        <p className="text-slate-500">
          Try adjusting your search or create a new topic.
        </p>
      </div>
    );
  }

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {topics.map((topic) => (
        <motion.div key={topic.id} variants={item}>
          <TopicCard {...topic} />
        </motion.div>
      ))}
    </motion.div>
  );
}
