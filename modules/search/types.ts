/**
 * Search domain types
 */

export type SearchThreadResult = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  messageCount: number;
  memberCount: number;
  creator: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  _count: {
    messages: number;
    members: number;
  };
};

export type SearchMessageResult = {
  id: string;
  content: string;
  createdAt: Date;
  sender: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  thread: {
    id: string;
    name: string;
    slug: string;
  };
};

export type SearchUserResult = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
};
