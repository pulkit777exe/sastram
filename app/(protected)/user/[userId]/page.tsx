import { notFound } from "next/navigation";
import { prisma } from "@/lib/infrastructure/prisma";
import { ProfileHeader } from "@/components/user/profile-header";
import { getSession } from "@/modules/auth/session";

export default async function PublicProfilePage({
  params,
}: {
  params: { userId: string };
}) {
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
      reputationPoints: true,
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
  const canViewFull =
    isOwnProfile ||
    user.profilePrivacy === "PUBLIC" ||
    (user.profilePrivacy === "FOLLOWERS_ONLY" && !!isFollowing);

  const profileUser = canViewFull
    ? user
    : {
        ...user,
        bio: null,
        location: null,
        website: null,
        twitter: null,
        github: null,
        bannerUrl: null,
        reputationPoints: 0,
        followerCount: 0,
        followingCount: 0,
      };

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
