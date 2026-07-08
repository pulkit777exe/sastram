import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { logger } from './lib/infrastructure/logger';
import { getEnv } from './lib/config/env';

try {
  const env = getEnv();
  logger.info('Environment variables validated successfully');
  logger.debug(`Running in ${env.NODE_ENV} mode on port ${env.PORT}`);
} catch (error) {
  logger.error('Environment validation failed:', error);
  process.exit(1);
}

const env = getEnv();
const dev = env.NODE_ENV !== 'production';
const hostname = env.HOSTNAME;
const port = env.PORT;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('Error occurred handling', { url: req.url, error: err });
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  server.listen(port, () => {
    logger.info(`Server ready on http://${hostname}:${port}`);
  });
});
