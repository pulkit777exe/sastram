/**
 * Tags domain types
 */

export interface ThreadTag {
  id: string;
  name: string;
  slug: string;
  color: string;
  createdAt: Date;
}

export interface TagWithCount extends ThreadTag {
  threadCount: number;
}

