import { Server as HTTPServer, IncomingMessage } from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '@/lib/infrastructure/logger';
import { auth } from '@/lib/services/auth';
import type { TypingIndicator } from '@/lib/types/index';
import { validateWebSocketMessage } from '@/lib/schemas/websocket';
import { rateLimit } from '@/lib/services/rate-limit';
import { getRedisSub, getThreadChannel } from '@/lib/infrastructure/redis-pubsub';

type ThreadChannel = Set<WebSocket>;

interface AuthenticatedWebSocket extends WebSocket {
  threadId?: string;
  userId?: string;
  userName?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;
const threadChannels = new Map<string, ThreadChannel>();
const connectionsByUserId = new Map<string, Set<AuthenticatedWebSocket>>();
const typingIndicators = new Map<string, Map<string, TypingIndicator>>(); // Map<threadId, Map<userId, TypingIndicator>>

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

async function authenticateConnection(
  request: IncomingMessage
): Promise<{ userId: string; userName: string } | null> {
  try {
    const headers = new Headers();
    Object.entries(request.headers).forEach(([key, value]) => {
      if (value) {
        headers.set(key, Array.isArray(value) ? value[0] : value);
      }
    });

    const session = await auth.api.getSession({
      headers,
    });

    if (session?.user) {
      return {
        userId: session.user.id,
        userName: session.user.name || session.user.email,
      };
    }
    return null;
  } catch (error) {
    logger.error('Authentication error:', error);
    return null;
  }
}

function registerSocket(threadId: string, socket: AuthenticatedWebSocket) {
  const channel = threadChannels.get(threadId) ?? new Set();
  channel.add(socket);
  threadChannels.set(threadId, channel);

  if (socket.userId) {
    const userConns = connectionsByUserId.get(socket.userId) ?? new Set();
    userConns.add(socket);
    connectionsByUserId.set(socket.userId, userConns);
  }

  socket.on('close', () => {
    channel.delete(socket);
    if (channel.size === 0) {
      threadChannels.delete(threadId);
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

    if (socket.userId) {
      const threadTyping = typingIndicators.get(threadId);
      if (threadTyping) {
        threadTyping.delete(socket.userId);
        if (threadTyping.size === 0) {
          typingIndicators.delete(threadId);
        }
      }
    }
  });

  socket.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });

  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });
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

  server.on('upgrade', async (request, socket, head) => {
    const { pathname } = parse(request.url || '');

    // Check if it's a notifications route
    const isNotifications = isNotificationsRoute(pathname);
    const threadId = getThreadId(pathname);

    if (!isNotifications && !threadId) {
      socket.destroy();
      return;
    }

    const authResult = await authenticateConnection(request);

    wss?.handleUpgrade(request, socket, head, (ws) => {
      const authWs = ws as AuthenticatedWebSocket;

      if (threadId) {
        authWs.threadId = threadId;
      }

      if (authResult) {
        authWs.userId = authResult.userId;
        authWs.userName = authResult.userName;
      }

      // Register socket
      if (threadId) {
        registerSocket(threadId, authWs);
      } else if (authResult) {
        // For notifications route, just register user connection
        const userConns = connectionsByUserId.get(authResult.userId) ?? new Set();
        userConns.add(authWs);
        connectionsByUserId.set(authResult.userId, userConns);
      }

      wss?.emit('connection', authWs, request);
    });
  });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    const threadId = ws.threadId;
    const isNotifications = !threadId;

    if (isNotifications) {
      logger.debug('Client connected to notifications channel');

      // Handle notifications route
      ws.on('close', () => {
        if (ws.userId) {
          const userConns = connectionsByUserId.get(ws.userId);
          if (userConns) {
            userConns.delete(ws);
            if (userConns.size === 0) {
              connectionsByUserId.delete(ws.userId);
            }
          }
        }
      });

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
          //@ts-expect-error underlying socket has remoteAddress
          (ws._socket?.remoteAddress as string | undefined) ??
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

  // ── REDIS PUB/SUB SUBSCRIBER ──────────────────────────────────────────────
  // Listens for thread events published by other server instances and forwards
  // them to local WebSocket clients. This enables horizontal scaling.
  let redisSubscriber: ReturnType<typeof getRedisSub> | null = null;

  try {
    redisSubscriber = getRedisSub();

    redisSubscriber.psubscribe('thread:*', (err) => {
      if (err) {
        logger.error('[ws] Redis psubscribe failed', { error: err.message });
        return;
      }
      logger.info('[ws] Redis subscribed to thread:* for cross-instance events');
    });

    redisSubscriber.on('pmessage', (_pattern, channel, message) => {
      const sectionId = channel.replace('thread:', '');
      const localSockets = threadChannels.get(sectionId);
      if (!localSockets || localSockets.size === 0) return;

      localSockets.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
  } catch (err) {
    logger.warn('[ws] Redis subscriber not available — cross-instance events disabled', {
      error: String(err),
    });
  }

  return wss;
}

export function publishUserEvent(userId: string, payload: unknown) {
  const userConns = connectionsByUserId.get(userId);
  if (!userConns) return;

  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  userConns.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function publishThreadEvent(threadId: string, payload: unknown) {
  const channel = threadChannels.get(threadId);
  if (!channel) return;

  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);

  // Broadcast to local clients
  channel.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  // Publish to Redis so other instances receive it
  import('@/lib/infrastructure/redis-pubsub')
    .then((mod) => mod.publishThreadEvent(threadId, {
      type: 'NEW_MESSAGE',
      sectionId: threadId,
      payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
    } as never))
    .catch(() => {
      // Redis pub/sub unavailable — single-instance mode
    });
}
