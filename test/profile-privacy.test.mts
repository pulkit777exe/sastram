import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { getProfileForViewer } from '@/modules/users/repository';

function profileRow(id: string, privacy: 'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE') {
  return {
    id,
    name: 'Alice',
    bio: 'Private bio',
    location: 'Somewhere',
    website: 'https://example.com',
    twitter: 'alice',
    github: 'alice',
    image: 'https://example.com/alice.png',
    bannerUrl: 'https://example.com/banner.png',
    followerCount: 12,
    followingCount: 7,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    profilePrivacy: privacy,
    email: 'secret@example.com',
  };
}

describe('getProfileForViewer privacy boundary', () => {
  let restorePrisma: (() => void) | null = null;

  afterEach(() => {
    restorePrisma?.();
    restorePrisma = null;
  });

  it('strips email and private fields when the profile is not visible', async () => {
    const userId = 'private-user-1';
    restorePrisma = installFakePrisma({
      'user.findUnique': async () => profileRow(userId, 'PRIVATE'),
      'userFollow.findUnique': async () => null,
    });

    const view = await getProfileForViewer(userId, 'viewer-1');

    expect(view).to.not.be.null;
    expect(view!.canViewFull).to.equal(false);
    expect(view!.profile.bio).to.equal(null);
    expect(view!.profile.followerCount).to.equal(0);
    expect(view!.profile).to.not.have.property('email');
  });

  it('returns the full profile when a followers-only profile is followed', async () => {
    const userId = 'followers-user-1';
    restorePrisma = installFakePrisma({
      'user.findUnique': async () => profileRow(userId, 'FOLLOWERS_ONLY'),
      'userFollow.findUnique': async () => ({ id: 'follow-1' }),
    });

    const view = await getProfileForViewer(userId, 'viewer-2');

    expect(view).to.not.be.null;
    expect(view!.canViewFull).to.equal(true);
    expect(view!.isFollowing).to.equal(true);
    expect(view!.profile.bio).to.equal('Private bio');
    expect(view!.profile).to.not.have.property('email');
  });

  it('returns the full profile for its owner even when private', async () => {
    const userId = 'self-user-1';
    restorePrisma = installFakePrisma({
      'user.findUnique': async () => profileRow(userId, 'PRIVATE'),
      'userFollow.findUnique': async () => null,
    });

    const view = await getProfileForViewer(userId, userId);

    expect(view).to.not.be.null;
    expect(view!.isOwnProfile).to.equal(true);
    expect(view!.canViewFull).to.equal(true);
    expect(view!.profile.bio).to.equal('Private bio');
    expect(view!.profile).to.not.have.property('email');
  });
});
