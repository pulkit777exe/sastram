import { z } from 'zod';
import { AppError } from '@/lib/utils/errors';

/**
 * Strict collection-item metadata (ADR-0001: strict validation).
 *
 * Only `graph | canvas | summary | ai_synthesis` persist; an object carrying
 * any other string `type` is rejected at write time (see
 * `assertStrictMetadata`, enforced by `addToCollection` /
 * `addManyToCollection`). Metadata without a `type` field and non-object
 * metadata keep the historical passthrough behavior.
 *
 * Client-safe: imports zod only (no node builtins), so `use client`
 * components such as `CollectionItemsList` can import the view helpers.
 * The sha256 key (`metadataHash`) lives in `./metadata-hash`, which is
 * server-only because it uses `node:crypto`.
 */

const graphMetadataSchema = z
  .object({
    type: z.literal('graph'),
    nodes: z.unknown().optional(),
    links: z.unknown().optional(),
    savedAt: z.string().optional(),
  })
  .catchall(z.unknown());

const canvasMetadataSchema = z
  .object({
    type: z.literal('canvas'),
    leftId: z.unknown().optional(),
    rightId: z.unknown().optional(),
    leftName: z.unknown().optional(),
    rightName: z.unknown().optional(),
    diff: z.unknown().optional(),
  })
  .catchall(z.unknown());

const summaryMetadataSchema = z
  .object({
    type: z.literal('summary'),
    threadId: z.unknown().optional(),
    content: z.unknown().optional(),
  })
  .catchall(z.unknown());

const aiSynthesisMetadataSchema = z
  .object({
    type: z.literal('ai_synthesis'),
    text: z.unknown().optional(),
    queryType: z.unknown().optional(),
    sourceCount: z.unknown().optional(),
    sources: z.unknown().optional(),
  })
  .catchall(z.unknown());

/** Total over the four persisted kinds — no unknown passthrough. */
export const collectionMetadataSchema = z.discriminatedUnion('type', [
  graphMetadataSchema,
  canvasMetadataSchema,
  summaryMetadataSchema,
  aiSynthesisMetadataSchema,
]);

export type CollectionMetadata = z.infer<typeof collectionMetadataSchema>;
export type MetadataKind = CollectionMetadata['type'];

/**
 * Strictness gate for writes. Non-object metadata and objects without a
 * string `type` pass through (historical behavior); anything else must parse
 * as the union or the write is rejected with 400.
 */
export function assertStrictMetadata(metadata: unknown): void {
  if (typeof metadata !== 'object' || metadata === null) return;
  const type = (metadata as Record<string, unknown>).type;
  if (typeof type !== 'string') return;
  if (!collectionMetadataSchema.safeParse(metadata).success) {
    throw new AppError(`Invalid collection metadata type: '${type}'`, 'VALIDATION_ERROR', 400);
  }
}

/**
 * Canonical JSON encoding: object keys sorted recursively so semantically
 * identical metadata hashes identically regardless of key insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' ? encoded : 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export interface MetadataView {
  label: string;
  title: string;
  href: string | null;
  detail: string | null;
}

function asRecord(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return null;
  return metadata as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function canvasDiffDetail(diff: unknown): string | null {
  if (typeof diff === 'string') return diff || null;
  if (typeof diff === 'object' && diff !== null && !Array.isArray(diff)) {
    const description = (diff as Record<string, unknown>).description;
    if (typeof description === 'string' && description.length > 0) return description;
  }
  return null;
}

/**
 * List-row view for a metadata-only item. Total over the union; unknown
 * shapes fall back to the historical generic title instead of throwing.
 * Returns null when there is no metadata object to render.
 */
export function toListView(metadata: unknown): MetadataView | null {
  const meta = asRecord(metadata);
  if (!meta) return null;
  const type = meta.type;

  if (type === 'graph') {
    const nodes = asCount(meta.nodes) ?? 0;
    const edges = asCount(meta.links) ?? 0;
    return { label: 'Graph', title: `Graph: ${nodes} nodes · ${edges} edges`, href: null, detail: null };
  }
  if (type === 'canvas') {
    const left = asText(meta.leftName) ?? '?';
    const right = asText(meta.rightName) ?? '?';
    return { label: 'Canvas', title: `Canvas: ${left} vs ${right}`, href: null, detail: canvasDiffDetail(meta.diff) };
  }
  if (type === 'summary') {
    const content = asText(meta.content) ?? 'summary';
    const threadId = asText(meta.threadId);
    return {
      label: 'Summary',
      title: `Summary: ${content.slice(0, 80)}`,
      href: threadId ? `/dashboard/threads/${threadId}` : '/dashboard/threads',
      detail: asText(meta.content),
    };
  }
  if (type === 'ai_synthesis') {
    const text = asText(meta.text) ?? 'synthesis';
    return { label: 'Synthesis', title: `AI Synthesis: ${text.slice(0, 80)}`, href: null, detail: asText(meta.text) };
  }
  const title = meta.title ?? (typeof type === 'string' ? type : null) ?? 'Saved item';
  return { label: 'Item', title: String(title), href: null, detail: null };
}

/** CRLF-normalizing trim for markdown rendering (mirrors export route). */
function mdText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim();
}

function mdScalar(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return mdText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * Markdown section for a metadata-only item. Total over the union; unknown
 * shapes render as an empty string (same as the historical export route).
 */
export function toMarkdown(metadata: unknown): string {
  const meta = asRecord(metadata);
  if (!meta) return '';
  const type = meta.type;

  if (type === 'graph') {
    const nodes = asCount(meta.nodes) ?? 0;
    const edges = asCount(meta.links) ?? 0;
    return `## Graph Snapshot\n\nNodes: ${nodes}, Edges: ${edges}\n\n`;
  }
  if (type === 'canvas') {
    const left = mdScalar(meta.leftName);
    const right = mdScalar(meta.rightName);
    const diff = meta.diff;
    let diffMd = '';
    if (typeof diff === 'string') {
      diffMd = mdText(diff);
    } else if (typeof diff === 'object' && diff !== null) {
      const record = diff as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof record.description === 'string' && record.description.trim()) parts.push(record.description.trim());
      if (typeof record.sideA === 'string' && record.sideA.trim()) parts.push(`Side A: ${record.sideA.trim()}`);
      if (typeof record.sideB === 'string' && record.sideB.trim()) parts.push(`Side B: ${record.sideB.trim()}`);
      diffMd = parts.length > 0 ? parts.join('\n\n') : mdScalar(diff);
    } else {
      diffMd = mdScalar(diff);
    }
    return `## Canvas — ${left} vs ${right}\n\n${diffMd}\n\n`;
  }
  if (type === 'summary') {
    return `## Summary\n\n${mdText(meta.content)}\n\n`;
  }
  if (type === 'ai_synthesis') {
    return `## AI Synthesis\n\n${mdText(meta.text)}\n\n`;
  }
  return '';
}
