import { Server as HTTPServer } from "http";
import { parse } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "@/lib/logger";

type ThreadChannel = Set<WebSocket>;

let wss: WebSocketServer | null = null;
const threadChannels = new Map<string, ThreadChannel>();

function getThreadId(pathname?: string | null) {
  if (!pathname) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const [wsRoot, threadSegment, threadId] = parts;
  if (wsRoot !== "ws" || threadSegment !== "thread" || !threadId) {
    return null;
  }
  return threadId;
}

function registerSocket(threadId: string, socket: WebSocket) {
  const channel = threadChannels.get(threadId) ?? new Set();
  channel.add(socket);
  threadChannels.set(threadId, channel);

  socket.on("close", () => {
    channel.delete(socket);
    if (channel.size === 0) {
      threadChannels.delete(threadId);
    }
  });

  socket.on("error", (error) => {
    logger.error("WebSocket error:", error);
  });
}

export function initWebSocketServer(server: HTTPServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "");
    const threadId = getThreadId(pathname);

    if (!threadId) {
      socket.destroy();
      return;
    }

    wss?.handleUpgrade(request, socket, head, (ws) => {
      (ws as WebSocket & { threadId?: string }).threadId = threadId;
      registerSocket(threadId, ws);
      wss?.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const threadId = (ws as WebSocket & { threadId?: string }).threadId;
    if (!threadId) {
      ws.close();
      return;
    }
    logger.debug(`Client connected to thread ${threadId}`);

    ws.on("message", (data) => {
      publishThreadEvent(threadId, data.toString());
    });
  });

  return wss;
}

export function publishThreadEvent(threadId: string, payload: unknown) {
  const channel = threadChannels.get(threadId);
  if (!channel) return;

  const message = typeof payload === "string" ? payload : JSON.stringify(payload);
  channel.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

