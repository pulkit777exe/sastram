import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { initWebSocketServer } from "./lib/ws/server";
import { logger } from "./lib/logger";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  initWebSocketServer(server);

  server.listen(port, () => {
    logger.info(`Server ready on http://${hostname}:${port}`);
    logger.info(`WebSocket server ready on ws://${hostname}:${port}/api/ws`);
  });
});
