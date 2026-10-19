import { describe, it } from 'mocha';
import { expect } from 'chai';
import { MAX_CONTENT_CHARS, buildIndexedContent, buildMessageContent } from '@/lib/ai/helpers';
import type { MessageInput } from '@/lib/ai/types';

function message(content: string, senderName = 'User'): MessageInput {
  return { content, sender: { name: senderName } };
}

describe('AI prompt truncation keeps the most recent messages', () => {
  it('buildMessageContent drops the oldest messages, not the newest', () => {
    const oldest = `OLDEST ${'a'.repeat(MAX_CONTENT_CHARS)}`;
    const newest = `NEWEST ${'b'.repeat(50)}`;

    const output = buildMessageContent([message(oldest), message(newest)]);

    expect(output).to.contain('NEWEST');
    expect(output).to.not.contain('OLDEST');
    expect(output.length).to.be.at.most(MAX_CONTENT_CHARS);
  });

  it('buildIndexedContent keeps newest messages and their original numbering', () => {
    const oldest = 'o'.repeat(MAX_CONTENT_CHARS);
    const newest = 'newest message';

    const output = buildIndexedContent([message(oldest, 'Alice'), message(newest, 'Bob')]);

    expect(output).to.contain(`2. Bob: ${newest}`);
    expect(output).to.not.contain('1. Alice');
    expect(output.length).to.be.at.most(MAX_CONTENT_CHARS);
  });

  it('keeps the head of a single message that alone exceeds the budget', () => {
    const content = 'x'.repeat(MAX_CONTENT_CHARS + 500);
    const formatted = `User: ${content}`;

    const output = buildMessageContent([message(content)]);

    expect(output.length).to.equal(MAX_CONTENT_CHARS);
    expect(output).to.equal(formatted.substring(0, MAX_CONTENT_CHARS));
  });

  it('returns small message sets unchanged', () => {
    const messages = [message('first'), message('second')];

    expect(buildMessageContent(messages)).to.equal('User: first\nUser: second');
    expect(buildIndexedContent(messages)).to.equal('1. User: first\n2. User: second');
  });
});
