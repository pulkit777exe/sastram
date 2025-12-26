"use client";

import { motion } from "framer-motion";
import { Trophy, Users, UserCheck, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface UserStatsProps {
  reputationPoints: number;
  followerCount: number;
  followingCount: number;
  threadsCount: number;
}

export function UserStats({
  reputationPoints,
  followerCount,
  followingCount,
  threadsCount,
}: UserStatsProps) {
  const stats = [
    {
      label: "Reputation",
      value: reputationPoints,
      icon: Trophy,
      color: "text-yellow-500",
    },
    {
      label: "Followers",
      value: followerCount,
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: "Following",
      value: followingCount,
      icon: UserCheck,
      color: "text-green-500",
    },
    {
      label: "Threads",
      value: threadsCount,
      icon: MessageSquare,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
          className="rounded-lg border bg-card p-4 text-center"
        >
          <stat.icon className={cn("h-5 w-5 mx-auto mb-2", stat.color)} />
          <div className="text-2xl font-bold text-foreground">{stat.value}</div>
          <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
        </motion.div>
      ))}
    </div>
  );
}

