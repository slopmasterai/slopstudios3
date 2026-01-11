/**
 * Claude Metrics Service
 * Tracks and aggregates performance metrics for Claude CLI operations
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { logger } from '../utils/logger.js';

import { onProcessEvent, type ProcessEventData } from './process-manager.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';

import type { ClaudeProcessMetrics, ClaudeServiceMetrics } from '../types/claude.types.js';

// Redis key prefixes
const METRICS_PREFIX = 'claude:metrics:';
const METRICS_LIST_KEY = `${METRICS_PREFIX}list`;
const METRICS_SUMMARY_KEY = `${METRICS_PREFIX}summary`;
const METRICS_TTL_SECONDS = 86400; // 24 hours
const MAX_METRICS_ENTRIES = 10000;

// In-memory metrics buffer for batch writes
let metricsBuffer: ClaudeProcessMetrics[] = [];
let flushInterval: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
const BUFFER_SIZE = 100; // Flush when buffer reaches this size

// Metrics counters (in-memory for fast access)
let counters = {
  totalProcesses: 0,
  successfulProcesses: 0,
  failedProcesses: 0,
  timedOutProcesses: 0,
  cancelledProcesses: 0,
  totalDurationMs: 0,
  minDurationMs: Infinity,
  maxDurationMs: 0,
};

// Duration percentile tracking (using reservoir sampling)
const durationSamples: number[] = [];
const MAX_SAMPLES = 1000;

/**
 * Initializes the metrics service
 */
export function initializeMetricsService(): void {
  // Subscribe to process events
  onProcessEvent(handleProcessEvent);

  // Start flush interval
  flushInterval = setInterval(flushMetricsBuffer, FLUSH_INTERVAL_MS);

  // Load existing counters from Redis
  loadCountersFromRedis().catch((error) => {
    logger.warn({ error: error.message }, 'Failed to load metrics counters from Redis');
  });

  logger.info('Claude metrics service initialized');
}

/**
 * Shuts down the metrics service
 */
export async function shutdownMetricsService(): Promise<void> {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }

  // Flush remaining metrics
  await flushMetricsBuffer();

  // Save counters
  await saveCountersToRedis();

  logger.info('Claude metrics service shut down');
}

/**
 * Handles process events for metrics that won't be recorded via recordProcessMetrics.
 * Only records timeout events here since normal exit/error events are captured
 * by recordProcessMetrics to avoid double-counting.
 */
function handleProcessEvent(event: ProcessEventData): void {
  // Only handle timeout events here - normal exits and errors are recorded
  // via recordProcessMetrics which provides complete metrics including duration
  if (event.type === 'timeout') {
    counters.timedOutProcesses++;
  }
}

/**
 * Records metrics for a completed process
 */
export function recordProcessMetrics(metrics: ClaudeProcessMetrics): void {
  // Update in-memory counters
  counters.totalProcesses++;

  if (metrics.success) {
    counters.successfulProcesses++;
  } else {
    counters.failedProcesses++;
  }

  counters.totalDurationMs += metrics.durationMs;
  counters.minDurationMs = Math.min(counters.minDurationMs, metrics.durationMs);
  counters.maxDurationMs = Math.max(counters.maxDurationMs, metrics.durationMs);

  // Add to duration samples for percentile calculation
  addDurationSample(metrics.durationMs);

  // Add to buffer
  metricsBuffer.push(metrics);

  // Flush if buffer is full
  if (metricsBuffer.length >= BUFFER_SIZE) {
    flushMetricsBuffer().catch((error) => {
      logger.error({ error: error.message }, 'Failed to flush metrics buffer');
    });
  }
}

/**
 * Adds a duration sample for percentile tracking
 */
function addDurationSample(duration: number): void {
  if (durationSamples.length < MAX_SAMPLES) {
    durationSamples.push(duration);
  } else {
    // Reservoir sampling for maintaining representative sample
    const randomIndex = Math.floor(Math.random() * counters.totalProcesses);
    if (randomIndex < MAX_SAMPLES) {
      durationSamples[randomIndex] = duration;
    }
  }
}

/**
 * Calculates percentile from samples
 */
function calculatePercentile(percentile: number): number {
  if (durationSamples.length === 0) {
    return 0;
  }

  const sorted = [...durationSamples].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

/**
 * Flushes metrics buffer to Redis
 */
async function flushMetricsBuffer(): Promise<void> {
  if (metricsBuffer.length === 0) {
    return;
  }

  const toFlush = [...metricsBuffer];
  metricsBuffer = [];

  if (!isRedisConnected()) {
    logger.warn('Cannot flush metrics: Redis not connected');
    return;
  }

  try {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();

    // Add each metric to the list
    for (const metric of toFlush) {
      pipeline.lpush(METRICS_LIST_KEY, JSON.stringify(metric));
    }

    // Trim to max entries
    pipeline.ltrim(METRICS_LIST_KEY, 0, MAX_METRICS_ENTRIES - 1);

    // Set TTL on the list
    pipeline.expire(METRICS_LIST_KEY, METRICS_TTL_SECONDS);

    await pipeline.exec();

    logger.debug({ count: toFlush.length }, 'Metrics flushed to Redis');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to flush metrics to Redis');

    // Put metrics back in buffer
    metricsBuffer = [...toFlush, ...metricsBuffer];
  }
}

/**
 * Loads counters from Redis
 */
async function loadCountersFromRedis(): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const data = await redis.get(METRICS_SUMMARY_KEY);

    if (data) {
      const saved = JSON.parse(data);
      counters = { ...counters, ...saved };

      if (counters.minDurationMs === Infinity) {
        counters.minDurationMs = 0;
      }
    }
  } catch (error) {
    // Ignore errors, start fresh
  }
}

/**
 * Saves counters to Redis
 */
async function saveCountersToRedis(): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.setex(METRICS_SUMMARY_KEY, METRICS_TTL_SECONDS, JSON.stringify(counters));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to save metrics counters');
  }
}

/**
 * Gets aggregated service metrics
 */
export async function getServiceMetrics(
  periodSeconds: number = 3600
): Promise<ClaudeServiceMetrics> {
  // Calculate averages and rates
  const avgDurationMs =
    counters.totalProcesses > 0 ? counters.totalDurationMs / counters.totalProcesses : 0;

  const successRate =
    counters.totalProcesses > 0 ? counters.successfulProcesses / counters.totalProcesses : 1;

  // Get active process count
  let activeProcesses = 0;
  let queuedProcesses = 0;

  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      activeProcesses = await redis.scard('process:active');
      queuedProcesses = await redis.zcard('process:queue');
    } catch {
      // Ignore errors
    }
  }

  return {
    totalProcesses: counters.totalProcesses,
    successfulProcesses: counters.successfulProcesses,
    failedProcesses: counters.failedProcesses,
    timedOutProcesses: counters.timedOutProcesses,
    cancelledProcesses: counters.cancelledProcesses,
    activeProcesses,
    queuedProcesses,
    avgDurationMs: Math.round(avgDurationMs),
    minDurationMs: counters.minDurationMs === Infinity ? 0 : counters.minDurationMs,
    maxDurationMs: counters.maxDurationMs,
    p95DurationMs: calculatePercentile(95),
    p99DurationMs: calculatePercentile(99),
    successRate: Math.round(successRate * 100) / 100,
    timestamp: new Date().toISOString(),
    periodSeconds,
  };
}

/**
 * Gets recent individual metrics
 */
export async function getRecentMetrics(limit: number = 100): Promise<ClaudeProcessMetrics[]> {
  if (!isRedisConnected()) {
    return metricsBuffer.slice(-limit);
  }

  try {
    const redis = getRedisClient();
    const data = await redis.lrange(METRICS_LIST_KEY, 0, limit - 1);

    return data.map((item) => JSON.parse(item) as ClaudeProcessMetrics);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to get recent metrics');
    return metricsBuffer.slice(-limit);
  }
}

/**
 * Gets metrics for a specific user
 */
export async function getUserMetrics(
  userId: string,
  limit: number = 100
): Promise<ClaudeProcessMetrics[]> {
  const allMetrics = await getRecentMetrics(limit * 10); // Fetch more to filter

  return allMetrics.filter((m) => m.userId === userId).slice(0, limit);
}

/**
 * Resets all metrics (for testing or maintenance)
 */
export async function resetMetrics(): Promise<void> {
  counters = {
    totalProcesses: 0,
    successfulProcesses: 0,
    failedProcesses: 0,
    timedOutProcesses: 0,
    cancelledProcesses: 0,
    totalDurationMs: 0,
    minDurationMs: Infinity,
    maxDurationMs: 0,
  };

  durationSamples.length = 0;
  metricsBuffer = [];

  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      await redis.del(METRICS_LIST_KEY);
      await redis.del(METRICS_SUMMARY_KEY);
    } catch {
      // Ignore errors
    }
  }

  logger.info('Metrics reset');
}

/**
 * Increments timeout counter
 */
export function recordTimeout(): void {
  counters.timedOutProcesses++;
}

/**
 * Increments cancelled counter
 */
export function recordCancellation(): void {
  counters.cancelledProcesses++;
}

/**
 * Gets current counters (for debugging)
 */
export function getCounters(): typeof counters {
  return { ...counters };
}

export default {
  initializeMetricsService,
  shutdownMetricsService,
  recordProcessMetrics,
  getServiceMetrics,
  getRecentMetrics,
  getUserMetrics,
  resetMetrics,
  recordTimeout,
  recordCancellation,
  getCounters,
};
