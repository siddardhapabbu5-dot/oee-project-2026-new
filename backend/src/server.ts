import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';

const app = createApp();

async function main() {
  await prisma.$connect();
  const server = app.listen(env.PORT, () => {
    logger.info(`PMS API listening on http://localhost:${env.PORT}`);
    logger.info(`Swagger docs at http://localhost:${env.PORT}/api/docs`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${env.PORT} is already in use. Stop the other API instance, or run: npm run free-port --prefix backend`,
      );
    } else {
      logger.error('API server error', err);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
