import { redirect } from 'next/navigation';
import { getSession } from '@/modules/auth';

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }

  redirect('/login');
}
