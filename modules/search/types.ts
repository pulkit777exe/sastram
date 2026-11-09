export type SearchThreadResult = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  aiSummary?: string | null;
  messageCount: number;
  createdAt?: Date;
  creator: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
};

export type SearchMessageResult = {
  id: string;
  content: string;
  createdAt: Date;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  thread: {
    id: string;
    name: string;
    slug: string;
  };
};

export type SearchUserResult = {
  id: string;
  name: string | null;
  image: string | null;
  bio?: string | null;
  followerCount: number;
  followingCount: number;
};
