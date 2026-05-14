import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';
import { LandingPage } from '@/components/landing/LandingPage';
import type { SessionUser } from '@/modules/auth';

export default async function Home() {
  const session = await getSession();
  
  if (session) {
    redirect('/dashboard');
    return null;
  }

  return <LandingPage user={null} />;
}
