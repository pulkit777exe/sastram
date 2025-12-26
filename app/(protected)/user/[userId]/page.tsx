import { notFound } from "next/navigation";
import { getUserProfile, getUserThreadsAction } from "@/modules/users/actions";
import { checkFollowingStatus } from "@/modules/follows/actions";
import { getSession } from "@/modules/auth/session";
import { ProfileHeader } from "@/components/user/profile-header";
import { ProfileTabs } from "@/components/user/profile-tabs";
import { UserThreadsList } from "@/components/user/user-threads-list";
import { Card } from "@/components/ui/card";
import { UserStatus } from "@prisma/client";
import { Drum, Link } from "lucide-react";

// Thread type matching what getUserThreads returns
type UserThread = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  messageCount: number;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
  community: {
    id: string;
    title: string;
    slug: string;
  } | null;
};

// Profile type matching what getPublicProfile returns
// Note: email can be string or undefined depending on viewer
type UserProfileData = {
  id: string;
  name: string | null;
  email: string | undefined;
  bio: string | null;
  location: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  image: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  profilePrivacy: string | null;
  reputationPoints: number;
  followerCount: number;
  followingCount: number;
  role: string;
  status: UserStatus;
  createdAt: Date;
  lastSeenAt: Date | null;
};

export default async function UserProfilePage({
  params,
}: {
  params: { userId: string };
}) {
  const session = await getSession();
  const [profileResult, threadsResult, followResult] = await Promise.all([
    getUserProfile(params.userId),
    getUserThreadsAction(params.userId, 20, 0),
    session ? checkFollowingStatus(params.userId) : Promise.resolve({ success: false, isFollowing: false }),
  ]);

  // Check if profile result is successful
  if (
    !profileResult ||
    typeof profileResult !== "object" ||
    !("success" in profileResult) ||
    profileResult.success !== true ||
    !("data" in profileResult) ||
    !profileResult.data
  ) {
    notFound();
  }

  const profile = profileResult.data as UserProfileData;
  
  // Check if threads result is successful
  const threads = (
    threadsResult &&
    typeof threadsResult === "object" &&
    "success" in threadsResult &&
    threadsResult.success === true &&
    "data" in threadsResult &&
    threadsResult.data &&
    typeof threadsResult.data === "object" &&
    "threads" in threadsResult.data &&
    Array.isArray(threadsResult.data.threads)
  )
    ? (threadsResult.data as { threads: UserThread[]; total: number; hasMore: boolean }).threads
    : [];
  const isOwnProfile = session?.user.id === params.userId;
  const isFollowing = "isFollowing" in followResult ? followResult.isFollowing || false : false;

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <ProfileHeader
        user={{
          id: profile.id,
          name: profile.name,
          email: profile.email ?? "",
          bio: profile.bio,
          location: profile.location,
          website: profile.website,
          twitter: profile.twitter,
          github: profile.github,
          linkedin: profile.linkedin,
          image: profile.image,
          avatarUrl: profile.avatarUrl,
          bannerUrl: profile.bannerUrl,
          reputationPoints: profile.reputationPoints,
          followerCount: profile.followerCount,
          followingCount: profile.followingCount,
          createdAt: new Date(profile.createdAt),
        }}
        isOwnProfile={isOwnProfile}
        isFollowing={isFollowing}
      />

      <ProfileTabs
        defaultTab="threads"
        threads={<UserThreadsList threads={threads.map(t => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          description: t.description,
          messageCount: t.messageCount,
          memberCount: t.memberCount,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }))} />}
        about={
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">About</h3>
            <div className="space-y-4 text-sm text-muted-foreground">
              {profile.bio ? (
                <p>{profile.bio}</p>
              ) : (
                <p className="italic">No bio available</p>
              )}
              <div className="space-y-2">
                {profile.location && (
                  <p>Location: {profile.location}</p>
                )}
                {profile.website && (
                  <p>
                    <Link /> - Website:{" "}
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {profile.website}
                    </a>
                  </p>
                )}
                <p>
                  <Drum /> - Member since:{" "}
                  {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </Card>
        }
        activity={
          <Card className="p-6">
            <p className="text-muted-foreground">Activity feed coming soon...</p>
          </Card>
        }
      />
    </div>
  );
}
