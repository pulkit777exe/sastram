import Redis from 'ioredis';
import { logger } from '@/lib/infrastructure/logger';

// ── TYPES ──────────────────────────────────────────────────────────────────

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
  type: 'NEW_MESSAGE' | 'MESSAGE_DELETED' | 'PIN_UPDATE' | 'AI_RESPONSE_READY';
  sectionId: string;
  payload: Record<string, unknown>;
}

// ── CHANNEL HELPERS ────────────────────────────────────────────────────────

export function getThreadChannel(sectionId: string): string {
  return `thread:${sectionId}`;
}

// ── CONNECTION FACTORY ────────────────────────────────────────────────────
// pub/sub clients CANNOT be reused for regular Redis commands.
// Each needs its own dedicated connection.

function createRedisClient(label: string): Redis {
  const url = process.env.REDIS_URL;
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

// ── SINGLETON CLIENTS ─────────────────────────────────────────────────────
// Lazy-initialized — only created when first used.
// Publisher used by worker process.
// Subscriber used by Next.js WebSocket server.

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

// ── PUBLISH ────────────────────────────────────────────────────────────────

export async function publishThreadEvent(
  sectionId: string,
  event: RedisThreadEvent
): Promise<void> {
  const pub = getRedisPub();
  await pub.publish(getThreadChannel(sectionId), JSON.stringify(event));
}
