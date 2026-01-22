/**
 * Logger Module
 * Configures Pino logger with structured JSON logging for production
 * and pretty printing for development
 *
 * Features:
 * - Correlation ID tracking for request tracing
 * - Per-module log levels
 * - Performance timing logs
 * - Memory usage tracking
 * - Log sampling for high-volume operations
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

import { serverConfig } from '../config/server.config.js';

import { timestamp } from './index.js';

// =============================================================================
// Correlation ID Management
// =============================================================================

/**
 * Async local storage for correlation ID propagation
 * This allows correlation IDs to be automatically included in logs
 * throughout the request lifecycle without explicit passing
 */
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Gets the current request context
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Gets the current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}

/**
 * Runs a function with a request context
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Runs an async function with a request context
 */
export async function runWithContextAsync<T>(
  context: RequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Creates a new request context
 */
export function createRequestContext(
  correlationId: string,
  userId?: string,
  sessionId?: string
): RequestContext {
  return {
    correlationId,
    userId,
    sessionId,
    startTime: Date.now(),
  };
}

// =============================================================================
// Log Level Configuration
// =============================================================================

const logLevelMap: Record<string, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/**
 * Per-module log levels
 * Override global log level for specific modules
 */
const moduleLevels: Record<string, string> = {
  // Example: reduce verbosity for specific modules
  // 'websocket': 'warn',
  // 'redis': 'info',
};

/**
 * Gets the log level for a specific module
 */
export function getModuleLogLevel(module: string): string {
  return moduleLevels[module] ?? logLevelMap[serverConfig.logLevel] ?? 'info';
}

/**
 * Sets log level for a specific module
 */
export function setModuleLogLevel(module: string, level: string): void {
  if (logLevelMap[level]) {
    moduleLevels[module] = level;
  }
}

// =============================================================================
// Log Sampling
// =============================================================================

interface SamplingConfig {
  rate: number; // 0-1, percentage of logs to keep
  counter: number;
}

const samplingConfigs: Map<string, SamplingConfig> = new Map();

/**
 * Configures sampling for a log category
 */
export function configureSampling(category: string, rate: number): void {
  samplingConfigs.set(category, { rate: Math.max(0, Math.min(1, rate)), counter: 0 });
}

/**
 * Checks if a log should be sampled (included)
 */
export function shouldSample(category: string): boolean {
  const config = samplingConfigs.get(category);
  if (!config) return true; // No sampling configured, include all

  config.counter++;
  if (config.counter >= 1 / config.rate) {
    config.counter = 0;
    return true;
  }
  return false;
}

// =============================================================================
// Logger Configuration
// =============================================================================

function createLoggerOptions(): LoggerOptions {
  const isDevelopment = serverConfig.env === 'development';

  const baseOptions: LoggerOptions = {
    level: logLevelMap[serverConfig.logLevel] || 'info',
    timestamp: () => `,"time":"${timestamp()}"`,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings['pid'],
        host: bindings['hostname'],
      }),
    },
    base: {
      env: serverConfig.env,
    },
    // Mixin to automatically add correlation ID from async context
    mixin: () => {
      const context = getRequestContext();
      if (context) {
        return {
          correlationId: context.correlationId,
          userId: context.userId,
        };
      }
      return {};
    },
  };

  if (isDevelopment) {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    };
  }

  return baseOptions;
}

// Create main logger instance
export const logger: Logger = pino(createLoggerOptions());

// =============================================================================
// Child Loggers
// =============================================================================

/**
 * Creates a child logger with request context
 */
export function createRequestLogger(requestId: string, userId?: string): Logger {
  return logger.child({
    requestId,
    correlationId: requestId,
    userId,
  });
}

/**
 * Creates a child logger for a specific module
 */
export function createModuleLogger(module: string): Logger {
  const level = getModuleLogLevel(module);
  return logger.child({ module }, { level });
}

// =============================================================================
// Performance Logging
// =============================================================================

interface TimingMetrics {
  operation: string;
  durationMs: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Logs a timed operation
 */
export function logTiming(metrics: TimingMetrics): void {
  const { operation, durationMs, success, metadata } = metrics;

  // Apply sampling for high-frequency operations
  if (!shouldSample(`timing:${operation}`)) {
    return;
  }

  const logData = {
    type: 'timing',
    operation,
    durationMs,
    success,
    ...metadata,
  };

  if (durationMs > 5000) {
    logger.warn(logData, `Slow operation: ${operation} took ${durationMs}ms`);
  } else if (durationMs > 1000) {
    logger.info(logData, `Operation ${operation} completed in ${durationMs}ms`);
  } else {
    logger.debug(logData, `Operation ${operation} completed in ${durationMs}ms`);
  }
}

/**
 * Creates a timer for measuring operation duration
 */
export function createTimer(operation: string): () => number {
  const start = performance.now();
  return () => {
    const duration = Math.round(performance.now() - start);
    return duration;
  };
}

/**
 * Wraps an async function with automatic timing
 */
export async function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const timer = createTimer(operation);
  let success = true;

  try {
    return await fn();
  } catch (error) {
    success = false;
    throw error;
  } finally {
    logTiming({
      operation,
      durationMs: timer(),
      success,
      metadata,
    });
  }
}

// =============================================================================
// Memory Logging
// =============================================================================

/**
 * Gets current memory usage
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  heapUsedPercent: number;
} {
  const mem = process.memoryUsage();
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    heapUsedPercent: mem.heapTotal > 0 ? Math.round((mem.heapUsed / mem.heapTotal) * 100) : 0,
  };
}

/**
 * Logs current memory usage
 */
export function logMemoryUsage(context?: string): void {
  const memory = getMemoryUsage();

  logger.info(
    {
      type: 'memory',
      context,
      heapUsedMB: memory.heapUsedMB,
      heapTotalMB: memory.heapTotalMB,
      rssMB: memory.rssMB,
    },
    `Memory usage${context ? ` (${context})` : ''}: ${memory.heapUsedMB}MB heap, ${memory.rssMB}MB RSS`
  );
}

// =============================================================================
// Structured Log Helpers
// =============================================================================

/**
 * Logs an HTTP request (for request logging middleware)
 */
export function logRequest(data: {
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  contentLength?: number;
}): void {
  const {
    method,
    url,
    statusCode,
    durationMs,
    requestId,
    userId,
    userAgent,
    ip,
    contentLength,
  } = data;

  const logData = {
    type: 'request',
    method,
    url,
    statusCode,
    durationMs,
    requestId,
    userId,
    userAgent,
    ip,
    contentLength,
  };

  if (statusCode >= 500) {
    logger.error(logData, `${method} ${url} ${statusCode} ${durationMs}ms`);
  } else if (statusCode >= 400) {
    logger.warn(logData, `${method} ${url} ${statusCode} ${durationMs}ms`);
  } else if (durationMs > 3000) {
    logger.warn(logData, `Slow request: ${method} ${url} ${statusCode} ${durationMs}ms`);
  } else {
    logger.info(logData, `${method} ${url} ${statusCode} ${durationMs}ms`);
  }
}

/**
 * Logs an external service call
 */
export function logExternalCall(data: {
  service: string;
  operation: string;
  durationMs: number;
  success: boolean;
  statusCode?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}): void {
  const { service, operation, durationMs, success, statusCode, error, metadata } = data;

  const logData = {
    type: 'external_call',
    service,
    operation,
    durationMs,
    success,
    statusCode,
    error,
    ...metadata,
  };

  if (!success) {
    logger.error(logData, `External call failed: ${service}/${operation}`);
  } else if (durationMs > 5000) {
    logger.warn(logData, `Slow external call: ${service}/${operation} took ${durationMs}ms`);
  } else {
    logger.debug(logData, `External call: ${service}/${operation} ${durationMs}ms`);
  }
}

/**
 * Logs a business event
 */
export function logEvent(
  event: string,
  data: Record<string, unknown>,
  level: 'debug' | 'info' | 'warn' | 'error' = 'info'
): void {
  const logData = {
    type: 'event',
    event,
    ...data,
  };

  logger[level](logData, event);
}

// =============================================================================
// Fastify Integration
// =============================================================================

/**
 * Fastify logger options for integration
 */
export function getFastifyLoggerOptions(): LoggerOptions | boolean {
  const isDevelopment = serverConfig.env === 'development';

  if (isDevelopment) {
    return {
      level: logLevelMap[serverConfig.logLevel] || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    };
  }

  return {
    level: logLevelMap[serverConfig.logLevel] || 'info',
    timestamp: () => `,"time":"${timestamp()}"`,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
}

export default logger;
