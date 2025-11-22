import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse } from "url";
import { logger } from "./logger";

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: HTTPServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url || "");

    if (pathname === "/api/ws") {
      wss?.handleUpgrade(request, socket, head, (ws) => {
        wss?.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    logger.debug("Client connected to WebSocket");

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Broadcast to all connected clients
        wss?.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      } catch (error) {
        logger.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      logger.debug("Client disconnected from WebSocket");
    });

    ws.on("error", (error) => {
      logger.error("WebSocket error:", error);
    });
  });

  return wss;
}

export function getWebSocketServer() {
  return wss;
}
