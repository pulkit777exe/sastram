'use client';

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
        <p className="text-lg font-semibold text-foreground">No topics found</p>
        <p className="text-muted-foreground">Try adjusting your search or create a new topic.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {topics.map((topic) => (
        <div key={topic.id}>
          <TopicCard {...topic} />
        </div>
      ))}
    </div>
  );
}
