/**
 * Threads repository facade.
 *
 * This file now only composes focused thread submodules:
 * - threads-core: list/get summary operations
 * - threads-read: SQL-heavy read models
 * - threads-write: mutations
 * - threads-relations: semantic relation graph
 */

export {
  listThreads,
  getThreadBySlug,
  type ListThreadsParams,
  type PaginatedThreads,
} from './threads-core/repository';

export {
  createThread,
  deleteThread,
  updateThreadDNA,
  updateResolutionScore,
  updateThreadStaleness,
} from './threads-write/repository';

export { getThreadWithFullContext, getThreadMessagesPaginated } from './threads-read/repository';
export type { PaginatedMessagesResult } from './threads-read/repository';

export {
  findRelatedThreads,
  getRelatedThreads,
  updateAllThreadRelations,
} from './threads-relations/repository';

// The storage entity is now `thread` across the codebase.
const THREAD_DOMAIN_TERM = 'thread' as const;
export type ThreadDomainTerm = typeof THREAD_DOMAIN_TERM;
