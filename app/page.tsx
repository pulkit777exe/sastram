import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';
import { LandingPage } from '@/components/landing/LandingPage';

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }

  const user = session?.user || null;
  return <LandingPage user={user} />;
}
