import { Server as HTTPServer, IncomingMessage } from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '@/lib/infrastructure/logger';
import { auth } from '@/lib/services/auth';
import type { TypingIndicator } from '@/lib/types/index';
import { validateWebSocketMessage } from '@/lib/schemas/websocket';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRedisSub, getThreadChannel, getUserChannel, publishThreadEvent as redisPublish, publishUserEvent as redisUserPublish } from '@/lib/infrastructure/redis-pubsub';
import crypto from 'crypto';

export interface AuthenticatedWebSocket extends WebSocket {
  threadId?: string;
  userId?: string;
  userName?: string;
  isAlive?: boolean;
}

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
const typingIndicators = new Map<string, Map<string, TypingIndicator>>();

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

export function unregisterSocketFromMaps(
  socket: { userId?: string; threadId?: string },
  threadChannels: Map<string, Set<unknown>>,
  connectionsByUserId: Map<string, Set<unknown>>,
  typingIndicators: Map<string, Map<string, { userId: string }>>,
) {
  if (socket.threadId) {
    const channel = threadChannels.get(socket.threadId);
    if (channel) {
      channel.delete(socket);
      if (channel.size === 0) {
        threadChannels.delete(socket.threadId);
      }
    }

    const threadTyping = typingIndicators.get(socket.threadId);
    if (threadTyping && socket.userId) {
      threadTyping.delete(socket.userId);
      if (threadTyping.size === 0) {
        typingIndicators.delete(socket.threadId);
      }
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
  unregisterSocketFromMaps(socket, threadChannels, connectionsByUserId, typingIndicators);

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

function cleanupTypingIndicators() {
  const now = Date.now();
  const TYPING_TIMEOUT = 3000;

  typingIndicators.forEach((threadTyping, threadId) => {
    threadTyping.forEach((indicator, userId) => {
      if (indicator.timestamp && now - indicator.timestamp > TYPING_TIMEOUT) {
        threadTyping.delete(userId);
        publishThreadEvent(threadId, {
          type: 'USER_STOPPED_TYPING',
          payload: { userId, sectionId: threadId },
        });
      }
    });

    if (threadTyping.size === 0) {
      typingIndicators.delete(threadId);
    }
  });
}

setInterval(cleanupTypingIndicators, 1000);

export function initWebSocketServer(server: HTTPServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '');

    // Check if it's a notifications route
    const isNotifications = isNotificationsRoute(pathname);
    const threadId = getThreadId(pathname);

    if (!isNotifications && !threadId) {
      socket.destroy();
      return;
    }

    // Accept connection immediately — auth happens post-connect via WebSocket message.
    // This avoids the async upgrade handler race condition where the socket times out
    // before handleUpgrade is called under load.
    wss?.handleUpgrade(request, socket, head, (ws) => {
      const authWs = ws as AuthenticatedWebSocket;

      if (threadId) {
        authWs.threadId = threadId;
      }

      // Authenticate synchronously using cookie from request headers.
      // If auth fails, we still register the socket but it will be anonymous.
      // Anonymous sockets cannot send messages (checked in message handler).
      const sessionCookie = request.headers.cookie
        ?.split(';')
        .find((c) => c.trim().startsWith('better-auth.session_token='))
        ?.split('=')[1];

      if (sessionCookie) {
        const headers = new Headers();
        headers.set('cookie', `better-auth.session_token=${sessionCookie}`);
        auth.api
          .getSession({ headers })
          .then((session) => {
            if (session?.user) {
              authWs.userId = session.user.id;
              authWs.userName = session.user.name || session.user.email;
              if (authWs.userId) {
                const wasUserEmpty = !connectionsByUserId.has(authWs.userId);
                const userConns = connectionsByUserId.get(authWs.userId) ?? new Set();
                userConns.add(authWs);
                connectionsByUserId.set(authWs.userId, userConns);
                if (wasUserEmpty) {
                  subscribeToUser(authWs.userId);
                }
              }
            }
          })
          .catch((error) => {
            logger.warn('[ws] Post-connect auth failed:', error);
          });
      }

      if (threadId) {
        registerSocket(threadId, authWs);
      }

      wss?.emit('connection', authWs, request);
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
      if (ws.userId) {
        const wasEmpty = !connectionsByUserId.has(ws.userId);
        const userConns = connectionsByUserId.get(ws.userId) ?? new Set();
        userConns.add(ws);
        connectionsByUserId.set(ws.userId, userConns);
        if (wasEmpty) {
          subscribeToUser(ws.userId);
        }
      }
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
          const threadTyping = typingIndicators.get(threadId) ?? new Map();
          threadTyping.set(ws.userId, {
            userId: ws.userId,
            userName: ws.userName,
            sectionId: threadId,
            timestamp: Date.now(),
          });
          typingIndicators.set(threadId, threadTyping);

          publishThreadEvent(threadId, {
            type: 'USER_TYPING',
            payload: {
              userId: ws.userId,
              userName: ws.userName,
              sectionId: threadId,
            },
          });
        } else if (message.type === 'USER_STOPPED_TYPING' && ws.userId) {
          const threadTyping = typingIndicators.get(threadId);
          if (threadTyping) {
            threadTyping.delete(ws.userId);
          }

          publishThreadEvent(threadId, {
            type: 'USER_STOPPED_TYPING',
            payload: { userId: ws.userId, sectionId: threadId },
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
        const sectionId = channel.replace('thread:', '');
        const localSockets = threadChannels.get(sectionId);
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
  const typingTotal = Array.from(typingIndicators.values()).reduce(
    (sum, threadTyping) => sum + threadTyping.size,
    0
  );

  return {
    totalConnections: wss?.clients.size ?? 0,
    connectedUsers: connectionsByUserId.size,
    activeThreadRooms: threadChannels.size,
    activeTypingUsers: typingTotal,
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
      sectionId: userId,
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
      sectionId: threadId,
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
