import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';
import dynamic from 'next/dynamic';

const LandingPage = dynamic(() => import('@/components/landing/LandingPage').then(m => ({ default: m.LandingPage })), {
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-transparent" />
    </div>
  ),
});

export default async function Home() {
  const session = await getSession();
  
  if (session) {
    redirect('/dashboard');
    return null;
  }

  return <LandingPage user={null} />;
}
