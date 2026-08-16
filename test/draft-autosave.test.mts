import { describe, it, before, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';

// Loaded lazily so the composer's module graph is not evaluated at spec load
// time, matching the dynamic-import style used by the component specs.
let draftKey: (threadId: string, parentId?: string) => string;

async function loadDraftKey(): Promise<void> {
  ({ draftKey } = await import('@/hooks/use-message-composer'));
}

describe('draft key scoping', function () {
  this.timeout(10_000);

  before(loadDraftKey);

  it('should use the root suffix when there is no parentId', () => {
    expect(draftKey('thread-1')).to.equal('sastram:draft:thread-1:root');
  });

  it('should include the parentId for a reply', () => {
    const key = draftKey('thread-1', 'msg-1');
    expect(key).to.contain('msg-1');
    expect(key).to.equal('sastram:draft:thread-1:msg-1');
  });

  it('should produce different keys for sibling replies in the same thread', () => {
    const first = draftKey('thread-1', 'msg-1');
    const second = draftKey('thread-1', 'msg-2');
    expect(first).to.not.equal(second);
  });

  it('should produce different keys for the same parentId in different threads', () => {
    const first = draftKey('thread-1', 'msg-1');
    const second = draftKey('thread-2', 'msg-1');
    expect(first).to.not.equal(second);
  });

  it('should produce a different key for a root compose and a reply', () => {
    expect(draftKey('thread-1')).to.not.equal(draftKey('thread-1', 'msg-1'));
  });
});

describe('draft persistence lifecycle', function () {
  this.timeout(10_000);

  before(loadDraftKey);

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should round-trip a draft through localStorage', () => {
    const key = draftKey('thread-1', 'msg-1');
    localStorage.setItem(key, 'half-written reply');
    expect(localStorage.getItem(key)).to.equal('half-written reply');
  });

  it('should not leak a draft between sibling replies', () => {
    localStorage.setItem(draftKey('thread-1', 'msg-1'), 'reply to msg-1');
    expect(localStorage.getItem(draftKey('thread-1', 'msg-2'))).to.be.null;
  });

  it('should not leak a draft between threads', () => {
    localStorage.setItem(draftKey('thread-1', 'msg-1'), 'reply in thread-1');
    expect(localStorage.getItem(draftKey('thread-2', 'msg-1'))).to.be.null;
  });

  it('should not leak a root draft into a reply draft', () => {
    localStorage.setItem(draftKey('thread-1'), 'root draft');
    expect(localStorage.getItem(draftKey('thread-1', 'msg-1'))).to.be.null;
  });

  it('should leave other drafts intact when one is cleared', () => {
    const rootKey = draftKey('thread-1');
    const replyKey = draftKey('thread-1', 'msg-1');
    const siblingKey = draftKey('thread-1', 'msg-2');
    localStorage.setItem(rootKey, 'root draft');
    localStorage.setItem(replyKey, 'reply draft');
    localStorage.setItem(siblingKey, 'sibling draft');

    localStorage.removeItem(replyKey);

    expect(localStorage.getItem(replyKey)).to.be.null;
    expect(localStorage.getItem(rootKey)).to.equal('root draft');
    expect(localStorage.getItem(siblingKey)).to.equal('sibling draft');
  });
});
