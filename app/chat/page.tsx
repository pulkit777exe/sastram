import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat - Sastram',
  description: 'Direct messages and conversations.',
};

export default async function ChatPage() {
  redirect('/dashboard/threads');
}
