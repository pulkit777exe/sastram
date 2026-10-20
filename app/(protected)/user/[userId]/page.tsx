import { notFound } from 'next/navigation';
import { ProfileHeader } from '@/components/user/profile-header';
import { getSession } from '@/modules/auth';
import { getProfileForViewer } from '@/modules/users';

export default async function PublicProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await getSession();
  if (!session) return null;

  const view = await getProfileForViewer(userId, session.user.id);
  if (!view) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ProfileHeader
        user={view.profile}
        isOwnProfile={view.isOwnProfile}
        isFollowing={view.isFollowing}
        limitedView={!view.canViewFull}
      />
    </div>
  );
}
