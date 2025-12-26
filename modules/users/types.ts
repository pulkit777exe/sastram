/**
 * User domain types
 */

export interface UserProfile {
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
  role: string;
  status: string;
  createdAt: Date;
}

