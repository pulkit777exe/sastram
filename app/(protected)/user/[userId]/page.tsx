import { notFound } from 'next/navigation';
import { prisma } from '@/lib/infrastructure/prisma';
import { ProfileHeader } from '@/components/user/profile-header';
import { getSession } from '@/modules/auth';

export default async function PublicProfilePage({ params }: { params: { userId: string } }) {
  const { userId } = await params;
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      bio: true,
      location: true,
      website: true,
      twitter: true,
      github: true,
      image: true,
      avatarUrl: true,
      bannerUrl: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
      profilePrivacy: true,
    },
  });

  if (!user) {
    notFound();
  }

  // Check if current user is following this profile
  const isFollowing = await prisma.userFollow.findUnique({
    where: {
      followerId_followingId: {
        followerId: session.user.id,
        followingId: user.id,
      },
    },
  });

  const isOwnProfile = session.user.id === user.id;

  function canViewFullProfile(
    own: boolean,
    privacy: string,
    following: unknown
  ): boolean {
    if (own) return true;
    if (privacy === 'PUBLIC') return true;
    if (privacy === 'FOLLOWERS_ONLY' && following) return true;
    return false;
  }

  const canViewFull = canViewFullProfile(isOwnProfile, user.profilePrivacy, isFollowing);

  function buildLimitedProfile(base: NonNullable<typeof user>) {
    return {
      ...base,
      bio: null,
      location: null,
      website: null,
      twitter: null,
      github: null,
      bannerUrl: null,
      followerCount: 0,
      followingCount: 0,
    };
  }

  let profileUser: NonNullable<typeof user>;
  if (canViewFull) {
    profileUser = user as NonNullable<typeof user>;
  } else {
    profileUser = buildLimitedProfile(user as NonNullable<typeof user>);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ProfileHeader
        user={profileUser}
        isOwnProfile={isOwnProfile}
        isFollowing={!!isFollowing}
        limitedView={!canViewFull}
      />
    </div>
  );
}
