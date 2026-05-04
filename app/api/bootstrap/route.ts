import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/services/auth';
import { getUserBootstrapProfile } from '@/modules/users/repository';
import { getUnreadCount } from '@/modules/notifications/repository';
import { getUserActivity } from '@/modules/activity/repository';
import { getUserReputation } from '@/modules/reputation/repository';
import { getJoinedCommunities } from '@/modules/communities/repository';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, unreadNotificationCount, activity, reputation, joinedCommunities] =
    await Promise.all([
      getUserBootstrapProfile(userId),
      getUnreadCount(userId),
      getUserActivity(userId, 5, 0),
      getUserReputation(userId),
      getJoinedCommunities(userId),
    ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role,
      reputationPoints: user.reputationPoints ?? 0,
      isPro: user.isPro ?? false,
    },
    unreadNotificationCount,
    recentActivity: activity.activities.slice(0, 5),
    reputation: {
      points: reputation.points,
      level: reputation.level,
    },
    joinedCommunities,
  });
}
