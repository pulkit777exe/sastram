import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import { installFakePrisma } from '@/test/support/fake-prisma';
import { searchUsers } from '@/modules/search/repository';

type UserWhere = {
  AND?: unknown[];
  OR?: unknown[];
  profilePrivacy?: string;
};

describe('searchUsers privacy boundary', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('limits the candidate query to self, public, and followed followers-only users', async () => {
    let capturedWhere: UserWhere | undefined;

    restore = installFakePrisma({
      'user.findMany': async (args: { where: UserWhere }) => {
        capturedWhere = args.where;
        return [];
      },
    });

    await searchUsers('alice', 20, 0, 'viewer-1');

    expect(capturedWhere?.AND).to.deep.include({
      OR: [
        { id: 'viewer-1' },
        { profilePrivacy: 'PUBLIC' },
        {
          profilePrivacy: 'FOLLOWERS_ONLY',
          following: { some: { followerId: 'viewer-1' } },
        },
      ],
    });
  });

  it('searches only public profiles when no viewer is known', async () => {
    let capturedWhere: UserWhere | undefined;

    restore = installFakePrisma({
      'user.findMany': async (args: { where: UserWhere }) => {
        capturedWhere = args.where;
        return [];
      },
    });

    await searchUsers('alice');

    expect(capturedWhere?.AND).to.deep.include({ profilePrivacy: 'PUBLIC' });
  });

  it('keeps the viewer’s own profile in scope and strips other users’ bios', async () => {
    restore = installFakePrisma({
      'user.findMany': async () => [
        {
          id: 'viewer-1',
          name: 'Alice Viewer',
          image: null,
          bio: 'My private bio',
          followerCount: 2,
          followingCount: 1,
        },
        {
          id: 'other-1',
          name: 'Alice Other',
          image: null,
          bio: 'Someone else’s bio',
          followerCount: 1,
          followingCount: 1,
        },
      ],
    });

    const result = await searchUsers('alice', 20, 0, 'viewer-1');

    expect(result.users).to.have.lengthOf(2);
    expect(result.users[0]).to.have.property('bio', 'My private bio');
    expect(result.users[1]).to.not.have.property('bio');
  });
});
