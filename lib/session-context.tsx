'use client';

import { createContext, useContext } from 'react';
import type { SessionPayload } from '@/modules/auth/session';

const SessionContext = createContext<SessionPayload | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: SessionPayload | null;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
