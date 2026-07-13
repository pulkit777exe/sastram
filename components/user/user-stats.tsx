'use client';

import { Users, UserCheck, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface UserStatsProps {
  followerCount: number;
  followingCount: number;
  threadsCount: number;
}

export function UserStats({
  followerCount,
  followingCount,
  threadsCount,
}: UserStatsProps) {
  const stats = [
    {
      label: 'Followers',
      value: followerCount,
      icon: Users,
      color: 'text-brand',
    },
    {
      label: 'Following',
      value: followingCount,
      icon: UserCheck,
      color: 'text-brand',
    },
    {
      label: 'Threads',
      value: threadsCount,
      icon: MessageSquare,
      color: 'text-brand',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border bg-card p-4 text-center"
        >
          <stat.icon className={cn('h-5 w-5 mx-auto mb-2', stat.color)} />
          <div className="text-2xl font-bold text-foreground">{stat.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
