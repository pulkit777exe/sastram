'use client';

import { motion } from 'framer-motion';
import { staggerContainer, fadeUpItem } from '@/lib/motion';
import { TopicCard } from '@/components/dashboard/topic-card';

interface Topic {
  id: string;
  slug: string;
  name: string;
  description: string;
  activeUsers: number;
  messagesCount: number;
  unreadCount?: number;
  trending: boolean;
  tags: string[];
}

interface TopicGridProps {
  topics: Topic[];
}

export function TopicGrid({ topics }: TopicGridProps) {
  if (topics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-semibold text-slate-900">No topics found</p>
        <p className="text-slate-500">Try adjusting your search or create a new topic.</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {topics.map((topic) => (
        <motion.div key={topic.id} variants={fadeUpItem}>
          <TopicCard {...topic} />
        </motion.div>
      ))}
    </motion.div>
  );
}
