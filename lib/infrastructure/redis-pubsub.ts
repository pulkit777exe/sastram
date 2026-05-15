import Redis from 'ioredis';
import { logger } from '@/lib/infrastructure/logger';

export interface RedisThreadPayload {
  id: string;
  content: string;
  senderId: string;
  senderName: string | null;
  senderAvatar: string | null;
  createdAt: string; // ISO string — safe to serialize
  sectionId: string;
  parentId: string | null;
  depth: number;
  likeCount: number;
  replyCount: number;
  isAiResponse: boolean;
  isComplete: boolean; // true on final chunk — clears "pending" status
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
    | 'MENTION_NOTIFICATION';
  sectionId: string;
  payload: Record<string, unknown>;
}

export function getThreadChannel(sectionId: string): string {
  return `thread:${sectionId}`;
}

// pub/sub clients need dedicated connections; cannot be reused for regular commands.

function createRedisClient(label: string): Redis {
  const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    throw new Error(`[Redis ${label}] REDIS_URL is not set`);
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on('error', (err) => {
    logger.error(`[Redis ${label}] Connection error`, { error: err.message });
  });

  return client;
}

// Lazy-initialized — created when first used.

let _pub: Redis | null = null;
let _sub: Redis | null = null;

export function getRedisPub(): Redis {
  if (!_pub) _pub = createRedisClient('pub');
  return _pub;
}

export function getRedisSub(): Redis {
  if (!_sub) _sub = createRedisClient('sub');
  return _sub;
}

export async function publishThreadEvent(
  sectionId: string,
  event: RedisThreadEvent
): Promise<void> {
  const pub = getRedisPub();
  await pub.publish(getThreadChannel(sectionId), JSON.stringify(event));
}
