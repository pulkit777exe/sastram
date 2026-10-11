import { createHash } from 'node:crypto';
import { stableStringify } from './metadata';

/**
 * Server-only metadata hash (uses `node:crypto` — never import this module
 * from `use client` components; they should use `./metadata` instead).
 *
 * sha256 over the stable key-sorted encoding, so semantically identical
 * metadata maps to one hash regardless of key insertion order. Backs the
 * `CollectionItem.metadataHash` unique-per-collection dedupe key, with the
 * legacy Json-equals check kept as a fallback for pre-backfill rows.
 */
export function metadataHash(metadata: unknown): string {
  return createHash('sha256').update(stableStringify(metadata)).digest('hex');
}
