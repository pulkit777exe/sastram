'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-card border border-dashed border-line bg-surface">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Search size={22} className="text-muted-foreground" />
        </div>
        <p className="text-lg font-semibold text-ink">No topics found</p>
        <p className="text-sm text-ink-3 mt-1 max-w-sm">Try adjusting your search or create a new topic to get started.</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/threads">Browse threads</Link>
        </Button>
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
