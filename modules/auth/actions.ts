'use server';

import { getSession } from '@/modules/auth/session';

export async function getSessionUserAction() {
  const session = await getSession();
  if (!session?.user) return null;

  return {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };
}
