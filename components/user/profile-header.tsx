'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FollowButton } from './follow-button';
import { UserStats } from './user-stats';

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
    image: string | null;
    bannerUrl: string | null;
    reputationPoints: number;
    followerCount: number;
    followingCount: number;
    createdAt: Date;
  };
  isOwnProfile: boolean;
  isFollowing?: boolean;
  limitedView?: boolean;
}

export function ProfileHeader({
  user,
  isOwnProfile,
  isFollowing,
  limitedView = false,
}: ProfileHeaderProps) {
  const [followerCount, setFollowerCount] = useState(user.followerCount);
  const displayName = user.name || user.email.split('@')[0];
  const avatarUrl = user.image;
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both">
      {/* Banner */}
      <div className="relative h-48 w-full bg-linear-to-r from-primary/20 via-primary/10 to-primary/20 dark:from-primary/30 dark:via-primary/20 dark:to-primary/30">
        {user.bannerUrl && (
          <Image
            src={user.bannerUrl}
            alt={`${displayName}'s banner`}
            fill
            className="object-cover"
            priority
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
      </div>

      {/* Profile Content */}
      <div className="relative px-6 pb-6">
        {/* Avatar */}
        <div
          className="relative -mt-16 mb-4 animate-in fade-in zoom-in-90 duration-400 fill-mode-both"
          style={{ animationDelay: '200ms' }}
        >
          <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
            <AvatarImage src={avatarUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* User Info */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 space-y-2">
            <h1
              className="text-3xl font-bold text-foreground animate-in fade-in slide-in-from-left-4 duration-400 fill-mode-both"
              style={{ animationDelay: '300ms' }}
            >
              {displayName}
            </h1>

            {!limitedView && user.bio && (
              <p
                className="text-muted-foreground animate-in fade-in duration-400 fill-mode-both"
                style={{ animationDelay: '400ms' }}
              >
                {user.bio}
              </p>
            )}

            {!limitedView && (
              <div
                className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground animate-in fade-in duration-400 fill-mode-both"
                style={{ animationDelay: '500ms' }}
              >
                {user.location && (
                  <span className="flex items-center gap-1">📍 {user.location}</span>
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
              </div>
            )}

            {limitedView && (
              <p className="text-sm text-muted-foreground">This profile is private.</p>
            )}
          </div>

          {/* Actions */}
          {!isOwnProfile && !limitedView && (
            <div
              className="animate-in fade-in slide-in-from-right-4 duration-400 fill-mode-both"
              style={{ animationDelay: '300ms' }}
            >
              <FollowButton userId={user.id} isFollowing={isFollowing} onFollowChange={(delta) => setFollowerCount((prev) => Math.max(0, prev + delta))} />
            </div>
          )}
        </div>

        {/* Stats */}
        {!limitedView && (
          <div
            className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-400 fill-mode-both"
            style={{ animationDelay: '600ms' }}
          >
            <UserStats
              reputationPoints={user.reputationPoints}
              followerCount={followerCount}
              followingCount={user.followingCount}
              threadsCount={0} // Will be fetched separately
            />
          </div>
        )}
      </div>
    </div>
  );
}
