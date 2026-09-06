'use client';

import { useState } from 'react';
import { followUser, unfollowUser } from '@/modules/follows/actions';
import { toasts } from '@/lib/utils/toast';
import { Button } from '@/components/ui/button';
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
    const nextFollowing = !isFollowing;
    setIsFollowing(nextFollowing);
    if (isFollowing) onFollowChange?.(-1);
    else onFollowChange?.(1);

    try {
      let result;
      if (isFollowing) result = await unfollowUser({ userId });
      else result = await followUser({ userId });

      if (result?.error) {
        setIsFollowing(prev);
        if (isFollowing) onFollowChange?.(1);
        else onFollowChange?.(-1);
        toasts.error(result.error);
        return;
      }
      if (isFollowing) toasts.success('Unfollowed successfully');
      else toasts.success('Following successfully');
    } catch {
      setIsFollowing(prev);
      if (isFollowing) onFollowChange?.(1);
      else onFollowChange?.(-1);
      toasts.error('Something went wrong');
    }
  };

  function renderFollowContent() {
    if (isFollowing) {
      return (
        <>
          <AnimatedIcon icon={UserMinus} className="h-4 w-4 mr-2" animateOnHover />
          Unfollow
        </>
      );
    }
    return (
      <>
        <AnimatedIcon icon={UserPlus} className="h-4 w-4 mr-2" animateOnHover />
        Follow
      </>
    );
  }

  return (
    <div className="hover:scale-[1.02] active:scale-[0.98] transition-transform duration-100">
      <Button variant={isFollowing ? 'outline' : 'default'} className="min-w-30" onClick={handleToggle}>
        {renderFollowContent()}
      </Button>
    </div>
  );
}
