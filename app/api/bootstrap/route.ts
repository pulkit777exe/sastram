import { NextResponse } from 'next/server';
import { requireSessionOrThrow } from '@/modules/auth/session';
import { ok, fail } from '@/lib/utils/api-response';
import { getUserBootstrapProfile } from '@/modules/users/repository';
import { getUnreadCount } from '@/modules/notifications/repository';
import { getUserActivity } from '@/modules/activity/repository';

export async function GET() {
  const session = await requireSessionOrThrow();

  const userId = session.user.id;

  try {
    const [user, unreadNotificationCount, activity] =
      await Promise.all([
        getUserBootstrapProfile(userId),
        getUnreadCount(userId),
        getUserActivity(userId, 5, 0),
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
      },
      unreadNotificationCount,
      recentActivity: activity.activities.slice(0, 5),
    }));
  } catch (error) {
    return NextResponse.json(fail('INTERNAL_ERROR', 'Failed to load bootstrap data'), { status: 500 });
  }
}
