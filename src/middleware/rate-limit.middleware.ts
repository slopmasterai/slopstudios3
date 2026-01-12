/**
 * Rate Limit Middleware
 * Custom rate limiting with per-user and per-IP limits
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { serverConfig } from '../config/server.config.js';
import { getRedisClient } from '../services/redis.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

const RATE_LIMIT_PREFIX = 'ratelimit:';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
}

// Different rate limits for different route groups
export const rateLimitConfigs: Record<string, RateLimitConfig> = {
  default: {
    windowMs: serverConfig.rateLimit.windowMs,
    maxRequests: serverConfig.rateLimit.maxRequests,
  },
  auth: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute
  },
  api: {
    windowMs: serverConfig.rateLimit.windowMs,
    maxRequests: serverConfig.rateLimit.maxRequests,
  },
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50, // 50 uploads per hour
  },
  heavy: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute (increased for development)
  },
};

/**
 * Gets the rate limit key for a request
 */
function getRateLimitKey(request: FastifyRequest, group: string): string {
  // Use user ID if authenticated, otherwise use IP
  const userId = request.user?.id;
  const identifier = userId || request.ip;
  return `${RATE_LIMIT_PREFIX}${group}:${identifier}`;
}

/**
 * Checks and updates rate limit
 */
async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    // Use Redis sorted set to track requests within window
    const multi = redis.multi();

    // Remove old entries outside the window
    multi.zremrangebyscore(key, 0, windowStart);

    // Count current requests in window
    multi.zcard(key);

    // Add current request
    multi.zadd(key, now, `${now}:${Math.random()}`);

    // Set expiry on the key
    multi.pexpire(key, config.windowMs);

    const results = await multi.exec();

    if (!results) {
      // Redis transaction failed, allow request
      return {
        allowed: true,
        limit: config.maxRequests,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs,
      };
    }

    const currentCount = (results[1]?.[1] as number) || 0;
    const remaining = Math.max(0, config.maxRequests - currentCount - 1);

    return {
      allowed: currentCount < config.maxRequests,
      limit: config.maxRequests,
      remaining,
      resetTime: now + config.windowMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ key, error: errorMessage }, 'Rate limit check failed');

    // On error, allow the request
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs,
    };
  }
}

/**
 * Creates a rate limit middleware for a specific group
 */
export function createRateLimiter(group: string = 'default') {
  const config = rateLimitConfigs[group] || rateLimitConfigs['default']!;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Skip rate limiting in development mode
    if (serverConfig.env === 'development') {
      return;
    }

    const key = getRateLimitKey(request, group);
    const result = await checkRateLimit(key, config);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', result.limit);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      reply.header('Retry-After', retryAfter);

      logger.warn(
        {
          requestId: request.id,
          ip: request.ip,
          userId: request.user?.id,
          group,
          path: request.url,
        },
        'Rate limit exceeded'
      );

      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      reply.status(429).send(response);
    }
  };
}

/**
 * Default rate limiter using default config
 */
export const defaultRateLimiter = createRateLimiter('default');

/**
 * Auth rate limiter with stricter limits
 */
export const authRateLimiter = createRateLimiter('auth');

/**
 * Heavy operation rate limiter
 */
export const heavyRateLimiter = createRateLimiter('heavy');

/**
 * Upload rate limiter
 */
export const uploadRateLimiter = createRateLimiter('upload');

export default createRateLimiter;
