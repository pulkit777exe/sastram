// Facade over the focused thread submodules:
//   threads-core      list/get summaries
//   threads-read      SQL-heavy read models
//   threads-write     mutations
//   threads-relations semantic relation graph

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
  getThreadWithFullContext,
  getThreadMessagesPaginated,
  getThreadParticipants,
} from './threads-read/repository';
export type { PaginatedMessagesResult, ThreadParticipant } from './threads-read/repository';

export {
  findRelatedThreads,
  getRelatedThreads,
  updateAllThreadRelations,
} from './threads-relations/repository';
