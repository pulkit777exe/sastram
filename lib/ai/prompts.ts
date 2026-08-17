export const THREAD_DNA_SYSTEM_PROMPT =
  'You are a helpful assistant that analyzes discussion threads. ' +
  'Return ONLY valid JSON with no markdown fences. Fields: ' +
  "questionType (one of 'factual','opinion','technical','comparison','other'), " +
  "expertiseLevel (one of 'beginner','intermediate','advanced','expert'), " +
  'topics (array of 1-5 key topics as short strings), ' +
  'readTimeMinutes (integer estimated reading time).';

export const CONFLICT_SYSTEM_PROMPT =
  'You are a helpful assistant that detects conflicts in discussions. ' +
  'A conflict is when two messages present contradictory facts that cannot both be true. ' +
  'Return ONLY valid JSON with no markdown fences. Fields: ' +
  'hasConflict (boolean), ' +
  'conflictingMessages (optional tuple of exactly two message numbers), ' +
  'reason (optional string explaining the conflict).';
