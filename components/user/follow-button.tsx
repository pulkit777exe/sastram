'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { followUser, unfollowUser } from '@/modules/follows/actions';
import { toasts } from '@/lib/utils/toast';
import { UserPlus, UserMinus } from 'lucide-react';
import { AnimatedIcon } from '@/components/ui/animated-icon';

interface FollowButtonProps {
  userId: string;
  isFollowing?: boolean;
  onFollowChange?: (delta: number) => void;
}

export function FollowButton({ userId, isFollowing: initialIsFollowing, onFollowChange }: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing || false);

  const handleToggle = async () => {
    const prev = isFollowing;
    setIsFollowing(!isFollowing);
    onFollowChange?.(isFollowing ? -1 : 1);

    try {
      const result = isFollowing
        ? await unfollowUser(userId)
        : await followUser(userId);

      if (result?.error) {
        setIsFollowing(prev);
        onFollowChange?.(isFollowing ? 1 : -1);
        toasts.error(result.error);
      } else {
        toasts.success(isFollowing ? 'Unfollowed successfully' : 'Following successfully');
      }
    } catch {
      setIsFollowing(prev);
      onFollowChange?.(isFollowing ? 1 : -1);
      toasts.error('Something went wrong');
    }
  };

  return (
    <div className="hover:scale-[1.02] active:scale-[0.98] transition-transform duration-100">
      <Button
        onClick={handleToggle}
        variant={isFollowing ? 'outline' : 'default'}
        className="min-w-[120px]"
      >
        {isFollowing ? (
          <>
            <AnimatedIcon icon={UserMinus} className="h-4 w-4 mr-2" animateOnHover />
            Unfollow
          </>
        ) : (
          <>
            <AnimatedIcon icon={UserPlus} className="h-4 w-4 mr-2" animateOnHover />
            Follow
          </>
        )}
      </Button>
    </div>
  );
}
