import { notFound } from "next/navigation";
import { prisma } from "@/lib/infrastructure/prisma";
import { ProfileHeader } from "@/components/user/profile-header";
import { requireSession } from "@/modules/auth/session";

export default async function PublicProfilePage({
  params,
}: {
  params: { userId: string };
}) {
  const { userId } = await params;
  const session = await requireSession();

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
      linkedin: true,
      image: true,
      avatarUrl: true,
      bannerUrl: true,
      reputationPoints: true,
      followerCount: true,
      followingCount: true,
      createdAt: true,
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ProfileHeader
        user={user}
        isOwnProfile={session.user.id === user.id}
        isFollowing={!!isFollowing}
      />
    </div>
  );
}
