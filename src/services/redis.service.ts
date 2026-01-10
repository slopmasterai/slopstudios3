/**
 * Redis Client Module
 * Initializes IORedis client with reconnection strategy and health checks
 */

import { Redis, type RedisOptions } from 'ioredis';

import { serverConfig } from '../config/server.config.js';
import { logger } from '../utils/logger.js';

type RedisClient = Redis;

let redisClient: RedisClient | null = null;
let isConnected = false;

function buildRedisOptions(): RedisOptions {
  const options: RedisOptions = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number): number | null => {
      if (times > 10) {
        logger.error({ times }, 'Redis: Max retry attempts reached, giving up');
        return null;
      }
      // Exponential backoff: 100ms, 200ms, 400ms, ... up to 30s
      const delay = Math.min(times * 100 * Math.pow(2, times - 1), 30000);
      logger.warn({ times, delay }, 'Redis: Retrying connection');
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: true,
  };

  if (serverConfig.redis.password) {
    options.password = serverConfig.redis.password;
  }

  if (serverConfig.redis.tls) {
    options.tls = {};
  }

  return options;
}

function setupEventHandlers(client: RedisClient): void {
  client.on('connect', () => {
    logger.info('Redis: Connecting to server');
  });

  client.on('ready', () => {
    isConnected = true;
    logger.info('Redis: Connection established and ready');
  });

  client.on('error', (error: Error) => {
    logger.error({ error: error.message }, 'Redis: Connection error');
  });

  client.on('close', () => {
    isConnected = false;
    logger.warn('Redis: Connection closed');
  });

  client.on('reconnecting', (time: number) => {
    logger.info({ delay: time }, 'Redis: Reconnecting');
  });

  client.on('end', () => {
    isConnected = false;
    logger.info('Redis: Connection ended');
  });
}

export function createRedisClient(): RedisClient {
  if (redisClient) {
    return redisClient;
  }

  const options = buildRedisOptions();
  redisClient = new Redis(serverConfig.redis.url, options);
  setupEventHandlers(redisClient);

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = createRedisClient();

  try {
    await client.connect();
    logger.info('Redis: Successfully connected');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Redis: Failed to connect');
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    logger.info('Redis: Disconnected gracefully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Redis: Error during disconnect');
    // Force disconnect
    if (redisClient) {
      redisClient.disconnect();
    }
    redisClient = null;
    isConnected = false;
  }
}

export async function healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  if (!redisClient || !isConnected) {
    return { healthy: false, error: 'Not connected' };
  }

  try {
    const start = Date.now();
    await redisClient.ping();
    const latency = Date.now() - start;

    return { healthy: true, latency };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { healthy: false, error: errorMessage };
  }
}

export function getRedisClient(): RedisClient {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return redisClient;
}

export function isRedisConnected(): boolean {
  return isConnected;
}

export { redisClient };
