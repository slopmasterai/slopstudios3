/**
 * Slop Studios 3 - Application Entry Point
 * Initializes and starts the HTTP and WebSocket servers
 */

import { serverConfig } from './config/server.config.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerHealthRoutes } from './routes/health.routes.js';
import { createHttpServer, startHttpServer, stopHttpServer, getHttpServer } from './server/http.server.js';
import { createWebSocketServer, closeWebSocketServer } from './server/websocket.server.js';
import { createRedisClient, connectRedis, disconnectRedis } from './services/redis.service.js';
import { logger } from './utils/logger.js';
import { registerAllHandlers } from './websocket/handlers/index.js';

export const VERSION = '0.0.1';

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  try {
    // Close WebSocket connections
    logger.info('Closing WebSocket server...');
    await closeWebSocketServer();

    // Stop HTTP server
    logger.info('Stopping HTTP server...');
    await stopHttpServer();

    // Disconnect Redis
    logger.info('Disconnecting Redis...');
    await disconnectRedis();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Error during shutdown');
    process.exit(1);
  }
}

/**
 * Main application initialization
 */
async function main(): Promise<void> {
  logger.info({ version: VERSION, env: serverConfig.env }, 'Starting Slop Studios 3');

  try {
    // 1. Initialize Redis client
    logger.info('Connecting to Redis...');
    createRedisClient();
    await connectRedis();
    logger.info('Redis connected successfully');

    // 2. Create HTTP server
    logger.info('Creating HTTP server...');
    const app = await createHttpServer();

    // 3. Register health routes
    logger.info('Registering health routes...');
    await registerHealthRoutes(app);

    // 4. Register auth routes
    logger.info('Registering auth routes...');
    await registerAuthRoutes(app);

    // 5. Start HTTP server
    logger.info('Starting HTTP server...');
    await startHttpServer();

    // 6. Create WebSocket server
    logger.info('Creating WebSocket server...');
    const httpServer = getHttpServer().server;
    const io = createWebSocketServer(httpServer);

    // 7. Register WebSocket handlers
    logger.info('Registering WebSocket handlers...');
    io.on('connection', (socket) => {
      registerAllHandlers(socket);
    });

    // Also register handlers for namespaces
    io.of('/media').on('connection', (socket) => {
      registerAllHandlers(socket);
    });

    io.of('/notifications').on('connection', (socket) => {
      registerAllHandlers(socket);
    });

    logger.info(
      {
        host: serverConfig.host,
        port: serverConfig.port,
        env: serverConfig.env,
      },
      'Server started successfully'
    );

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.fatal({ err: error }, 'Uncaught exception');
      void shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled promise rejection');
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.fatal({ error: errorMessage }, 'Failed to start server');
    process.exit(1);
  }
}

// Run the application
main().catch((error: unknown) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
