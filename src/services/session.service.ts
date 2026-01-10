/**
 * Session Management Module
 * Implements Redis-backed session storage and utilities
 */

import { serverConfig } from '../config/server.config.js';
import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import { getRedisClient } from './redis.service.js';

import type { SessionData } from '../types/server.types.js';

const SESSION_PREFIX = 'session:';
const SESSION_INDEX_PREFIX = 'session:user:';

function getSessionKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

function getUserSessionsKey(userId: string): string {
  return `${SESSION_INDEX_PREFIX}${userId}`;
}

export async function createSession(userId: string, data: Partial<SessionData> = {}): Promise<string> {
  const redis = getRedisClient();
  const sessionId = generateRequestId().replace('req_', 'sess_');

  const sessionData: SessionData = {
    id: sessionId,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + serverConfig.session.ttl * 1000).toISOString(),
    lastActivityAt: new Date().toISOString(),
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    data: data.data || {},
  };

  const sessionKey = getSessionKey(sessionId);

  try {
    // Store session with TTL
    await redis.setex(sessionKey, serverConfig.session.ttl, JSON.stringify(sessionData));

    // Add session to user's session index (for tracking all user sessions)
    const userSessionsKey = getUserSessionsKey(userId);
    await redis.sadd(userSessionsKey, sessionId);
    await redis.expire(userSessionsKey, serverConfig.session.ttl);

    logger.debug({ sessionId, userId }, 'Session created');

    return sessionId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ sessionId, userId, error: errorMessage }, 'Failed to create session');
    throw new Error('Failed to create session');
  }
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const redis = getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  try {
    const data = await redis.get(sessionKey);

    if (!data) {
      return null;
    }

    const session = JSON.parse(data) as SessionData;

    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      await destroySession(sessionId);
      return null;
    }

    return session;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ sessionId, error: errorMessage }, 'Failed to get session');
    return null;
  }
}

export async function updateSession(
  sessionId: string,
  updates: Partial<Pick<SessionData, 'data' | 'lastActivityAt'>>
): Promise<boolean> {
  const redis = getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  try {
    const existingData = await redis.get(sessionKey);

    if (!existingData) {
      return false;
    }

    const session = JSON.parse(existingData) as SessionData;

    // Update session data
    const updatedSession: SessionData = {
      ...session,
      ...updates,
      lastActivityAt: new Date().toISOString(),
    };

    // Get remaining TTL
    const ttl = await redis.ttl(sessionKey);
    if (ttl <= 0) {
      return false;
    }

    // Store updated session
    await redis.setex(sessionKey, ttl, JSON.stringify(updatedSession));

    logger.debug({ sessionId }, 'Session updated');

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ sessionId, error: errorMessage }, 'Failed to update session');
    return false;
  }
}

export async function extendSession(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  try {
    const existingData = await redis.get(sessionKey);

    if (!existingData) {
      return false;
    }

    const session = JSON.parse(existingData) as SessionData;

    // Update expiration
    const newExpiresAt = new Date(Date.now() + serverConfig.session.ttl * 1000);
    session.expiresAt = newExpiresAt.toISOString();
    session.lastActivityAt = new Date().toISOString();

    // Store with new TTL
    await redis.setex(sessionKey, serverConfig.session.ttl, JSON.stringify(session));

    // Update user sessions index TTL
    if (session.userId) {
      const userSessionsKey = getUserSessionsKey(session.userId);
      await redis.expire(userSessionsKey, serverConfig.session.ttl);
    }

    logger.debug({ sessionId }, 'Session extended');

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ sessionId, error: errorMessage }, 'Failed to extend session');
    return false;
  }
}

export async function destroySession(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  try {
    // Get session to find userId for index cleanup
    const existingData = await redis.get(sessionKey);

    if (existingData) {
      const session = JSON.parse(existingData) as SessionData;

      // Remove from user's session index
      if (session.userId) {
        const userSessionsKey = getUserSessionsKey(session.userId);
        await redis.srem(userSessionsKey, sessionId);
      }
    }

    // Delete session
    await redis.del(sessionKey);

    logger.debug({ sessionId }, 'Session destroyed');

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ sessionId, error: errorMessage }, 'Failed to destroy session');
    return false;
  }
}

export async function destroyAllUserSessions(userId: string): Promise<number> {
  const redis = getRedisClient();
  const userSessionsKey = getUserSessionsKey(userId);

  try {
    // Get all session IDs for user
    const sessionIds = await redis.smembers(userSessionsKey);

    if (sessionIds.length === 0) {
      return 0;
    }

    // Delete all sessions
    const sessionKeys = sessionIds.map((id: string) => getSessionKey(id));
    await redis.del(...sessionKeys);

    // Delete the user sessions index
    await redis.del(userSessionsKey);

    logger.debug({ userId, count: sessionIds.length }, 'All user sessions destroyed');

    return sessionIds.length;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ userId, error: errorMessage }, 'Failed to destroy all user sessions');
    return 0;
  }
}

export async function getUserSessions(userId: string): Promise<SessionData[]> {
  const redis = getRedisClient();
  const userSessionsKey = getUserSessionsKey(userId);

  try {
    const sessionIds = await redis.smembers(userSessionsKey);

    if (sessionIds.length === 0) {
      return [];
    }

    const sessions: SessionData[] = [];

    for (const sessionId of sessionIds) {
      const session = await getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ userId, error: errorMessage }, 'Failed to get user sessions');
    return [];
  }
}

export async function isSessionValid(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  return session !== null;
}

export async function cleanupExpiredSessions(): Promise<number> {
  // Note: Redis handles TTL-based expiration automatically
  // This function is for manual cleanup or additional logging
  logger.debug('Session cleanup triggered (Redis handles expiration automatically)');
  return 0;
}
