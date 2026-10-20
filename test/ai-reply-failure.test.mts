import { describe, it } from 'mocha';
import { expect } from 'chai';
import {
  AI_REPLY_FAILURE_CONTENT,
  AI_REPLY_TIMEOUT_CONTENT,
  buildAiReplyFailureContent,
} from '@/modules/ai-reply/failure';

describe('buildAiReplyFailureContent', () => {
  it('returns a timeout message when the stream times out', () => {
    expect(buildAiReplyFailureContent(new Error('anything'), true)).to.equal(
      AI_REPLY_TIMEOUT_CONTENT
    );
  });

  it('maps provider quota and spend-cap errors to an actionable message', () => {
    expect(buildAiReplyFailureContent(new Error('429 RESOURCE_EXHAUSTED'))).to.contain('quota');
    expect(buildAiReplyFailureContent(new Error('daily spend cap reached'))).to.contain('quota');
  });

  it('maps rejected API keys to a configuration message', () => {
    const content = buildAiReplyFailureContent(
      new Error('API key not valid. Please pass a valid API key. (UNAUTHENTICATED)')
    );
    expect(content).to.contain('API key');
    expect(content).to.contain('not configured');
  });

  it('falls back to a generic retry message', () => {
    expect(buildAiReplyFailureContent(new Error('socket hang up'))).to.equal(
      AI_REPLY_FAILURE_CONTENT
    );
  });
});
