import { describe, it } from 'mocha';
import { expect } from 'chai';
import { AppError } from '@/lib/utils/errors';
import { savePayloadSchema } from '@/modules/collections/schemas';
import {
  assertStrictMetadata,
  collectionMetadataSchema,
  stableStringify,
  toListView,
  toMarkdown,
} from '@/modules/collections/metadata';
import { metadataHash } from '@/modules/collections/metadata-hash';

const CUID = `c${'a'.repeat(24)}`;

const GRAPH = { type: 'graph', nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] };
const CANVAS = { type: 'canvas', leftId: 'l', rightId: 'r', leftName: 'Alpha', rightName: 'Beta', diff: 'diff text' };
const SUMMARY = { type: 'summary', threadId: 'some-thread', content: 'hello world summary content' };
const SYNTHESIS = { type: 'ai_synthesis', text: 'synthesized answer', queryType: 'factual', sourceCount: 3 };

describe('savePayloadSchema', () => {
  it('accepts a threadId payload', () => {
    expect(savePayloadSchema.safeParse({ threadId: CUID }).success).to.be.true;
  });

  it('accepts a metadata-only payload', () => {
    expect(savePayloadSchema.safeParse({ metadata: GRAPH }).success).to.be.true;
  });

  it('rejects an empty payload', () => {
    const parsed = savePayloadSchema.safeParse({});
    expect(parsed.success).to.be.false;
  });

  it('rejects a malformed cuid', () => {
    expect(savePayloadSchema.safeParse({ threadId: 'not-a-cuid' }).success).to.be.false;
  });

  it('rejects oversized metadata', () => {
    const big = { type: 'summary', content: 'x'.repeat(100_001) };
    expect(savePayloadSchema.safeParse({ metadata: big }).success).to.be.false;
  });
});

describe('collectionMetadataSchema (strict union)', () => {
  it('accepts all four kinds', () => {
    for (const meta of [GRAPH, CANVAS, SUMMARY, SYNTHESIS]) {
      expect(collectionMetadataSchema.safeParse(meta).success, JSON.stringify(meta)).to.be.true;
    }
  });

  it('rejects an unknown metadata type', () => {
    expect(collectionMetadataSchema.safeParse({ type: 'wat', title: 'Hi' }).success).to.be.false;
  });

  it('assertStrictMetadata throws VALIDATION_ERROR 400 for unknown types', () => {
    try {
      assertStrictMetadata({ type: 'wat' });
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(AppError);
      expect((error as AppError).code).to.equal('VALIDATION_ERROR');
      expect((error as AppError).statusCode).to.equal(400);
    }
  });

  it('assertStrictMetadata passes metadata through without a type field', () => {
    expect(() => assertStrictMetadata({ title: 'typeless' })).not.to.throw();
    expect(() => assertStrictMetadata(undefined)).not.to.throw();
    expect(() => assertStrictMetadata(null)).not.to.throw();
    expect(() => assertStrictMetadata(GRAPH)).not.to.throw();
  });
});

describe('toListView', () => {
  it('renders graph counts', () => {
    expect(toListView(GRAPH)).to.deep.equal({
      label: 'Graph',
      title: 'Graph: 2 nodes · 1 edges',
      href: null,
      detail: null,
    });
  });

  it('renders canvas names', () => {
    expect(toListView(CANVAS)).to.deep.equal({
      label: 'Canvas',
      title: 'Canvas: Alpha vs Beta',
      href: null,
      detail: 'diff text',
    });
  });

  it('renders summary content with a thread link', () => {
    expect(toListView(SUMMARY)).to.deep.equal({
      label: 'Summary',
      title: 'Summary: hello world summary content',
      href: '/dashboard/threads/some-thread',
      detail: 'hello world summary content',
    });
  });

  it('renders ai_synthesis text', () => {
    expect(toListView(SYNTHESIS)).to.deep.equal({
      label: 'Synthesis',
      title: 'AI Synthesis: synthesized answer',
      href: null,
      detail: 'synthesized answer',
    });
  });

  it('falls back to a generic title for unknown shapes', () => {
    expect(toListView({ type: 'wat', title: 'Hi' })).to.deep.equal({
      label: 'Item',
      title: 'Hi',
      href: null,
      detail: null,
    });
  });

  it('returns null when there is no metadata object', () => {
    expect(toListView(null)).to.be.null;
    expect(toListView(undefined)).to.be.null;
  });
});

describe('toMarkdown', () => {
  it('renders graph snapshot markers', () => {
    const md = toMarkdown(GRAPH);
    expect(md).to.contain('Graph Snapshot');
    expect(md).to.contain('Nodes: 2, Edges: 1');
  });

  it('renders canvas markers', () => {
    const md = toMarkdown(CANVAS);
    expect(md).to.contain('Canvas — Alpha vs Beta');
    expect(md).to.contain('diff text');
  });

  it('renders summary markers', () => {
    const md = toMarkdown(SUMMARY);
    expect(md).to.contain('Summary');
    expect(md).to.contain('hello world summary content');
  });

  it('renders ai_synthesis markers', () => {
    const md = toMarkdown(SYNTHESIS);
    expect(md).to.contain('AI Synthesis');
    expect(md).to.contain('synthesized answer');
  });

  it('renders nothing for unknown shapes', () => {
    expect(toMarkdown({ type: 'wat' })).to.equal('');
    expect(toMarkdown(null)).to.equal('');
  });
});

describe('metadataHash', () => {
  it('is stable across calls', () => {
    expect(metadataHash(GRAPH)).to.equal(metadataHash(GRAPH));
  });

  it('is insensitive to key order', () => {
    expect(metadataHash({ b: 1, a: 2 })).to.equal(metadataHash({ a: 2, b: 1 }));
    expect(stableStringify({ b: 1, a: [3, { z: 1, y: 2 }] })).to.equal(stableStringify({ a: [3, { y: 2, z: 1 }], b: 1 }));
  });

  it('differs for different content', () => {
    expect(metadataHash({ type: 'graph', nodes: [] })).not.to.equal(metadataHash({ type: 'graph', nodes: [1] }));
  });

  it('returns a 64-char lowercase hex sha256', () => {
    expect(metadataHash(GRAPH)).to.match(/^[0-9a-f]{64}$/);
  });
});
