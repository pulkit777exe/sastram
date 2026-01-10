"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { followUser, unfollowUser } from "@/modules/follows/actions";
import { toast } from "sonner";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatedIcon } from "@/components/ui/animated-icon";

interface FollowButtonProps {
  userId: string;
  isFollowing?: boolean;
}

export function FollowButton({ userId, isFollowing: initialIsFollowing }: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing || false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      if (isFollowing) {
        const result = await unfollowUser(userId);
        if (result && typeof result === "object") {
          if ("error" in result && result.error) {
            toast.error(result.error);
          } else if ("message" in result && result.message) {
            toast.error(result.message);
          } else if ("success" in result && result.success) {
            setIsFollowing(false);
            toast.success("Unfollowed successfully");
            router.refresh();
          } else {
            toast.error("Failed to unfollow");
          }
        } else {
          toast.error("Failed to unfollow");
        }
      } else {
        const result = await followUser(userId);
        if (result && typeof result === "object") {
          if ("error" in result && result.error) {
            toast.error(result.error);
          } else if ("message" in result && result.message) {
            toast.error(result.message);
          } else if ("success" in result && result.success) {
            setIsFollowing(true);
            toast.success("Following successfully");
            router.refresh();
          } else {
            toast.error("Failed to follow");
          }
        } else {
          toast.error("Failed to follow");
        }
      }
    } catch (error) {
      toast.error("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Button
        onClick={handleToggle}
        disabled={isLoading}
        variant={isFollowing ? "outline" : "default"}
        className="min-w-[120px]"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : isFollowing ? (
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
    </motion.div>
  );
}

