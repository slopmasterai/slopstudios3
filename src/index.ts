/**
 * Slop Studios 3 - Application Entry Point
 * Initializes and starts the HTTP and WebSocket servers
 */

import { serverConfig } from './config/server.config.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerClaudeRoutes } from './routes/claude.routes.js';
import { registerHealthRoutes } from './routes/health.routes.js';
import {
  createHttpServer,
  startHttpServer,
  stopHttpServer,
  getHttpServer,
} from './server/http.server.js';
import { createWebSocketServer, closeWebSocketServer } from './server/websocket.server.js';
import {
  initializeMetricsService,
  shutdownMetricsService,
} from './services/claude-metrics.service.js';
import { initializeClaudeService, stopQueueWorker } from './services/claude.service.js';
import {
  terminateAllProcesses,
  waitForProcesses,
  cleanupZombieProcesses,
} from './services/process-manager.service.js';
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
    // Stop Claude queue worker
    logger.info('Stopping Claude queue worker...');
    stopQueueWorker();

    // Terminate all running Claude processes
    logger.info('Terminating Claude processes...');
    const terminated = await terminateAllProcesses();
    logger.info({ terminated }, 'Claude processes terminated');

    // Wait for in-flight processes to complete (with timeout)
    logger.info('Waiting for in-flight processes...');
    await waitForProcesses(10000);

    // Shutdown metrics service
    logger.info('Shutting down metrics service...');
    await shutdownMetricsService();

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

    // 5. Initialize Claude service
    logger.info('Initializing Claude service...');
    initializeClaudeService({
      cliPath: serverConfig.claude.cliPath,
      apiKey: serverConfig.claude.apiKey,
      maxConcurrentProcesses: serverConfig.claude.maxConcurrentProcesses,
      defaultTimeoutMs: serverConfig.claude.processTimeoutMs,
      enableQueue: serverConfig.claude.enableQueue,
      maxQueueSize: serverConfig.claude.maxQueueSize,
      useApiFallback: serverConfig.claude.useApiFallback,
      maxRetries: serverConfig.claude.maxRetries,
      retryDelayMs: serverConfig.claude.retryDelayMs,
    });

    // 6. Initialize metrics service
    logger.info('Initializing metrics service...');
    initializeMetricsService();

    // 7. Register Claude routes
    logger.info('Registering Claude routes...');
    registerClaudeRoutes(app);

    // 8. Cleanup zombie processes (from previous runs)
    logger.info('Cleaning up zombie processes...');
    const zombiesCleanedUp = await cleanupZombieProcesses();
    if (zombiesCleanedUp > 0) {
      logger.info({ count: zombiesCleanedUp }, 'Cleaned up zombie processes');
    }

    // 9. Start HTTP server
    logger.info('Starting HTTP server...');
    await startHttpServer();

    // 10. Create WebSocket server
    logger.info('Creating WebSocket server...');
    const httpServer = getHttpServer().server;
    const io = createWebSocketServer(httpServer);

    // 11. Register WebSocket handlers
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
