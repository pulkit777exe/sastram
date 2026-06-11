import { NextRequest, NextResponse } from 'next/server';
import { getUserBootstrapProfile } from '@/modules/users';
import { getUnreadCount } from '@/modules/notifications';
import { getUserActivity } from '@/modules/activity';
import { getUserReputation } from '@/modules/reputation';
import { getJoinedCommunities } from '@/modules/communities';
import { ok, fail } from '@/lib/utils/api-response';
import { requireSessionOrThrow } from '@/modules/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSessionOrThrow();
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
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json(fail('AUTH_REQUIRED', 'Unauthorized'), { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
      return NextResponse.json(fail('FORBIDDEN', 'Forbidden'), { status: 403 });
    }
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to load bootstrap'), { status: 500 });
  }
}
