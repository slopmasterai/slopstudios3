/**
 * Error Middleware
 * Centralized error handling and transformation
 */

import { serverConfig } from '../config/server.config.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error factories
 */
export const Errors = {
  badRequest: (message: string = 'Bad request') =>
    new AppError(message, 400, 'BAD_REQUEST'),

  unauthorized: (message: string = 'Unauthorized') =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  forbidden: (message: string = 'Forbidden') =>
    new AppError(message, 403, 'FORBIDDEN'),

  notFound: (message: string = 'Resource not found') =>
    new AppError(message, 404, 'NOT_FOUND'),

  conflict: (message: string = 'Conflict') =>
    new AppError(message, 409, 'CONFLICT'),

  unprocessable: (message: string = 'Unprocessable entity') =>
    new AppError(message, 422, 'UNPROCESSABLE_ENTITY'),

  tooManyRequests: (message: string = 'Too many requests') =>
    new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'),

  internal: (message: string = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_ERROR', false),

  serviceUnavailable: (message: string = 'Service unavailable') =>
    new AppError(message, 503, 'SERVICE_UNAVAILABLE'),
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
 * Global error handler for Fastify
 */
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const isProduction = serverConfig.env === 'production';
  const requestId = request.id || generateRequestId();

  // Determine status code
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let errorMessage = 'An internal server error occurred';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    errorMessage = error.message;
  } else if ('statusCode' in error && typeof error.statusCode === 'number') {
    statusCode = error.statusCode;
    errorCode = (error).code || 'ERROR';

    // Map Fastify error codes
    if (errorCodeToStatus[(error).code || '']) {
      statusCode = errorCodeToStatus[(error).code || '']!;
    }
    if (errorCodeToMessage[(error).code || '']) {
      errorMessage = errorCodeToMessage[(error).code || '']!;
    } else if (statusCode < 500) {
      errorMessage = error.message;
    }
  } else if ('validation' in error && Array.isArray((error).validation)) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Request validation failed';
  }

  // Log the error
  const logContext = {
    requestId,
    method: request.method,
    url: request.url,
    statusCode,
    errorCode,
    userId: request.user?.id,
  };

  if (statusCode >= 500) {
    logger.error({ ...logContext, err: error }, 'Server error');
  } else if (statusCode >= 400) {
    logger.warn({ ...logContext, message: error.message }, 'Client error');
  }

  // Build response
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: errorCode,
      message: isProduction && statusCode >= 500 ? 'An internal server error occurred' : errorMessage,
    },
    meta: {
      timestamp: timestamp(),
      requestId,
    },
  };

  // Add validation details if present and not in production
  if (!isProduction && 'validation' in error && Array.isArray((error).validation)) {
    (response.error as { details?: unknown }).details = (error).validation;
  }

  reply.status(statusCode).send(response);
}

/**
 * Not found handler
 */
export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): void {
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
export function asyncHandler<T>(
  fn: (request: FastifyRequest, reply: FastifyReply) => Promise<T>
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<T | void> => {
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
