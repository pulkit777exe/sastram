import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import {
  buildMessageTree,
  countDescendants,
  isBeyondDepthLimit,
  loadCollapseStates,
  saveCollapseState,
} from '@/modules/messages/service';
import type { Message } from '@/lib/types/index';
import type { MessageNode } from '@/modules/messages/types';

import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { SearchParamsContext, PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

const mockRouter = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};

function MockNextJsProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterContext.Provider value={mockRouter}>
      <SearchParamsContext.Provider value={new URLSearchParams()}>
        <PathnameContext.Provider value="/">
          {children}
        </PathnameContext.Provider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  );
}

function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    content: 'test message',
    senderId: 'user-1',
    threadId: 'section-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    isEdited: false,
    isPinned: false,
    depth: 0,
    likeCount: 0,
    replyCount: 0,
    isAiResponse: false,
    ...overrides,
  } as Message;
}

describe('buildMessageTree', () => {
  it('should return empty array for empty input', () => {
    const result = buildMessageTree([]);
    expect(result).to.deep.equal([]);
  });

  it('should return root messages when no parentId is set', () => {
    const msgs = [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2' })];
    const result = buildMessageTree(msgs);
    expect(result).to.have.lengthOf(2);
    expect(result[0].id).to.equal('m1');
    expect(result[1].id).to.equal('m2');
  });

  it('should nest child messages under their parents', () => {
    const msgs = [
      makeMsg({ id: 'm1' }),
      makeMsg({ id: 'm2', parentId: 'm1' }),
      makeMsg({ id: 'm3', parentId: 'm1' }),
    ];
    const result = buildMessageTree(msgs);
    expect(result).to.have.lengthOf(1);
    expect(result[0].id).to.equal('m1');
    expect(result[0].children).to.have.lengthOf(2);
    expect(result[0].children[0].id).to.equal('m2');
    expect(result[0].children[1].id).to.equal('m3');
  });

  it('should handle children arriving before parents', () => {
    const msgs = [
      makeMsg({ id: 'm2', parentId: 'm1' }),
      makeMsg({ id: 'm1' }),
    ];
    const result = buildMessageTree(msgs);
    expect(result).to.have.lengthOf(1);
    expect(result[0].id).to.equal('m1');
    expect(result[0].children).to.have.lengthOf(1);
    expect(result[0].children[0].id).to.equal('m2');
  });

  it('should sort children by createdAt', () => {
    const msgs = [
      makeMsg({ id: 'm1' }),
      makeMsg({ id: 'm2', parentId: 'm1', createdAt: new Date('2024-01-03') }),
      makeMsg({ id: 'm3', parentId: 'm1', createdAt: new Date('2024-01-01') }),
    ];
    const result = buildMessageTree(msgs);
    expect(result[0].children[0].id).to.equal('m3');
    expect(result[0].children[1].id).to.equal('m2');
  });

  it('should handle orphaned messages as roots', () => {
    const msgs = [makeMsg({ id: 'child', parentId: 'missing-parent' })];
    const result = buildMessageTree(msgs);
    expect(result).to.have.lengthOf(1);
    expect(result[0].id).to.equal('child');
  });

  it('should handle deep nesting', () => {
    const msgs = [
      makeMsg({ id: 'm1' }),
      makeMsg({ id: 'm2', parentId: 'm1' }),
      makeMsg({ id: 'm3', parentId: 'm2' }),
      makeMsg({ id: 'm4', parentId: 'm3' }),
    ];
    const result = buildMessageTree(msgs);
    expect(result).to.have.lengthOf(1);
    expect(result[0].children[0].children[0].children[0].id).to.equal('m4');
  });
});

function makeNode(overrides: Partial<MessageNode> & { id: string }): MessageNode {
  return {
    content: 'test',
    senderId: 'u1',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isEdited: false,
    isPinned: false,
    depth: 0,
    likeCount: 0,
    replyCount: 0,
    isAiResponse: false,
    deletedAt: null,
    sender: { id: 'u1', name: 'Test', image: null, status: 'ACTIVE' as const },
    threadId: 't1',
    attachments: [],
    children: [],
    isCollapsed: false,
    ...overrides,
  };
}

describe('countDescendants', () => {
  it('should return 0 for leaf node', () => {
    const node = makeNode({ id: 'm1' });
    expect(countDescendants(node)).to.equal(0);
  });

  it('should count direct children', () => {
    const node = makeNode({
      id: 'm1',
      children: [makeNode({ id: 'm2', depth: 1 })],
    });
    expect(countDescendants(node)).to.equal(1);
  });

  it('should count nested descendants recursively', () => {
    const node = makeNode({
      id: 'm1',
      children: [
        makeNode({
          id: 'm2', depth: 1,
          children: [makeNode({ id: 'm3', depth: 2 })],
        }),
      ],
    });
    expect(countDescendants(node)).to.equal(2);
  });
});

describe('isBeyondDepthLimit', () => {
  it('should return false for shallow depths', () => {
    expect(isBeyondDepthLimit(0)).to.be.false;
    expect(isBeyondDepthLimit(1)).to.be.false;
    expect(isBeyondDepthLimit(3)).to.be.false;
  });

  it('should return true for depth >= 4', () => {
    expect(isBeyondDepthLimit(4)).to.be.true;
    expect(isBeyondDepthLimit(5)).to.be.true;
    expect(isBeyondDepthLimit(10)).to.be.true;
  });
});

describe('collapse state persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should save and load collapse state', () => {
    saveCollapseState('thread-1', 'msg-1', true);
    const states = loadCollapseStates('thread-1');
    expect(states.get('msg-1')).to.be.true;
  });

  it('should remove collapse state when uncollapsed', () => {
    saveCollapseState('thread-1', 'msg-1', true);
    saveCollapseState('thread-1', 'msg-1', false);
    const states = loadCollapseStates('thread-1');
    expect(states.has('msg-1')).to.be.false;
  });

  it('should not mix states across threads', () => {
    saveCollapseState('thread-1', 'msg-1', true);
    saveCollapseState('thread-2', 'msg-2', true);
    const states = loadCollapseStates('thread-1');
    expect(states.has('msg-1')).to.be.true;
    expect(states.has('msg-2')).to.be.false;
  });
});

describe('CommentTree', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('should render null when messages array is empty', async () => {
    const { CommentTree } = await import('@/components/thread/comment-tree');
    const mockScrollRef = React.createRef<HTMLDivElement>();
    const { container } = render(
      <MockNextJsProvider>
        <CommentTree
          messages={[]}
          threadId="thread-1"
          currentUser={{ id: 'user-1', name: 'Test', image: null }}
          firstUnreadMessageId={null}
          scrollContainerRef={mockScrollRef}
        />
      </MockNextJsProvider>
    );
    expect(container.innerHTML).to.equal('');
  });
});

describe('ThreadLiveWrapper', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('should render empty state when no messages', async () => {
    const { ThreadLiveWrapper } = await import('@/components/thread/thread-live-wrapper');
    render(
      <MockNextJsProvider>
        <ThreadLiveWrapper
          messages={[]}
          threadId="thread-1"
          initialUnreadCount={0}
          initialFirstUnreadMessageId={null}
          poll={null}
          canManagePoll={false}
          currentUser={{ id: 'user-1', name: 'Test', image: null }}
          title="Test Thread"
          slug="test-thread"
          memberCount={5}
          initialFrequency={null}
        />
      </MockNextJsProvider>
    );
    expect(screen.getByText('No messages yet')).to.not.be.null;
  });

  it('should render pinned message banner', async () => {
    const { ThreadLiveWrapper } = await import('@/components/thread/thread-live-wrapper');
    const pinnedMessage = {
      id: 'msg-1',
      content: 'This is pinned',
      senderId: 'user-1',
      threadId: 'section-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      isEdited: false,
      isPinned: true,
      depth: 0,
      likeCount: 0,
      replyCount: 0,
      isAiResponse: false,
    } as Message;
    render(
      <MockNextJsProvider>
        <ThreadLiveWrapper
          messages={[pinnedMessage]}
          threadId="thread-1"
          initialUnreadCount={0}
          initialFirstUnreadMessageId={null}
          poll={null}
          canManagePoll={false}
          currentUser={{ id: 'user-1', name: 'Test', image: null }}
          title="Test Thread"
          slug="test-thread"
          memberCount={5}
          initialFrequency={null}
        />
      </MockNextJsProvider>
    );
    expect(screen.getByText('📌 Pinned Message')).to.not.be.null;
    expect(screen.getByText('This is pinned')).to.not.be.null;
    expect(screen.getByText('Jump to message')).to.not.be.null;
  });
});
