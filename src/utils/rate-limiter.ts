/**
 * Shared Rate Limiter Utility
 * Generic rate limiting functionality for services
 */

import { getRedisClient, isRedisConnected } from '../services/redis.service.js';

import { logger } from './logger.js';

interface RateLimitConfig {
  /** Redis key prefix for this rate limiter */
  prefix: string;
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Time until window resets (in seconds) */
  resetIn?: number;
}

/**
 * Check and update rate limit for a user
 * Returns whether the request is allowed and remaining quota
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // If Redis is not connected, allow all requests
  if (!isRedisConnected()) {
    return { allowed: true, remaining: config.maxRequests };
  }

  try {
    const redis = getRedisClient();
    const key = `${config.prefix}${userId}`;

    // Increment the counter
    const count = await redis.incr(key);

    // Set expiry on first request in window
    if (count === 1) {
      await redis.expire(key, config.windowSeconds);
    }

    // Get TTL for reset time
    const ttl = await redis.ttl(key);

    const remaining = Math.max(0, config.maxRequests - count);
    const allowed = count <= config.maxRequests;

    return {
      allowed,
      remaining,
      resetIn: ttl > 0 ? ttl : config.windowSeconds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(
      { error: errorMessage, userId, prefix: config.prefix },
      'Rate limit check failed, allowing request'
    );

    // On error, allow the request
    return { allowed: true, remaining: config.maxRequests };
  }
}

/**
 * Reset rate limit for a user (useful for testing or admin actions)
 */
export async function resetRateLimit(userId: string, prefix: string): Promise<boolean> {
  if (!isRedisConnected()) {
    return false;
  }

  try {
    const redis = getRedisClient();
    const key = `${prefix}${userId}`;
    await redis.del(key);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage, userId, prefix }, 'Rate limit reset failed');
    return false;
  }
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (!isRedisConnected()) {
    return { allowed: true, remaining: config.maxRequests };
  }

  try {
    const redis = getRedisClient();
    const key = `${config.prefix}${userId}`;

    const count = await redis.get(key);
    const currentCount = count !== null && count !== '' ? parseInt(count, 10) : 0;
    const ttl = await redis.ttl(key);

    const remaining = Math.max(0, config.maxRequests - currentCount);

    return {
      allowed: currentCount < config.maxRequests,
      remaining,
      resetIn: ttl > 0 ? ttl : undefined,
    };
  } catch {
    return { allowed: true, remaining: config.maxRequests };
  }
}
