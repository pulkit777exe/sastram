import { cache } from 'react';
import type { CommunitySummary } from './types';

export function buildCommunityDTO(): CommunitySummary {
  return {
    id: 'removed',
    slug: 'removed',
    title: 'Removed',
    description: null,
    visibility: 'PUBLIC',
    threadCount: 0,
    createdAt: new Date(0),
  };
}

export const listCommunities = cache(async (): Promise<CommunitySummary[]> => []);

export const getJoinedCommunities = cache(async (_userId: string): Promise<CommunitySummary[]> => []);

export async function createCommunity(): Promise<CommunitySummary> {
  throw new Error('Communities have been removed. Create threads directly.');
}
