'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/services/auth-client';
import { PublicNavbar } from '@/components/layout/public-navbar';

interface SessionUser {
  name: string | null;
  email: string;
  image: string | null;
}

export function SessionAwareNavbar() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSessionUserAction().then((data) => {
      if (data) {
        setUser(data);
      }
    });
  }, []);

  return <PublicNavbar user={user} />;
}
