/**
 * Topic domain types
 */

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

