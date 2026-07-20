import type { ReactNode } from 'react';
import { BootstrapProvider } from '@/components/bootstrap-provider';

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <BootstrapProvider>{children}</BootstrapProvider>;
}
