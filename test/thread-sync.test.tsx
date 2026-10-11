import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useThreadSync } from '@/hooks/thread/use-thread-sync';
import type { Message } from '@/lib/types/index';

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    content: 'sync test',
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

function SyncProbe({ initial }: { initial: Message[] }) {
  const sync = useThreadSync({
    initialMessages: initial,
    threadId: 'thread-1',
    title: 'Thread',
    slug: 'thread',
    hasMoreMessages: false,
    nextCursor: null,
    totalMessageCount: initial.length,
  });
  return (
    <div>
      <span data-testid="count">{sync.liveMessages.length}</span>
      <span data-testid="has-patch">{typeof sync.applyMessagePatch === 'function' ? 'yes' : 'no'}</span>
      <span data-testid="has-pending">{typeof sync.setAiPending === 'function' ? 'yes' : 'no'}</span>
      <span data-testid="has-clear">{typeof sync.clearAiStatus === 'function' ? 'yes' : 'no'}</span>
      <span data-testid="stale">{String(sync.isPollingStale)}</span>
      <button
        type="button"
        data-testid="patch-btn"
        onClick={() => sync.applyMessagePatch('m1', { content: 'patched-via-sync', isPinned: true })}
      >
        patch
      </button>
      <button
        type="button"
        data-testid="pending-btn"
        onClick={() => sync.setAiPending('m1')}
      >
        pending
      </button>
      <div data-testid="first-content">{sync.liveMessages[0]?.content ?? ''}</div>
      <div data-testid="ai-keys">{Object.keys(sync.aiInlineStatus).join(',')}</div>
    </div>
  );
}

describe('useThreadSync', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('composes messages + AI status + polling with stream refs', () => {
    render(<SyncProbe initial={[makeMsg({ id: 'm1' })]} />);
    expect(screen.getByTestId('count').textContent).to.equal('1');
    expect(screen.getByTestId('has-patch').textContent).to.equal('yes');
    expect(screen.getByTestId('has-pending').textContent).to.equal('yes');
    expect(screen.getByTestId('has-clear').textContent).to.equal('yes');
    // Polling health flag is exposed (false on mount, no failures yet).
    expect(screen.getByTestId('stale').textContent).to.equal('false');
  });

  it('applyMessagePatch updates the message in place', async () => {
    render(<SyncProbe initial={[makeMsg({ id: 'm1', content: 'before' })]} />);
    expect(screen.getByTestId('first-content').textContent).to.equal('before');
    await act(async () => {
      screen.getByTestId('patch-btn').click();
    });
    expect(screen.getByTestId('first-content').textContent).to.equal('patched-via-sync');
  });

  it('setAiPending tracks the message id', async () => {
    render(<SyncProbe initial={[makeMsg({ id: 'm1' })]} />);
    expect(screen.getByTestId('ai-keys').textContent).to.equal('');
    await act(async () => {
      screen.getByTestId('pending-btn').click();
    });
    expect(screen.getByTestId('ai-keys').textContent).to.contain('m1');
  });
});
