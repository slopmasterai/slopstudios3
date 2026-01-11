/**
 * Strudel Metrics Service
 * Tracks and aggregates performance metrics for Strudel operations
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { logger } from '../utils/logger.js';

import { getRedisClient, isRedisConnected } from './redis.service.js';

import type { StrudelServiceMetrics } from '../types/strudel.types.js';

// Redis key prefixes
const METRICS_PREFIX = 'strudel:metrics:';
const METRICS_LIST_KEY = `${METRICS_PREFIX}list`;
const METRICS_SUMMARY_KEY = `${METRICS_PREFIX}summary`;
const METRICS_TTL_SECONDS = 86400; // 24 hours
const MAX_METRICS_ENTRIES = 10000;

// Individual process metrics
export interface StrudelProcessMetrics {
  processId: string;
  userId: string;
  type: 'validation' | 'render';
  durationMs: number;
  audioLengthSeconds?: number;
  success: boolean;
  timestamp: string;
  errorCode?: string;
}

// In-memory metrics buffer for batch writes
let metricsBuffer: StrudelProcessMetrics[] = [];
let flushInterval: NodeJS.Timeout | null = null;
const FLUSH_INTERVAL_MS = 5000; // Flush every 5 seconds
const BUFFER_SIZE = 100; // Flush when buffer reaches this size

// Metrics counters (in-memory for fast access)
let counters = {
  // Validation metrics
  totalValidations: 0,
  successfulValidations: 0,
  failedValidations: 0,
  totalValidationTimeMs: 0,
  minValidationTimeMs: Infinity,
  maxValidationTimeMs: 0,

  // Render metrics
  totalRenders: 0,
  successfulRenders: 0,
  failedRenders: 0,
  cancelledRenders: 0,
  totalRenderTimeMs: 0,
  minRenderTimeMs: Infinity,
  maxRenderTimeMs: 0,
  totalAudioSeconds: 0,

  // Queue metrics
  peakQueueDepth: 0,
  totalQueueWaitTimeMs: 0,
  queueRejections: 0,

  // Error tracking
  validationErrors: 0,
  renderErrors: 0,
  timeoutErrors: 0,
  systemErrors: 0,
};

// Duration percentile tracking (using reservoir sampling)
const validationDurationSamples: number[] = [];
const renderDurationSamples: number[] = [];
const MAX_SAMPLES = 1000;

/**
 * Initializes the Strudel metrics service
 */
export function initializeStrudelMetricsService(): void {
  // Start flush interval
  flushInterval = setInterval(flushMetricsBuffer, FLUSH_INTERVAL_MS);

  // Load existing counters from Redis
  loadCountersFromRedis().catch((error) => {
    logger.warn({ error: error.message }, 'Failed to load Strudel metrics counters from Redis');
  });

  logger.info('Strudel metrics service initialized');
}

/**
 * Shuts down the Strudel metrics service
 */
export async function shutdownStrudelMetricsService(): Promise<void> {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }

  // Flush remaining metrics
  await flushMetricsBuffer();

  // Save counters
  await saveCountersToRedis();

  logger.info('Strudel metrics service shut down');
}

/**
 * Records metrics for a Strudel operation
 */
export function recordStrudelMetrics(metrics: StrudelProcessMetrics): void {
  if (metrics.type === 'validation') {
    recordValidation(metrics.success, metrics.durationMs, metrics.errorCode);
  } else {
    recordRender(
      metrics.success,
      metrics.durationMs,
      metrics.audioLengthSeconds || 0,
      metrics.errorCode
    );
  }

  // Add to buffer
  metricsBuffer.push(metrics);

  // Flush if buffer is full
  if (metricsBuffer.length >= BUFFER_SIZE) {
    flushMetricsBuffer().catch((error) => {
      logger.error({ error: error.message }, 'Failed to flush Strudel metrics buffer');
    });
  }
}

/**
 * Records validation metrics
 */
export function recordValidation(success: boolean, durationMs: number, errorCode?: string): void {
  counters.totalValidations++;

  if (success) {
    counters.successfulValidations++;
  } else {
    counters.failedValidations++;
    counters.validationErrors++;
  }

  counters.totalValidationTimeMs += durationMs;
  counters.minValidationTimeMs = Math.min(counters.minValidationTimeMs, durationMs);
  counters.maxValidationTimeMs = Math.max(counters.maxValidationTimeMs, durationMs);

  addDurationSample(validationDurationSamples, durationMs);

  if (errorCode) {
    trackErrorCode(errorCode);
  }
}

/**
 * Records render metrics
 */
export function recordRender(
  success: boolean,
  durationMs: number,
  audioLengthSeconds: number,
  errorCode?: string
): void {
  counters.totalRenders++;

  if (success) {
    counters.successfulRenders++;
    counters.totalAudioSeconds += audioLengthSeconds;
  } else {
    counters.failedRenders++;
    counters.renderErrors++;
  }

  counters.totalRenderTimeMs += durationMs;
  counters.minRenderTimeMs = Math.min(counters.minRenderTimeMs, durationMs);
  counters.maxRenderTimeMs = Math.max(counters.maxRenderTimeMs, durationMs);

  addDurationSample(renderDurationSamples, durationMs);

  if (errorCode) {
    trackErrorCode(errorCode);
  }
}

/**
 * Records a cancelled render
 */
export function recordCancelledRender(): void {
  counters.cancelledRenders++;
}

/**
 * Records a queue rejection
 */
export function recordQueueRejection(): void {
  counters.queueRejections++;
}

/**
 * Updates peak queue depth
 */
export function updatePeakQueueDepth(currentDepth: number): void {
  counters.peakQueueDepth = Math.max(counters.peakQueueDepth, currentDepth);
}

/**
 * Records queue wait time
 */
export function recordQueueWaitTime(waitTimeMs: number): void {
  counters.totalQueueWaitTimeMs += waitTimeMs;
}

/**
 * Tracks error codes
 */
function trackErrorCode(errorCode: string): void {
  if (errorCode.includes('TIMEOUT')) {
    counters.timeoutErrors++;
  } else if (errorCode.includes('SYSTEM') || errorCode.includes('INTERNAL')) {
    counters.systemErrors++;
  }
}

/**
 * Adds a duration sample for percentile tracking
 */
function addDurationSample(samples: number[], duration: number): void {
  if (samples.length < MAX_SAMPLES) {
    samples.push(duration);
  } else {
    // Reservoir sampling for maintaining representative sample
    const randomIndex = Math.floor(Math.random() * (samples.length + 1));
    if (randomIndex < MAX_SAMPLES) {
      samples[randomIndex] = duration;
    }
  }
}

/**
 * Calculates percentile from samples
 */
function calculatePercentile(samples: number[], percentile: number): number {
  if (samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((a, b) => a - b);
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
    logger.warn('Cannot flush Strudel metrics: Redis not connected');
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

    logger.debug({ count: toFlush.length }, 'Strudel metrics flushed to Redis');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to flush Strudel metrics to Redis');

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
      const saved = JSON.parse(data) as Record<string, unknown>;
      counters = { ...counters, ...saved } as typeof counters;

      // Handle Infinity values (stored as null in JSON since JSON doesn't support Infinity)
      if ((saved['minValidationTimeMs'] as number | null) === null) {
        counters.minValidationTimeMs = Infinity;
      }
      if ((saved['minRenderTimeMs'] as number | null) === null) {
        counters.minRenderTimeMs = Infinity;
      }
    }
  } catch {
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
    // Convert Infinity to null for JSON serialization
    const serializable = {
      ...counters,
      minValidationTimeMs:
        counters.minValidationTimeMs === Infinity ? null : counters.minValidationTimeMs,
      minRenderTimeMs: counters.minRenderTimeMs === Infinity ? null : counters.minRenderTimeMs,
    };
    await redis.setex(METRICS_SUMMARY_KEY, METRICS_TTL_SECONDS, JSON.stringify(serializable));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to save Strudel metrics counters');
  }
}

/**
 * Gets aggregated service metrics
 */
export async function getServiceMetrics(
  periodSeconds: number = 3600
): Promise<StrudelServiceMetrics> {
  // Calculate averages
  const avgValidationTimeMs =
    counters.totalValidations > 0 ? counters.totalValidationTimeMs / counters.totalValidations : 0;

  const avgRenderTimeMs =
    counters.totalRenders > 0 ? counters.totalRenderTimeMs / counters.totalRenders : 0;

  const avgRenderDurationSeconds =
    counters.successfulRenders > 0 ? counters.totalAudioSeconds / counters.successfulRenders : 0;

  const avgQueueWaitTimeMs =
    counters.totalRenders > 0 ? counters.totalQueueWaitTimeMs / counters.totalRenders : 0;

  // Get current queue depth
  let currentQueueDepth = 0;
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      currentQueueDepth = await redis.zcard('strudel:queue');
    } catch {
      // Ignore errors
    }
  }

  return {
    periodSeconds,
    validation: {
      total: counters.totalValidations,
      successful: counters.successfulValidations,
      failed: counters.failedValidations,
      averageTimeMs: Math.round(avgValidationTimeMs),
    },
    render: {
      total: counters.totalRenders,
      successful: counters.successfulRenders,
      failed: counters.failedRenders,
      cancelled: counters.cancelledRenders,
      averageTimeMs: Math.round(avgRenderTimeMs),
      averageDurationSeconds: Math.round(avgRenderDurationSeconds * 100) / 100,
      totalAudioSeconds: Math.round(counters.totalAudioSeconds * 100) / 100,
    },
    queue: {
      currentDepth: currentQueueDepth,
      peakDepth: counters.peakQueueDepth,
      averageWaitTimeMs: Math.round(avgQueueWaitTimeMs),
      rejected: counters.queueRejections,
    },
    errors: {
      validationErrors: counters.validationErrors,
      renderErrors: counters.renderErrors,
      timeoutErrors: counters.timeoutErrors,
      systemErrors: counters.systemErrors,
    },
  };
}

/**
 * Gets recent individual metrics
 */
export async function getRecentMetrics(limit: number = 100): Promise<StrudelProcessMetrics[]> {
  if (!isRedisConnected()) {
    return metricsBuffer.slice(-limit);
  }

  try {
    const redis = getRedisClient();
    const data = await redis.lrange(METRICS_LIST_KEY, 0, limit - 1);

    return data.map((item) => JSON.parse(item) as StrudelProcessMetrics);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to get recent Strudel metrics');
    return metricsBuffer.slice(-limit);
  }
}

/**
 * Gets metrics for a specific user
 */
export async function getUserMetrics(
  userId: string,
  limit: number = 100
): Promise<StrudelProcessMetrics[]> {
  const allMetrics = await getRecentMetrics(limit * 10); // Fetch more to filter

  return allMetrics.filter((m) => m.userId === userId).slice(0, limit);
}

/**
 * Resets all metrics (for testing or maintenance)
 */
export async function resetMetrics(): Promise<void> {
  counters = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    totalValidationTimeMs: 0,
    minValidationTimeMs: Infinity,
    maxValidationTimeMs: 0,
    totalRenders: 0,
    successfulRenders: 0,
    failedRenders: 0,
    cancelledRenders: 0,
    totalRenderTimeMs: 0,
    minRenderTimeMs: Infinity,
    maxRenderTimeMs: 0,
    totalAudioSeconds: 0,
    peakQueueDepth: 0,
    totalQueueWaitTimeMs: 0,
    queueRejections: 0,
    validationErrors: 0,
    renderErrors: 0,
    timeoutErrors: 0,
    systemErrors: 0,
  };

  validationDurationSamples.length = 0;
  renderDurationSamples.length = 0;
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

  logger.info('Strudel metrics reset');
}

/**
 * Gets validation duration percentiles
 */
export function getValidationPercentiles(): { p50: number; p95: number; p99: number } {
  return {
    p50: calculatePercentile(validationDurationSamples, 50),
    p95: calculatePercentile(validationDurationSamples, 95),
    p99: calculatePercentile(validationDurationSamples, 99),
  };
}

/**
 * Gets render duration percentiles
 */
export function getRenderPercentiles(): { p50: number; p95: number; p99: number } {
  return {
    p50: calculatePercentile(renderDurationSamples, 50),
    p95: calculatePercentile(renderDurationSamples, 95),
    p99: calculatePercentile(renderDurationSamples, 99),
  };
}

/**
 * Gets current counters (for debugging)
 */
export function getCounters(): typeof counters {
  return { ...counters };
}

export default {
  initializeStrudelMetricsService,
  shutdownStrudelMetricsService,
  recordStrudelMetrics,
  recordValidation,
  recordRender,
  recordCancelledRender,
  recordQueueRejection,
  updatePeakQueueDepth,
  recordQueueWaitTime,
  getServiceMetrics,
  getRecentMetrics,
  getUserMetrics,
  resetMetrics,
  getValidationPercentiles,
  getRenderPercentiles,
  getCounters,
};
