import { Server as HTTPServer, IncomingMessage } from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '@/lib/infrastructure/logger';
import { auth } from '@/lib/services/auth';
import type { TypingIndicator } from '@/lib/types/index';
import { validateWebSocketMessage } from '@/lib/schemas/websocket';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRedisSub, getThreadChannel, getUserChannel, publishThreadEvent as redisPublish, publishUserEvent as redisUserPublish } from '@/lib/infrastructure/redis-pubsub';
import { createRedisConnection } from '@/lib/infrastructure/redis-connection';
import { prisma } from '@/lib/infrastructure/prisma';
import crypto from 'crypto';

export interface AuthenticatedWebSocket extends WebSocket {
  threadId?: string;
  userId?: string;
  userName?: string;
  isAlive?: boolean;
}

const MAX_CONNECTIONS_PER_USER = 10;

export const INSTANCE_ID = crypto.randomUUID();

export function shouldSkipLoopback(message: string, instanceId: string): boolean {
  try {
    const parsed = JSON.parse(message) as { sourceInstance?: string };
    return parsed.sourceInstance === instanceId;
  } catch {
    return false;
  }
}

type ThreadChannel = Set<AuthenticatedWebSocket>;

let wss: WebSocketServer | null = null;
const threadChannels = new Map<string, ThreadChannel>();
const connectionsByUserId = new Map<string, Set<AuthenticatedWebSocket>>();

// Redis-backed typing indicators
let typingRedis: ReturnType<typeof createRedisConnection> | null = null;
const TYPING_KEY_PREFIX = 'typing:';
const TYPING_TTL_SECONDS = 5;

function getThreadId(pathname?: string | null) {
  if (!pathname) return null;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const [wsRoot, threadSegment, threadId] = parts;
  if (wsRoot !== 'ws' || threadSegment !== 'thread' || !threadId) {
    return null;
  }
  return threadId;
}

function isNotificationsRoute(pathname?: string | null) {
  if (!pathname) return false;
  const parts = pathname.split('/').filter(Boolean);
  return parts.includes('notifications');
}

let redisSubscriber: ReturnType<typeof getRedisSub> | null = null;
const threadSubCounts = new Map<string, number>();
const userSubCounts = new Map<string, number>();

function subscribeToThread(threadId: string) {
  const count = threadSubCounts.get(threadId) ?? 0;
  threadSubCounts.set(threadId, count + 1);
  if (count === 0 && redisSubscriber) {
    redisSubscriber.subscribe(getThreadChannel(threadId));
  }
}

function unsubscribeFromThread(threadId: string) {
  const count = threadSubCounts.get(threadId);
  if (!count || count <= 1) {
    threadSubCounts.delete(threadId);
    if (redisSubscriber) {
      redisSubscriber.unsubscribe(getThreadChannel(threadId));
    }
  } else {
    threadSubCounts.set(threadId, count - 1);
  }
}

function subscribeToUser(userId: string) {
  const count = userSubCounts.get(userId) ?? 0;
  userSubCounts.set(userId, count + 1);
  if (count === 0 && redisSubscriber) {
    redisSubscriber.subscribe(getUserChannel(userId));
  }
}

function unsubscribeFromUser(userId: string) {
  const count = userSubCounts.get(userId);
  if (!count || count <= 1) {
    userSubCounts.delete(userId);
    if (redisSubscriber) {
      redisSubscriber.unsubscribe(getUserChannel(userId));
    }
  } else {
    userSubCounts.set(userId, count - 1);
  }
}

// Redis-backed typing indicator functions
function getTypingKey(threadId: string): string {
  return `${TYPING_KEY_PREFIX}${threadId}`;
}

async function setTypingIndicator(threadId: string, userId: string, userName: string): Promise<void> {
  if (!typingRedis) return;
  try {
    const key = getTypingKey(threadId);
    const data = JSON.stringify({ userId, userName, threadId, timestamp: Date.now() });
    await typingRedis.hset(key, userId, data);
    await typingRedis.expire(key, TYPING_TTL_SECONDS);
  } catch (err) {
    logger.error('[ws] Failed to set typing indicator in Redis', { error: (err as Error).message });
  }
}

async function removeTypingIndicator(threadId: string, userId: string): Promise<void> {
  if (!typingRedis) return;
  try {
    const key = getTypingKey(threadId);
    await typingRedis.hdel(key, userId);
  } catch (err) {
    logger.error('[ws] Failed to remove typing indicator from Redis', { error: (err as Error).message });
  }
}

async function getTypingIndicators(threadId: string): Promise<TypingIndicator[]> {
  if (!typingRedis) return [];
  try {
    const key = getTypingKey(threadId);
    const data = await typingRedis.hgetall(key);
    return Object.values(data).map((v) => JSON.parse(v) as TypingIndicator);
  } catch (err) {
    logger.error('[ws] Failed to get typing indicators from Redis', { error: (err as Error).message });
    return [];
  }
}

export function unregisterSocketFromMaps(
  socket: { userId?: string; threadId?: string },
  threadChannels: Map<string, Set<unknown>>,
  connectionsByUserId: Map<string, Set<unknown>>,
) {
  if (socket.threadId) {
    const channel = threadChannels.get(socket.threadId);
    if (channel) {
      channel.delete(socket);
      if (channel.size === 0) {
        threadChannels.delete(socket.threadId);
      }
    }

    // Remove typing indicator from Redis on disconnect
    if (socket.userId) {
      removeTypingIndicator(socket.threadId, socket.userId);
    }
  }

  if (socket.userId) {
    const userConns = connectionsByUserId.get(socket.userId);
    if (userConns) {
      userConns.delete(socket);
      if (userConns.size === 0) {
        connectionsByUserId.delete(socket.userId);
      }
    }
  }
}

function unregisterSocket(socket: AuthenticatedWebSocket) {
  unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId);

  if (socket.threadId) {
    const channel = threadChannels.get(socket.threadId);
    if (!channel || channel.size === 0) {
      unsubscribeFromThread(socket.threadId);
    }
  }

  if (socket.userId) {
    const userConns = connectionsByUserId.get(socket.userId);
    if (!userConns || userConns.size === 0) {
      unsubscribeFromUser(socket.userId);
    }
  }
}

function registerSocket(threadId: string, socket: AuthenticatedWebSocket) {
  const wasEmpty = !threadChannels.has(threadId);
  const channel = threadChannels.get(threadId) ?? new Set();
  channel.add(socket);
  threadChannels.set(threadId, channel);

  if (wasEmpty) {
    subscribeToThread(threadId);
  }

  if (socket.userId) {
    const wasUserEmpty = !connectionsByUserId.has(socket.userId);
    const userConns = connectionsByUserId.get(socket.userId) ?? new Set();
    userConns.add(socket);
    connectionsByUserId.set(socket.userId, userConns);
    if (wasUserEmpty) {
      subscribeToUser(socket.userId);
    }
  }

  socket.on('close', () => unregisterSocket(socket));
}

export function initWebSocketServer(server: HTTPServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  // Initialize Redis connection for typing indicators
  try {
    typingRedis = createRedisConnection({
      label: 'ws-typing',
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      enableOfflineQueue: false,
    });
  } catch (err) {
    logger.error('[ws] Failed to create Redis connection for typing indicators', { error: (err as Error).message });
  }

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '');

    // Check if it's a notifications route
    const isNotifications = isNotificationsRoute(pathname);
    const threadId = getThreadId(pathname);

    if (!isNotifications && !threadId) {
      socket.destroy();
      return;
    }

    // Authenticate synchronously using cookie from request headers before accepting connection.
    // This prevents unauthenticated sockets from receiving any messages.
    const sessionCookie = request.headers.cookie
      ?.split(';')
      .find((c) => c.trim().startsWith('better-auth.session_token='))
      ?.split('=')[1];

    if (!sessionCookie) {
      socket.destroy();
      return;
    }

    const headers = new Headers();
    headers.set('cookie', `better-auth.session_token=${sessionCookie}`);

    auth.api
      .getSession({ headers })
      .then(async (session) => {
        if (!session?.user) {
          socket.destroy();
          return;
        }

        // For thread connections, verify membership for PRIVATE/RESTRICTED threads
        if (threadId) {
          const thread = await prisma.thread.findUnique({
            where: { id: threadId },
            select: { visibility: true },
          });

          if (thread?.visibility === 'PRIVATE' || thread?.visibility === 'RESTRICTED') {
            const membership = await prisma.threadMember.findUnique({
              where: { threadId_userId: { threadId, userId: session.user.id } },
              select: { status: true },
            });

            if (!membership || membership.status !== 'ACTIVE') {
              logger.warn(`[ws] User ${session.user.id} denied access to ${thread?.visibility} thread ${threadId}`);
              socket.destroy();
              return;
            }
          }
        }

        // Auth passed — enforce per-user connection limit
        const existingConns = connectionsByUserId.get(session.user.id);
        if (existingConns && existingConns.size >= MAX_CONNECTIONS_PER_USER) {
          logger.warn(`[ws] User ${session.user.id} exceeded connection limit (${MAX_CONNECTIONS_PER_USER})`);
          socket.destroy();
          return;
        }

        // Auth passed — now accept the connection
        wss?.handleUpgrade(request, socket, head, (ws) => {
          const authWs = ws as AuthenticatedWebSocket;
          authWs.userId = session.user.id;
          authWs.userName = session.user.name || session.user.email;

          if (threadId) {
            authWs.threadId = threadId;
            registerSocket(threadId, authWs);
          } else {
            // Notifications-only connection: register user without a thread channel.
            // Cleanup handled by wss.on('connection') close handler.
            const wasUserEmpty = !connectionsByUserId.has(authWs.userId);
            const userConns = connectionsByUserId.get(authWs.userId) ?? new Set();
            userConns.add(authWs);
            connectionsByUserId.set(authWs.userId, userConns);
            if (wasUserEmpty) {
              subscribeToUser(authWs.userId);
            }
          }

          wss?.emit('connection', authWs, request);
        });
      })
      .catch((error) => {
        logger.warn('[ws] Auth failed:', error);
        socket.destroy();
      });
  });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', (error) => logger.error('WebSocket error:', error));

    const threadId = ws.threadId;
    const isNotifications = !threadId;

    if (isNotifications) {
      logger.debug('Client connected to notifications channel');
      ws.on('close', () => unregisterSocket(ws));
      return;
    }

    if (!threadId) {
      ws.close();
      return;
    }

    logger.debug(
      `Client connected to thread ${threadId}${
        ws.userId ? ` (user: ${ws.userName})` : ' (anonymous)'
      }`
    );

    ws.on('message', async (data) => {
      try {
        const rawMessage = JSON.parse(data.toString());

        const validation = validateWebSocketMessage(rawMessage);
        if (!validation.success) {
          logger.warn('Invalid WebSocket message:', validation.error.issues);
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: {
                error: 'Invalid message format',
                details: validation.error.issues[0]?.message,
              },
            })
          );
          return;
        }

        const message = validation.data;

        // Basic websocket rate limiting per user / IP
        const identifier =
          ws.userId ??
          ((ws as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress) ??
          'anonymous';
        const limitKey = `ws:${threadId}:${identifier}`;
        const result = await rateLimit({ key: limitKey, type: 'websocket' });
        if (!result.success) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { error: 'Rate limit exceeded' },
            })
          );
          return;
        }

        if (
          !ws.userId &&
          (message.type === 'USER_TYPING' || message.type === 'USER_STOPPED_TYPING')
        ) {
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              payload: { error: 'Authentication required to send messages' },
            })
          );
          return;
        }

        if (message.type === 'USER_TYPING' && ws.userId && ws.userName) {
          // Store typing indicator in Redis with TTL
          setTypingIndicator(threadId, ws.userId, ws.userName);

          publishThreadEvent(threadId, {
            type: 'USER_TYPING',
            payload: {
              userId: ws.userId,
              userName: ws.userName,
              threadId: threadId,
            },
          });
        } else if (message.type === 'USER_STOPPED_TYPING' && ws.userId) {
          // Remove typing indicator from Redis
          removeTypingIndicator(threadId, ws.userId);

          publishThreadEvent(threadId, {
            type: 'USER_STOPPED_TYPING',
            payload: { userId: ws.userId, threadId: threadId },
          });
        } else {
          publishThreadEvent(threadId, message);
        }
      } catch (error) {
        logger.error('Error processing WebSocket message:', error);
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            payload: { error: 'Failed to process message' },
          })
        );
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      const authWs = ws as AuthenticatedWebSocket;
      if (authWs.isAlive === false) {
        return authWs.terminate();
      }
      authWs.isAlive = false;
      authWs.ping();
    });
  }, 30000); // 30 sec

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    if (typingRedis) {
      typingRedis.disconnect();
      typingRedis = null;
    }
  });

  try {
    redisSubscriber = getRedisSub();

    redisSubscriber.on('message', (channel, message) => {
      try {
        const parsed = JSON.parse(message) as { sourceInstance?: string };
        if (parsed.sourceInstance === INSTANCE_ID) return;
      } catch {
        return;
      }

      if (channel.startsWith('thread:')) {
        const threadId = channel.replace('thread:', '');
        const localSockets = threadChannels.get(threadId);
        if (!localSockets || localSockets.size === 0) return;

        localSockets.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      } else if (channel.startsWith('user:')) {
        const userId = channel.replace('user:', '');
        const userConns = connectionsByUserId.get(userId);
        if (!userConns || userConns.size === 0) return;

        userConns.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      }
    });

    logger.info('[ws] Redis subscriber initialized — channels subscribed on-demand');
  } catch (err) {
    logger.warn('[ws] Redis subscriber not available — cross-instance events disabled', {
      error: String(err),
    });
  }

  return wss;
}

export function getWsStats() {
  return {
    totalConnections: wss?.clients.size ?? 0,
    connectedUsers: connectionsByUserId.size,
    activeThreadRooms: threadChannels.size,
    activeTypingUsers: 0, // Typing indicators are now Redis-backed with TTL, exact count not trivially available
  };
}

export async function publishUserEvent(userId: string, payload: unknown) {
  const userConns = connectionsByUserId.get(userId);
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (userConns) {
    userConns.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  try {
    await redisUserPublish(userId, {
      type: 'NOTIFICATION_COUNT_UPDATE',
      threadId: userId,
      payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
      sourceInstance: INSTANCE_ID,
    });
  } catch (err) {
    logger.error('[publishUserEvent] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
      userId,
    });
  }
}

export async function publishThreadEvent(threadId: string, payload: unknown) {
  const channel = threadChannels.get(threadId);
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (channel) {
    channel.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  try {
    const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    await redisPublish(threadId, {
      type: 'NEW_MESSAGE',
      threadId: threadId,
      payload: parsedPayload,
      sourceInstance: INSTANCE_ID,
    });
  } catch (err) {
    logger.error('[publishThreadEvent] Redis publish failed', {
      error: err instanceof Error ? err.message : String(err),
      threadId,
    });
  }
}
