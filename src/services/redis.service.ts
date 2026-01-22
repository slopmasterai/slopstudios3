/**
 * Redis Client Module with Connection Pooling
 * Provides pooled Redis connections with metrics and health checks
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

import { createPool, type Pool } from 'generic-pool';
import { Redis, type RedisOptions } from 'ioredis';

import { serverConfig } from '../config/server.config.js';
import { logger } from '../utils/logger.js';

type RedisClient = Redis;

// Pool configuration interface
export interface RedisPoolConfig {
  minSize: number;
  maxSize: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  healthCheckIntervalMs: number;
}

// Pool metrics interface
export interface RedisPoolMetrics {
  size: number;
  available: number;
  borrowed: number;
  pending: number;
  min: number;
  max: number;
  acquisitions: number;
  releases: number;
  acquireErrors: number;
  healthChecksPassed: number;
  healthChecksFailed: number;
  averageAcquireTimeMs: number;
  lastHealthCheck: Date | null;
}

// Internal metrics tracking
interface InternalMetrics {
  acquisitions: number;
  releases: number;
  acquireErrors: number;
  healthChecksPassed: number;
  healthChecksFailed: number;
  totalAcquireTimeMs: number;
  lastHealthCheck: Date | null;
}

let redisPool: Pool<RedisClient> | null = null;
let primaryClient: RedisClient | null = null;
let isConnected = false;
let healthCheckInterval: NodeJS.Timeout | null = null;

const metrics: InternalMetrics = {
  acquisitions: 0,
  releases: 0,
  acquireErrors: 0,
  healthChecksPassed: 0,
  healthChecksFailed: 0,
  totalAcquireTimeMs: 0,
  lastHealthCheck: null,
};

function getPoolConfig(): RedisPoolConfig {
  return {
    minSize: serverConfig.redis.pool?.minSize ?? 2,
    maxSize: serverConfig.redis.pool?.maxSize ?? 10,
    acquireTimeoutMs: serverConfig.redis.pool?.acquireTimeoutMs ?? 5000,
    idleTimeoutMs: serverConfig.redis.pool?.idleTimeoutMs ?? 30000,
    healthCheckIntervalMs: serverConfig.redis.pool?.healthCheckIntervalMs ?? 30000,
  };
}

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

function setupEventHandlers(client: RedisClient, clientId: string): void {
  client.on('connect', () => {
    logger.debug({ clientId }, 'Redis pool: Client connecting');
  });

  client.on('ready', () => {
    logger.debug({ clientId }, 'Redis pool: Client ready');
  });

  client.on('error', (error: Error) => {
    logger.error({ error: error.message, clientId }, 'Redis pool: Client error');
  });

  client.on('close', () => {
    logger.debug({ clientId }, 'Redis pool: Client closed');
  });

  client.on('reconnecting', (time: number) => {
    logger.debug({ delay: time, clientId }, 'Redis pool: Client reconnecting');
  });
}

async function createPooledClient(): Promise<RedisClient> {
  const options = buildRedisOptions();
  const clientId = `pool-${String(Date.now())}-${Math.random().toString(36).substring(7)}`;
  const client = new Redis(serverConfig.redis.url, options);
  setupEventHandlers(client, clientId);
  await client.connect();
  return client;
}

async function destroyPooledClient(client: RedisClient): Promise<void> {
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

async function validatePooledClient(client: RedisClient): Promise<boolean> {
  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

function createRedisPool(): Pool<RedisClient> {
  if (redisPool) {
    return redisPool;
  }

  const poolConfig = getPoolConfig();

  redisPool = createPool<RedisClient>(
    {
      create: createPooledClient,
      destroy: destroyPooledClient,
      validate: validatePooledClient,
    },
    {
      min: poolConfig.minSize,
      max: poolConfig.maxSize,
      acquireTimeoutMillis: poolConfig.acquireTimeoutMs,
      idleTimeoutMillis: poolConfig.idleTimeoutMs,
      testOnBorrow: true,
      evictionRunIntervalMillis: poolConfig.idleTimeoutMs / 2,
    }
  );

  redisPool.on('factoryCreateError', (error) => {
    logger.error({ error }, 'Redis pool: Failed to create client');
  });

  redisPool.on('factoryDestroyError', (error) => {
    logger.error({ error }, 'Redis pool: Failed to destroy client');
  });

  logger.info(
    { min: poolConfig.minSize, max: poolConfig.maxSize },
    'Redis pool: Connection pool created'
  );

  return redisPool;
}

/**
 * Acquire a Redis client from the pool
 * Remember to release it when done using releaseClient()
 */
export async function acquireClient(): Promise<RedisClient> {
  const pool = createRedisPool();
  const startTime = Date.now();

  try {
    const client = await pool.acquire();
    const acquireTime = Date.now() - startTime;
    metrics.acquisitions++;
    metrics.totalAcquireTimeMs += acquireTime;

    logger.debug({ acquireTimeMs: acquireTime }, 'Redis pool: Client acquired');
    return client;
  } catch (error) {
    metrics.acquireErrors++;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Redis pool: Failed to acquire client');
    throw error;
  }
}

/**
 * Release a Redis client back to the pool
 */
export function releaseClient(client: RedisClient): void {
  if (!redisPool) {
    logger.warn('Redis pool: Attempted to release client but pool does not exist');
    return;
  }

  try {
    void redisPool.release(client);
    metrics.releases++;
    logger.debug('Redis pool: Client released');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Redis pool: Failed to release client');
  }
}

/**
 * Execute a Redis operation with automatic acquire/release
 */
export async function withClient<T>(
  operation: (client: RedisClient) => Promise<T>
): Promise<T> {
  const client = await acquireClient();
  try {
    return await operation(client);
  } finally {
    releaseClient(client);
  }
}

/**
 * Get a dedicated Redis client (not from pool)
 * Use for pub/sub or long-lived connections
 */
export function createRedisClient(): RedisClient {
  if (primaryClient) {
    return primaryClient;
  }

  const options = buildRedisOptions();
  primaryClient = new Redis(serverConfig.redis.url, options);

  primaryClient.on('connect', () => {
    logger.info('Redis: Primary client connecting');
  });

  primaryClient.on('ready', () => {
    isConnected = true;
    logger.info('Redis: Primary client ready');
  });

  primaryClient.on('error', (error: Error) => {
    logger.error({ error: error.message }, 'Redis: Primary client error');
  });

  primaryClient.on('close', () => {
    isConnected = false;
    logger.warn('Redis: Primary client closed');
  });

  primaryClient.on('reconnecting', (time: number) => {
    logger.info({ delay: time }, 'Redis: Primary client reconnecting');
  });

  primaryClient.on('end', () => {
    isConnected = false;
    logger.info('Redis: Primary client ended');
  });

  return primaryClient;
}

async function runPoolHealthCheck(): Promise<void> {
  if (!redisPool) return;

  try {
    const client = await redisPool.acquire();
    try {
      await client.ping();
      metrics.healthChecksPassed++;
      metrics.lastHealthCheck = new Date();
      logger.debug('Redis pool: Health check passed');
    } finally {
      void redisPool.release(client);
    }
  } catch (error) {
    metrics.healthChecksFailed++;
    metrics.lastHealthCheck = new Date();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Redis pool: Health check failed');
  }
}

function startHealthChecks(): void {
  const poolConfig = getPoolConfig();
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  healthCheckInterval = setInterval(() => {
    void runPoolHealthCheck();
  }, poolConfig.healthCheckIntervalMs);
  logger.info(
    { intervalMs: poolConfig.healthCheckIntervalMs },
    'Redis pool: Health checks started'
  );
}

function stopHealthChecks(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logger.info('Redis pool: Health checks stopped');
  }
}

export async function connectRedis(): Promise<void> {
  // Initialize the pool
  createRedisPool();

  // Create and connect primary client
  const client = createRedisClient();

  try {
    await client.connect();
    logger.info('Redis: Successfully connected');

    // Start periodic health checks
    startHealthChecks();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Redis: Failed to connect');
    throw error;
  }
}

export async function disconnectRedis(): Promise<void> {
  stopHealthChecks();

  // Drain and clear the pool
  if (redisPool) {
    try {
      await redisPool.drain();
      await redisPool.clear();
      redisPool = null;
      logger.info('Redis pool: Drained and cleared');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Redis pool: Error during drain');
    }
  }

  // Disconnect primary client
  if (primaryClient) {
    try {
      await primaryClient.quit();
      primaryClient = null;
      isConnected = false;
      logger.info('Redis: Primary client disconnected');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Redis: Error disconnecting primary client');
      if (primaryClient) {
        primaryClient.disconnect();
      }
      primaryClient = null;
      isConnected = false;
    }
  }
}

export async function healthCheck(): Promise<{
  healthy: boolean;
  latency?: number;
  error?: string;
  pool?: {
    size: number;
    available: number;
    borrowed: number;
  };
}> {
  if (!primaryClient || !isConnected) {
    return { healthy: false, error: 'Not connected' };
  }

  try {
    const start = Date.now();
    await primaryClient.ping();
    const latency = Date.now() - start;

    const poolStatus = redisPool
      ? {
          size: redisPool.size,
          available: redisPool.available,
          borrowed: redisPool.borrowed,
        }
      : undefined;

    return { healthy: true, latency, pool: poolStatus };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { healthy: false, error: errorMessage };
  }
}

/**
 * Get detailed pool metrics for monitoring
 */
export function getPoolMetrics(): RedisPoolMetrics {
  const poolConfig = getPoolConfig();

  if (!redisPool) {
    return {
      size: 0,
      available: 0,
      borrowed: 0,
      pending: 0,
      min: poolConfig.minSize,
      max: poolConfig.maxSize,
      acquisitions: metrics.acquisitions,
      releases: metrics.releases,
      acquireErrors: metrics.acquireErrors,
      healthChecksPassed: metrics.healthChecksPassed,
      healthChecksFailed: metrics.healthChecksFailed,
      averageAcquireTimeMs:
        metrics.acquisitions > 0
          ? metrics.totalAcquireTimeMs / metrics.acquisitions
          : 0,
      lastHealthCheck: metrics.lastHealthCheck,
    };
  }

  return {
    size: redisPool.size,
    available: redisPool.available,
    borrowed: redisPool.borrowed,
    pending: redisPool.pending,
    min: poolConfig.minSize,
    max: poolConfig.maxSize,
    acquisitions: metrics.acquisitions,
    releases: metrics.releases,
    acquireErrors: metrics.acquireErrors,
    healthChecksPassed: metrics.healthChecksPassed,
    healthChecksFailed: metrics.healthChecksFailed,
    averageAcquireTimeMs:
      metrics.acquisitions > 0
        ? metrics.totalAcquireTimeMs / metrics.acquisitions
        : 0,
    lastHealthCheck: metrics.lastHealthCheck,
  };
}

/**
 * Reset pool metrics (useful for testing or metric rotation)
 */
export function resetPoolMetrics(): void {
  metrics.acquisitions = 0;
  metrics.releases = 0;
  metrics.acquireErrors = 0;
  metrics.healthChecksPassed = 0;
  metrics.healthChecksFailed = 0;
  metrics.totalAcquireTimeMs = 0;
  metrics.lastHealthCheck = null;
  logger.info('Redis pool: Metrics reset');
}

export function getRedisClient(): RedisClient {
  if (!primaryClient) {
    throw new Error('Redis client not initialized. Call createRedisClient() first.');
  }
  return primaryClient;
}

export function isRedisConnected(): boolean {
  return isConnected;
}

// Legacy export for backward compatibility
export { primaryClient as redisClient };
