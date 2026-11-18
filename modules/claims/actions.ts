'use server';

// Canonical claim verification/voting actions live in threads/actions.
// Re-exported here for stable import paths (UI imports canonical path directly).
export { createVerificationThreadAction, voteClaimAction } from '@/modules/threads/actions';
