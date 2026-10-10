import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  getCollectionsCache,
  setCollectionsCache,
  invalidateCollectionsCache,
} from '@/components/collections/collections-cache';

describe('collections-cache tab-level TTL', () => {
  let clock: sinon.SinonFakeTimers | null = null;

  afterEach(() => {
    invalidateCollectionsCache();
    if (clock) {
      clock.restore();
      clock = null;
    }
  });

  it('returns null when nothing was cached', () => {
    expect(getCollectionsCache()).to.be.null;
  });

  it('returns cached collections within the TTL', () => {
    const data = [{ id: 'c1', title: 'Research' }];
    setCollectionsCache(data);
    expect(getCollectionsCache()).to.deep.equal(data);
  });

  it('returns null after the 30s TTL expires', () => {
    clock = sinon.useFakeTimers({ now: Date.now() });
    setCollectionsCache([{ id: 'c1', title: 'Research' }]);
    clock.tick(31_000);
    expect(getCollectionsCache()).to.be.null;
  });

  it('returns null after invalidateCollectionsCache even within the TTL', () => {
    setCollectionsCache([{ id: 'c1', title: 'Research' }]);
    invalidateCollectionsCache();
    expect(getCollectionsCache()).to.be.null;
  });

  it('latest set wins', () => {
    setCollectionsCache([{ id: 'c1', title: 'Old' }]);
    const next = [{ id: 'c2', title: 'New' }];
    setCollectionsCache(next);
    expect(getCollectionsCache()).to.deep.equal(next);
  });
});
