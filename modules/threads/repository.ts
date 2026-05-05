/**
 * Threads repository facade.
 *
 * This file now only composes focused thread submodules:
 * - threads-core: list/get summary operations
 * - threads-read: SQL-heavy read models
 * - threads-write: mutations
 * - threads-members: membership management
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

export {
  getThreadMembers,
  addThreadMember,
  updateThreadMemberRole,
  removeThreadMember,
} from './threads-members/repository';

export { getThreadWithFullContext } from './threads-read/repository';

export {
  findRelatedThreads,
  getRelatedThreads,
  updateAllThreadRelations,
  cleanupOldThreadRelations,
} from './threads-relations/repository';

// Naming adapter: the storage entity is still `section`, but the domain term is `thread`.
export const THREAD_DOMAIN_TERM = 'thread' as const;
export type ThreadDomainTerm = typeof THREAD_DOMAIN_TERM;
