import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  mergeMessages,
  applyMessagePatchToList,
} from '@/hooks/thread/use-thread-messages';
import type { Message } from '@/lib/types/index';

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    content: 'hello',
    senderId: 'user-1',
    threadId: 'thread-1',
    parentId: null,
    depth: 0,
    isEdited: false,
    isPinned: false,
    likeCount: 0,
    replyCount: 0,
    isAiResponse: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    sender: { id: 'user-1', name: 'User', image: null },
    thread: { id: 'thread-1', name: 'Thread', slug: 'thread' },
    attachments: [],
    ...overrides,
  } as Message;
}

describe('mergeMessages (patched fields)', () => {
  it('returns the same reference when nothing changed', () => {
    const prev = [makeMsg({ id: 'm1' })];
    const incoming = [makeMsg({ id: 'm1' })];
    const { merged, hasNew } = mergeMessages(prev, incoming);
    expect(hasNew).to.equal(false);
    expect(merged).to.equal(prev);
  });

  it('patches content/isPinned/deletedAt/likeCount on existing messages', () => {
    const prev = [makeMsg({ id: 'm1', content: 'old', isPinned: false, likeCount: 1, deletedAt: null })];
    const incoming = [
      makeMsg({
        id: 'm1',
        content: 'new',
        isPinned: true,
        likeCount: 5,
        deletedAt: new Date('2024-02-01T00:00:00Z'),
      }),
    ];
    const { merged, hasNew } = mergeMessages(prev, incoming);
    expect(hasNew).to.equal(true);
    expect(merged).to.have.lengthOf(1);
    expect(merged[0]!.content).to.equal('new');
    expect(merged[0]!.isPinned).to.equal(true);
    expect(merged[0]!.likeCount).to.equal(5);
    expect(merged[0]!.deletedAt).to.not.equal(null);
    // Original list is not mutated.
    expect(prev[0]!.content).to.equal('old');
  });

  it('appends new messages sorted by createdAt', () => {
    const prev = [makeMsg({ id: 'm2', createdAt: new Date('2024-01-02T00:00:00Z') })];
    const incoming = [makeMsg({ id: 'm1', createdAt: new Date('2024-01-01T00:00:00Z') })];
    const { merged, hasNew } = mergeMessages(prev, incoming);
    expect(hasNew).to.equal(true);
    expect(merged.map((m) => m.id)).to.deep.equal(['m1', 'm2']);
  });
});

describe('applyMessagePatchToList', () => {
  it('applies a partial patch to the matching message', () => {
    const prev = [makeMsg({ id: 'm1', content: 'a' }), makeMsg({ id: 'm2', content: 'b' })];
    const next = applyMessagePatchToList(prev, 'm1', { content: 'patched', isPinned: true });
    expect(next[0]!.content).to.equal('patched');
    expect(next[0]!.isPinned).to.equal(true);
    expect(next[1]!.content).to.equal('b');
    expect(prev[0]!.content).to.equal('a');
  });

  it('returns the same reference when the id is unknown', () => {
    const prev = [makeMsg({ id: 'm1' })];
    expect(applyMessagePatchToList(prev, 'missing', { content: 'x' })).to.equal(prev);
  });
});
