import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { MessageReactions } from '@/components/thread/message-reactions';
import { toClientMessage } from '@/modules/threads/service';
import type { MessageReaction } from '@/lib/types';

describe('MessageReactions', () => {
  afterEach(cleanup);

  it('renders Discord-style chips with counts and toggles on click', () => {
    const reactions: MessageReaction[] = [
      { emoji: '👍', count: 2, hasReacted: false },
      { emoji: '🔥', count: 1, hasReacted: true },
    ];
    const toggled: string[] = [];

    render(<MessageReactions reactions={reactions} onToggle={(emoji) => toggled.push(emoji)} />);

    const thumbs = screen.getByRole('button', { name: '👍 2 reactions' });
    const fire = screen.getByRole('button', { name: '🔥 1 reaction, including you' });
    expect(thumbs.getAttribute('aria-pressed')).to.equal('false');
    expect(fire.getAttribute('aria-pressed')).to.equal('true');

    fireEvent.click(fire);
    expect(toggled).to.deep.equal(['🔥']);
  });

  it('renders nothing when there are no reactions', () => {
    const { container } = render(<MessageReactions reactions={[]} onToggle={() => {}} />);
    expect(container.innerHTML).to.equal('');
  });
});

describe('toClientMessage reaction mapping', () => {
  it('maps aggregate counts and the viewer reaction state', () => {
    const message = {
      id: 'm1',
      content: 'hello',
      threadId: 't1',
      senderId: 'u1',
      parentId: null,
      depth: 0,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      isEdited: false,
      isPinned: false,
      isAI: false,
      deletedAt: null,
      likeCount: 3,
      replyCount: 0,
      author: { id: 'u1', name: 'User', image: null },
      reactions: [
        { type: '👍', _count: 2 },
        { type: '🔥', _count: 1 },
      ],
      reactedEmojis: ['🔥'],
      likedByUser: false,
      attachments: [],
    } as unknown as Parameters<typeof toClientMessage>[0];

    const mapped = toClientMessage(message, { id: 't1', name: 'Thread', slug: 'thread' });

    expect(mapped.reactions).to.deep.equal([
      { emoji: '👍', count: 2, hasReacted: false },
      { emoji: '🔥', count: 1, hasReacted: true },
    ]);
  });
});
