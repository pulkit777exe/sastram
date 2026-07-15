import type { ThreadMember } from '@/modules/members/types';

export async function getThreadMembers(threadId: string): Promise<ThreadMember[]> {
  void threadId;
  return [];
}

export async function addThreadMember(
  threadId: string,
  userId: string,
  role: string = 'MEMBER'
): Promise<void> {
  void threadId;
  void userId;
  void role;
}

export async function updateThreadMemberRole(
  threadId: string,
  userId: string,
  role: string
): Promise<void> {
  void threadId;
  void userId;
  void role;
}

export async function removeThreadMember(threadId: string, userId: string): Promise<void> {
  void threadId;
  void userId;
}
