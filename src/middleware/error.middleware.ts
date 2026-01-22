/**
 * Error Middleware
 * Centralized error handling and transformation with comprehensive error tracking
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { serverConfig } from '../config/server.config.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

// =============================================================================
// Error Categories
// =============================================================================

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'validation'      // Input validation errors
  | 'authentication'  // Auth-related errors
  | 'authorization'   // Permission errors
  | 'not_found'       // Resource not found
  | 'conflict'        // Resource conflict
  | 'rate_limit'      // Rate limiting
  | 'client'          // Other client errors
  | 'external'        // External service errors
  | 'internal'        // Internal server errors
  | 'timeout';        // Timeout errors

/**
 * Maps error codes to categories
 */
const errorCodeCategories: Record<string, ErrorCategory> = {
  BAD_REQUEST: 'validation',
  VALIDATION_ERROR: 'validation',
  UNAUTHORIZED: 'authentication',
  INVALID_CREDENTIALS: 'authentication',
  TOKEN_EXPIRED: 'authentication',
  FORBIDDEN: 'authorization',
  ACCESS_DENIED: 'authorization',
  NOT_FOUND: 'not_found',
  USER_NOT_FOUND: 'not_found',
  RESOURCE_NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  USER_EXISTS: 'conflict',
  RATE_LIMIT_EXCEEDED: 'rate_limit',
  TOO_MANY_REQUESTS: 'rate_limit',
  UNPROCESSABLE_ENTITY: 'validation',
  INTERNAL_ERROR: 'internal',
  SERVICE_UNAVAILABLE: 'external',
  CIRCUIT_BREAKER_OPEN: 'external',
  TIMEOUT: 'timeout',
  GATEWAY_TIMEOUT: 'timeout',
};

// =============================================================================
// Error Rate Tracking
// =============================================================================

interface ErrorRateBucket {
  count: number;
  timestamp: number;
}

const errorRateBuckets: Map<string, ErrorRateBucket[]> = new Map();
const ERROR_RATE_WINDOW_MS = 60000; // 1 minute
const ERROR_RATE_BUCKET_SIZE_MS = 1000; // 1 second buckets

/**
 * Records an error for rate tracking
 */
function recordError(category: ErrorCategory): void {
  const now = Date.now();
  const buckets = errorRateBuckets.get(category) ?? [];

  // Remove expired buckets
  const validBuckets = buckets.filter(
    (b) => now - b.timestamp < ERROR_RATE_WINDOW_MS
  );

  // Add or increment current bucket
  const currentBucketTime = Math.floor(now / ERROR_RATE_BUCKET_SIZE_MS) * ERROR_RATE_BUCKET_SIZE_MS;
  const currentBucket = validBuckets.find((b) => b.timestamp === currentBucketTime);

  if (currentBucket) {
    currentBucket.count++;
  } else {
    validBuckets.push({ count: 1, timestamp: currentBucketTime });
  }

  errorRateBuckets.set(category, validBuckets);
}

/**
 * Gets error rate for a category (errors per minute)
 */
export function getErrorRate(category: ErrorCategory): number {
  const now = Date.now();
  const buckets = errorRateBuckets.get(category) ?? [];

  const validBuckets = buckets.filter(
    (b) => now - b.timestamp < ERROR_RATE_WINDOW_MS
  );

  return validBuckets.reduce((sum, b) => sum + b.count, 0);
}

/**
 * Gets all error rates
 */
export function getAllErrorRates(): Record<ErrorCategory, number> {
  const categories: ErrorCategory[] = [
    'validation', 'authentication', 'authorization', 'not_found',
    'conflict', 'rate_limit', 'client', 'external', 'internal', 'timeout'
  ];

  const rates: Record<string, number> = {};
  for (const category of categories) {
    rates[category] = getErrorRate(category);
  }

  return rates as Record<ErrorCategory, number>;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Extended error details
 */
export interface ErrorDetails {
  /** Field-specific errors for validation */
  fields?: Record<string, string>;
  /** Original error for debugging */
  originalError?: string;
  /** Suggested retry after (seconds) for rate limits */
  retryAfter?: number;
  /** Related resource identifier */
  resourceId?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Custom application error class with enhanced metadata
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly category: ErrorCategory;
  public readonly details?: ErrorDetails;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: ErrorDetails
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.category = errorCodeCategories[code] ?? (statusCode >= 500 ? 'internal' : 'client');
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Converts error to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      category: this.category,
      isOperational: this.isOperational,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Common error factories with enhanced details support
 */
export const Errors = {
  badRequest: (message: string = 'Bad request', details?: ErrorDetails): AppError =>
    new AppError(message, 400, 'BAD_REQUEST', true, details),

  validation: (message: string = 'Validation failed', fields?: Record<string, string>): AppError =>
    new AppError(message, 400, 'VALIDATION_ERROR', true, { fields }),

  unauthorized: (message: string = 'Unauthorized', details?: ErrorDetails): AppError =>
    new AppError(message, 401, 'UNAUTHORIZED', true, details),

  invalidCredentials: (message: string = 'Invalid credentials'): AppError =>
    new AppError(message, 401, 'INVALID_CREDENTIALS', true),

  tokenExpired: (message: string = 'Token has expired'): AppError =>
    new AppError(message, 401, 'TOKEN_EXPIRED', true),

  forbidden: (message: string = 'Forbidden', details?: ErrorDetails): AppError =>
    new AppError(message, 403, 'FORBIDDEN', true, details),

  notFound: (message: string = 'Resource not found', resourceId?: string): AppError =>
    new AppError(message, 404, 'NOT_FOUND', true, resourceId ? { resourceId } : undefined),

  conflict: (message: string = 'Conflict', details?: ErrorDetails): AppError =>
    new AppError(message, 409, 'CONFLICT', true, details),

  unprocessable: (message: string = 'Unprocessable entity', details?: ErrorDetails): AppError =>
    new AppError(message, 422, 'UNPROCESSABLE_ENTITY', true, details),

  tooManyRequests: (message: string = 'Too many requests', retryAfter?: number): AppError =>
    new AppError(message, 429, 'RATE_LIMIT_EXCEEDED', true, retryAfter ? { retryAfter } : undefined),

  internal: (message: string = 'Internal server error', details?: ErrorDetails): AppError =>
    new AppError(message, 500, 'INTERNAL_ERROR', false, details),

  serviceUnavailable: (message: string = 'Service unavailable', details?: ErrorDetails): AppError =>
    new AppError(message, 503, 'SERVICE_UNAVAILABLE', true, details),

  circuitBreakerOpen: (serviceName: string): AppError =>
    new AppError(
      `Service ${serviceName} is temporarily unavailable`,
      503,
      'CIRCUIT_BREAKER_OPEN',
      true,
      { context: { service: serviceName } }
    ),

  timeout: (message: string = 'Request timed out', details?: ErrorDetails): AppError =>
    new AppError(message, 504, 'TIMEOUT', true, details),

  gatewayTimeout: (message: string = 'Gateway timeout', details?: ErrorDetails): AppError =>
    new AppError(message, 504, 'GATEWAY_TIMEOUT', true, details),

  /**
   * Creates an error from an unknown error with context wrapping
   */
  wrap: (error: unknown, context?: string): AppError => {
    if (error instanceof AppError) {
      if (context) {
        return new AppError(
          `${context}: ${error.message}`,
          error.statusCode,
          error.code,
          error.isOperational,
          { ...error.details, originalError: error.message }
        );
      }
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    const fullMessage = context ? `${context}: ${message}` : message;

    return new AppError(fullMessage, 500, 'INTERNAL_ERROR', false, {
      originalError: message,
    });
  },
};

/**
 * Maps error codes to HTTP status codes
 */
const errorCodeToStatus: Record<string, number> = {
  FST_ERR_VALIDATION: 400,
  FST_ERR_CTP_INVALID_TYPE: 400,
  FST_ERR_CTP_EMPTY_TYPE: 400,
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 400,
  FST_JWT_NO_AUTHORIZATION_IN_HEADER: 401,
  FST_JWT_AUTHORIZATION_TOKEN_INVALID: 401,
  FST_JWT_AUTHORIZATION_TOKEN_EXPIRED: 401,
  FST_ERR_NOT_FOUND: 404,
  FST_RATE_LIMIT: 429,
};

/**
 * Maps error codes to user-friendly messages
 */
const errorCodeToMessage: Record<string, string> = {
  FST_ERR_VALIDATION: 'Request validation failed',
  FST_ERR_CTP_INVALID_TYPE: 'Invalid content type',
  FST_ERR_CTP_EMPTY_TYPE: 'Content type is required',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Unsupported media type',
  FST_JWT_NO_AUTHORIZATION_IN_HEADER: 'Authorization header is required',
  FST_JWT_AUTHORIZATION_TOKEN_INVALID: 'Invalid authorization token',
  FST_JWT_AUTHORIZATION_TOKEN_EXPIRED: 'Authorization token has expired',
  FST_ERR_NOT_FOUND: 'Resource not found',
  FST_RATE_LIMIT: 'Too many requests',
};

/**
 * Extended API error response with additional metadata
 */
interface ExtendedApiError {
  code: string;
  message: string;
  category?: ErrorCategory;
  details?: ErrorDetails;
  retryAfter?: number;
}

/**
 * Global error handler for Fastify
 * Provides comprehensive error handling with categorization and rate tracking
 */
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const isProduction = serverConfig.env === 'production';
  const requestId = request.id || generateRequestId();
  const startTime = Date.now();

  // Determine status code, error code, and message
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let errorMessage = 'An internal server error occurred';
  let category: ErrorCategory = 'internal';
  let details: ErrorDetails | undefined;
  let isOperational = false;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    errorMessage = error.message;
    category = error.category;
    details = error.details;
    isOperational = error.isOperational;
  } else if ('statusCode' in error && typeof error.statusCode === 'number') {
    statusCode = error.statusCode;
    errorCode = error.code || 'ERROR';

    // Map Fastify error codes
    const errorCodeKey = error.code ?? '';
    const mappedStatus = errorCodeToStatus[errorCodeKey];
    if (mappedStatus !== undefined) {
      statusCode = mappedStatus;
    }
    const mappedMessage = errorCodeToMessage[errorCodeKey];
    if (mappedMessage !== undefined) {
      errorMessage = mappedMessage;
    } else if (statusCode < 500) {
      errorMessage = error.message;
    }

    // Determine category from error code
    category = errorCodeCategories[errorCode] ?? (statusCode >= 500 ? 'internal' : 'client');
    isOperational = statusCode < 500;
  } else if ('validation' in error && Array.isArray(error.validation)) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Request validation failed';
    category = 'validation';
    isOperational = true;

    // Extract validation details
    details = {
      fields: extractValidationFields(error.validation),
    };
  }

  // Record error for rate tracking
  recordError(category);

  // Build log context with request metadata
  const logContext = {
    requestId,
    method: request.method,
    url: request.url,
    statusCode,
    errorCode,
    category,
    isOperational,
    userId: request.user !== undefined ? request.user.id : undefined,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
    duration: Date.now() - startTime,
  };

  // Log based on severity
  if (statusCode >= 500) {
    logger.error(
      { ...logContext, err: error, stack: error.stack },
      `Server error: ${errorMessage}`
    );
  } else if (statusCode >= 400) {
    logger.warn(
      { ...logContext, message: error.message },
      `Client error: ${errorMessage}`
    );
  }

  // Build response error object
  const responseError: ExtendedApiError = {
    code: errorCode,
    message: isProduction && statusCode >= 500
      ? 'An internal server error occurred'
      : errorMessage,
  };

  // Add category in non-production environments
  if (!isProduction) {
    responseError.category = category;
  }

  // Add details if available and appropriate
  if (details && !isProduction) {
    responseError.details = details;
  }

  // Add retry-after header for rate limit errors
  if (statusCode === 429 && details?.retryAfter) {
    reply.header('Retry-After', String(details.retryAfter));
    responseError.retryAfter = details.retryAfter;
  }

  // Build response
  const response: ApiResponse<null> = {
    success: false,
    error: responseError,
    meta: {
      timestamp: timestamp(),
      requestId,
    },
  };

  // Add validation details if present and not in production
  if (!isProduction && 'validation' in error && Array.isArray(error.validation)) {
    (response.error as ExtendedApiError).details = {
      ...details,
      fields: extractValidationFields(error.validation),
    };
  }

  reply.status(statusCode).send(response);
}

/**
 * Extracts field-specific errors from Fastify validation errors
 */
function extractValidationFields(
  validation: Array<{ instancePath?: string; keyword?: string; message?: string; params?: Record<string, unknown> }>
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const err of validation) {
    const path = err.instancePath?.replace(/^\//, '').replace(/\//g, '.') || 'root';
    const message = err.message || `Validation failed for ${err.keyword || 'unknown'}`;
    fields[path] = message;
  }

  return fields;
}

/**
 * Not found handler
 */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    },
    meta: {
      timestamp: timestamp(),
      requestId: request.id || generateRequestId(),
    },
  };

  reply.status(404).send(response);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T>(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<T | undefined> => {
    try {
      return await fn(request, reply);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new AppError(error.message, 500, 'INTERNAL_ERROR', false);
      }
      throw Errors.internal();
    }
  };
}

export default errorHandler;
