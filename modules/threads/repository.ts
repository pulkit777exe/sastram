// Facade over the focused thread submodules:
//   core      list/get summaries
//   read      SQL-heavy read models
//   write     mutations
//   relations semantic relation graph

export {
  listThreads,
  getThreadBySlug,
  type ListThreadsParams,
  type PaginatedThreads,
} from './core/repository';

export {
  createThread,
  deleteThread,
  updateThreadDNA,
  updateResolutionScore,
  updateThreadStaleness,
} from './write/repository';

export {
  getThreadWithFullContext,
  getThreadMessagesPaginated,
  getThreadParticipants,
} from './read/repository';
export type { PaginatedMessagesResult, ThreadParticipant } from './read/repository';

export {
  findRelatedThreads,
  getRelatedThreads,
  updateAllThreadRelations,
} from './relations/repository';
