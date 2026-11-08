import type { ReactNode } from 'react';

import { BootstrapProvider } from '@/components/bootstrap-provider';
import { requireSession } from '@/modules/auth';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  // Defense in depth (Next.js 16): every route under (protected) requires an
  // authenticated session close to render, not just proxy/layout checks elsewhere.
  await requireSession();
  return <BootstrapProvider>{children}</BootstrapProvider>;
}
