import Redis from 'ioredis';
import { createRedisConnection } from '@/lib/infrastructure/redis-connection';

export interface RedisThreadPayload {
  id: string;
  content: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  createdAt: string;
  sectionId: string;
  parentId: string | null;
  depth: number;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  isComplete: boolean;
  reactions: unknown[];
  attachments: unknown[];
}

export interface RedisThreadEvent {
  type:
    | 'NEW_MESSAGE'
    | 'MESSAGE_DELETED'
    | 'PIN_UPDATE'
    | 'AI_RESPONSE_READY'
    | 'REACTION_UPDATE'
    | 'USER_TYPING'
    | 'USER_STOPPED_TYPING'
    | 'MENTION_NOTIFICATION'
    | 'NOTIFICATION_COUNT_UPDATE';
  sectionId: string;
  payload: Record<string, unknown>;
  sourceInstance?: string;
}

export function getThreadChannel(sectionId: string): string {
  return `thread:${sectionId}`;
}

export function getUserChannel(userId: string): string {
  return `user:${userId}`;
}

let _pub: Redis | null = null;
let _sub: Redis | null = null;

export function getRedisPub(): Redis {
  if (!_pub) {
    _pub = createRedisConnection({ label: 'pubsub-pub', lazyConnect: true });
  }
  return _pub;
}

export function getRedisSub(): Redis {
  if (!_sub) {
    _sub = createRedisConnection({ label: 'pubsub-sub', lazyConnect: true });
  }
  return _sub;
}

export async function publishThreadEvent(
  sectionId: string,
  event: RedisThreadEvent
): Promise<void> {
  const pub = getRedisPub();
  await pub.publish(getThreadChannel(sectionId), JSON.stringify(event));
}

export async function publishUserEvent(
  userId: string,
  event: RedisThreadEvent
): Promise<void> {
  const pub = getRedisPub();
  await pub.publish(getUserChannel(userId), JSON.stringify(event));
}
