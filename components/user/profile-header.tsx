"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { User } from "@prisma/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FollowButton } from "./follow-button";
import { UserStats } from "./user-stats";
import { cn } from "@/lib/utils/cn";

interface ProfileHeaderProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    bio: string | null;
    location: string | null;
    website: string | null;
    twitter: string | null;
    github: string | null;
    linkedin: string | null;
    image: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    reputationPoints: number;
    followerCount: number;
    followingCount: number;
    createdAt: Date;
  };
  isOwnProfile: boolean;
  isFollowing?: boolean;
}

export function ProfileHeader({ user, isOwnProfile, isFollowing }: ProfileHeaderProps) {
  const displayName = user.name || user.email.split("@")[0];
  const avatarUrl = user.avatarUrl || user.image;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-xl border bg-card"
    >
      {/* Banner */}
      <div className="relative h-48 w-full bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 dark:from-primary/30 dark:via-primary/20 dark:to-primary/30">
        {user.bannerUrl && (
          <Image
            src={user.bannerUrl}
            alt={`${displayName}'s banner`}
            fill
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      </div>

      {/* Profile Content */}
      <div className="relative px-6 pb-6">
        {/* Avatar */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="relative -mt-16 mb-4"
        >
          <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
            <AvatarImage src={avatarUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </motion.div>

        {/* User Info */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 space-y-2">
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="text-3xl font-bold text-foreground"
            >
              {displayName}
            </motion.h1>

            {user.bio && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="text-muted-foreground"
              >
                {user.bio}
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground"
            >
              {user.location && (
                <span className="flex items-center gap-1">
                  📍 {user.location}
                </span>
              )}
              {user.website && (
                <a
                  href={user.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  🔗 Website
                </a>
              )}
              {user.twitter && (
                <a
                  href={`https://twitter.com/${user.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  🐦 Twitter
                </a>
              )}
              {user.github && (
                <a
                  href={`https://github.com/${user.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  💻 GitHub
                </a>
              )}
              {user.linkedin && (
                <a
                  href={`https://linkedin.com/in/${user.linkedin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  💼 LinkedIn
                </a>
              )}
            </motion.div>
          </div>

          {/* Actions */}
          {!isOwnProfile && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <FollowButton userId={user.id} isFollowing={isFollowing} />
            </motion.div>
          )}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="mt-6"
        >
          <UserStats
            reputationPoints={user.reputationPoints}
            followerCount={user.followerCount}
            followingCount={user.followingCount}
            threadsCount={0} // Will be fetched separately
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

