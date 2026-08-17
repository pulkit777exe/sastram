export { createThreadAction, deleteThreadAction, loadThreadMessages } from './actions';

export {
  listThreads,
  getThreadBySlug,
  createThread,
  deleteThread,
  getThreadWithFullContext,
  getThreadMessagesPaginated,
  getThreadParticipants,
  getRelatedThreads,
  updateAllThreadRelations,
} from './repository';

export { buildThreadDTO, buildThreadDetailDTO, toClientMessage } from './service';
export { buildThreadSlug } from '@/modules/threads/slug';

export type { ThreadRecord, ThreadSummary, ThreadDetail } from './types';
export type {
  ThreadWithFullContext,
  ThreadMessage,
  ThreadMessageReactionAggregate,
  PaginatedMessagesResult,
  ThreadParticipant,
} from './threads-read/repository';
