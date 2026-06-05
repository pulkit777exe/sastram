import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/services/auth';
import { getUserBootstrapProfile } from '@/modules/users';
import { getUnreadCount } from '@/modules/notifications';
import { getUserActivity } from '@/modules/activity';
import { getUserReputation } from '@/modules/reputation';
import { getJoinedCommunities } from '@/modules/communities';
import { ok, fail } from '@/lib/utils/api-response';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
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
    return NextResponse.json(fail('NOT_FOUND', 'User not found'), { status: 404 });
  }

  return NextResponse.json(ok({
    user: {
      id: user.id,
      name: user.name,
      image: user.image ?? null,
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
  }));
}
