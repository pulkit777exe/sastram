/**
 * Follow system domain types
 */

export interface UserFollow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
}

export interface FollowersResponse {
  followers: Array<{
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    avatarUrl: string | null;
    bio: string | null;
    followerCount: number;
    followingCount: number;
  }>;
  total: number;
  hasMore: boolean;
}

export interface FollowingResponse {
  following: Array<{
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    avatarUrl: string | null;
    bio: string | null;
    followerCount: number;
    followingCount: number;
  }>;
  total: number;
  hasMore: boolean;
}

