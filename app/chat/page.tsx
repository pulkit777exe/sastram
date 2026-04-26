import { redirect } from 'next/navigation';
export default async function ChatPage() {
  redirect('/dashboard/threads');
}
