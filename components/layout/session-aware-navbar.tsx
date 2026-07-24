'use client';

import { useSession } from '@/lib/services/auth-client';
import { PublicNavbar } from '@/components/layout/public-navbar';

export function SessionAwareNavbar() {
  const { data: session } = useSession();

  const user = session?.user
    ? {
        name: session.user.name ?? null,
        email: session.user.email ?? '',
        image: session.user.image ?? null,
      }
    : null;

  return <PublicNavbar user={user} />;
}
