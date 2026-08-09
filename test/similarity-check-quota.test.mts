import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';

// Mirrors the guard in components/create-thread-dialog.tsx: a per-session cap
// plus a last-payload dedup, so a single compose session cannot drain the
// 30/day AI analysis quota while the user iterates on a draft.
const MAX_CHECKS_PER_SESSION = 3;

function createSession() {
  let checksUsed = 0;
  let lastChecked: string | null = null;

  return {
    /** Returns true when a check would actually be spent. */
    request(title: string, description: string): boolean {
      if (checksUsed >= MAX_CHECKS_PER_SESSION) return false;
      const payload = `${title.trim()}\u0000${description.trim()}`;
      if (lastChecked === payload) return false;
      lastChecked = payload;
      checksUsed += 1;
      return true;
    },
    reset(): void {
      checksUsed = 0;
      lastChecked = null;
    },
    get checksUsed(): number {
      return checksUsed;
    },
    get lastChecked(): string | null {
      return lastChecked;
    },
  };
}

describe('similarity check quota guard', () => {
  let session: ReturnType<typeof createSession>;

  beforeEach(() => {
    session = createSession();
  });

  it('should consume only one check for an identical payload', () => {
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.true;
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.false;
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.false;
    expect(session.checksUsed).to.equal(1);
  });

  it('should consume another check when the title changes', () => {
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.true;
    expect(session.request('How do I deploy Next.js to Vercel?', 'some detail')).to.be.true;
    expect(session.checksUsed).to.equal(2);
  });

  it('should consume another check when only the description changes', () => {
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.true;
    expect(session.request('How do I deploy Next.js?', 'more detail')).to.be.true;
    expect(session.checksUsed).to.equal(2);
  });

  it('should not consume a check for whitespace-only title differences', () => {
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.true;
    expect(session.request('  How do I deploy Next.js?  ', 'some detail')).to.be.false;
    expect(session.request('How do I deploy Next.js?\n', 'some detail')).to.be.false;
    expect(session.checksUsed).to.equal(1);
  });

  it('should not consume a check for whitespace-only description differences', () => {
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.true;
    expect(session.request('How do I deploy Next.js?', '  some detail  ')).to.be.false;
    expect(session.checksUsed).to.equal(1);
  });

  it('should reject a fourth distinct payload once the cap is reached', () => {
    expect(session.request('How do I deploy Next.js? v1', '')).to.be.true;
    expect(session.request('How do I deploy Next.js? v2', '')).to.be.true;
    expect(session.request('How do I deploy Next.js? v3', '')).to.be.true;
    expect(session.request('How do I deploy Next.js? v4', '')).to.be.false;
    expect(session.checksUsed).to.equal(MAX_CHECKS_PER_SESSION);
  });

  it('should stay capped for every payload after the cap is reached', () => {
    session.request('How do I deploy Next.js? v1', '');
    session.request('How do I deploy Next.js? v2', '');
    session.request('How do I deploy Next.js? v3', '');
    for (let i = 4; i < 20; i++) {
      expect(session.request(`How do I deploy Next.js? v${i}`, '')).to.be.false;
    }
    expect(session.checksUsed).to.equal(MAX_CHECKS_PER_SESSION);
  });

  it('should allow checks again after the session is reset', () => {
    session.request('How do I deploy Next.js? v1', '');
    session.request('How do I deploy Next.js? v2', '');
    session.request('How do I deploy Next.js? v3', '');
    expect(session.request('How do I deploy Next.js? v4', '')).to.be.false;

    session.reset();

    expect(session.checksUsed).to.equal(0);
    expect(session.lastChecked).to.be.null;
    expect(session.request('How do I deploy Next.js? v4', '')).to.be.true;
    expect(session.checksUsed).to.equal(1);
  });

  it('should re-check a previously deduped payload after a reset', () => {
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.true;
    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.false;

    session.reset();

    expect(session.request('How do I deploy Next.js?', 'some detail')).to.be.true;
  });
});
