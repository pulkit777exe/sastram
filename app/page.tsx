import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';
import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

const LandingPage = dynamic(() => import('@/components/landing/LandingPage').then(m => ({ default: m.LandingPage })), {
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-transparent" />
    </div>
  ),
});

export const metadata: Metadata = {
  title: 'Sastram - AI-Powered Discussion & Research Platform',
  description: 'A modern forum with integrated AI research capabilities. Discuss topics, get AI-powered answers, and resolve questions together.',
  openGraph: {
    title: 'Sastram - AI-Powered Discussion Platform',
    description: 'A modern forum with integrated AI research capabilities.',
    type: 'website',
  },
};

export default async function Home() {
  const session = await getSession();
  
  if (session) {
    redirect('/dashboard');
    return null;
  }

  return <LandingPage user={null} />;
}
