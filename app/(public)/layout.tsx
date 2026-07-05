import { PublicFooter } from '@/components/layout/public-footer';
import { SessionAwareNavbar } from '@/components/layout/session-aware-navbar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SessionAwareNavbar />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
