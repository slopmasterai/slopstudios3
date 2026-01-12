/**
 * Shared Error Handling Utilities
 * Common error types and helper functions
 */

/**
 * Base error class for process-related errors
 */
export class ProcessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'ProcessError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends ProcessError {
  constructor(message: string = 'Rate limit exceeded') {
    super('RATE_LIMIT_EXCEEDED', message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when maximum concurrent processes are reached
 */
export class ConcurrencyError extends ProcessError {
  constructor(message: string = 'Too many concurrent processes') {
    super('MAX_CONCURRENT_REACHED', message, 503);
    this.name = 'ConcurrencyError';
  }
}

/**
 * Error thrown when a process times out
 */
export class TimeoutError extends ProcessError {
  constructor(message: string = 'Process timed out') {
    super('TIMEOUT', message, 408);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends ProcessError {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super('VALIDATION_FAILED', message, 400);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends ProcessError {
  constructor(message: string = 'Resource not found') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Safely extract error details for logging
 */
export function getErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof ProcessError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      name: error.name,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    };
  }
  return { error: String(error) };
}

/**
 * Check if an error is a known process error
 */
export function isProcessError(error: unknown): error is ProcessError {
  return error instanceof ProcessError;
}

/**
 * Wrap an unknown error as a ProcessError
 */
export function wrapError(error: unknown, defaultCode: string = 'INTERNAL_ERROR'): ProcessError {
  if (error instanceof ProcessError) {
    return error;
  }
  const message = getErrorMessage(error);
  return new ProcessError(defaultCode, message);
}
