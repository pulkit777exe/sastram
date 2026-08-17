export { executeAISearch } from './service';
export type { AISearchPipelineResult } from './service';
export { AISearchError } from './synthesis';
export { getCachedResult, cacheResult } from './cache';
export {
  persistSearchSession,
  listUserSearchSessions,
  getSearchSession,
} from './repository';
export type { PersistedSession } from './repository';
export { prewarmFollowUpQueries } from './query-warming';
export type {
  SearchConfig,
  QueryClassification,
  Source,
  ConflictInfo,
  SynthesisResult,
  AISearchResponse,
  Citation,
  QueryType,
} from './types';
