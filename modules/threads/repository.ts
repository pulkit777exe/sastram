// Facade over the focused thread submodules:
//   list.ts           list/get summaries
//   read.ts           SQL-heavy read models
//   write.ts          mutations
//   relations.ts      semantic relation graph

export {
  listThreads,
  type ListThreadsParams,
  type PaginatedThreads,
} from './list';

export {
  createThread,
  deleteThread,
  updateThreadDNA,
  updateThreadVerified,
  updateThreadDetails,
  forkThread,
} from './write';

export {
  getThreadWithFullContext,
  getThreadMessagesPaginated,
  getThreadParticipants,
} from './read';
export type { PaginatedMessagesResult, ThreadParticipant } from './read';

export {
  getRelatedThreads,
  updateAllThreadRelations,
} from './relations';
