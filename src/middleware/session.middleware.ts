/**
 * Session Middleware
 * Session validation middleware for protected routes
 * Works with @fastify/session plugin for cookie-based sessions
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { getSession, extendSession } from '../services/session.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Extracts session ID from request
 * Checks @fastify/session cookie first, then falls back to header for API clients
 */
function extractSessionId(request: FastifyRequest): string | null {
  // Try @fastify/session managed session first (automatically handled via session_id cookie)
  const fastifySessionId = request.session?.sessionId;
  if (fastifySessionId && typeof fastifySessionId === 'string') {
    return fastifySessionId;
  }

  // Fallback: Try X-Session-ID header for API clients
  const headerSessionId = request.headers['x-session-id'];
  if (typeof headerSessionId === 'string') {
    return headerSessionId;
  }

  return null;
}

/**
 * Validates session and attaches user data to request
 * Works with both cookie-based sessions (@fastify/session) and header-based sessions
 */
export async function validateSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Check if @fastify/session has a valid session with userId
  const fastifySessionUserId = request.session?.userId;
  if (fastifySessionUserId && typeof fastifySessionUserId === 'string') {
    // Valid session from @fastify/session cookie
    if (!request.user) {
      request.user = {
        id: fastifySessionUserId,
        email: request.session?.email,
      };
    }

    logger.debug(
      { requestId: request.id, userId: fastifySessionUserId },
      'Session validated via cookie'
    );
    return;
  }

  // Fallback: Try header-based session for API clients
  const sessionId = extractSessionId(request);

  if (!sessionId) {
    logger.debug({ requestId: request.id, path: request.url }, 'No session ID provided');

    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Session required',
      },
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    reply.status(401).send(response);
    return;
  }

  const session = await getSession(sessionId);

  if (!session) {
    logger.debug(
      { requestId: request.id, sessionId, path: request.url },
      'Invalid or expired session'
    );

    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'SESSION_EXPIRED',
        message: 'Session has expired or is invalid',
      },
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    reply.status(401).send(response);
    return;
  }

  // Set user from session
  if (!request.user && session.userId) {
    request.user = {
      id: session.userId,
    };
  }

  // Extend session TTL on activity
  await extendSession(sessionId);

  logger.debug(
    { requestId: request.id, sessionId, userId: session.userId },
    'Session validated via header'
  );
}

/**
 * Optional session validation - doesn't fail if no session
 * Attempts to populate user info from session if available
 */
export async function optionalSession(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Check @fastify/session first
  const fastifySessionUserId = request.session?.userId;
  if (fastifySessionUserId && typeof fastifySessionUserId === 'string') {
    if (!request.user) {
      request.user = {
        id: fastifySessionUserId,
        email: request.session?.email,
      };
    }
    return;
  }

  // Fallback: Try header-based session
  const sessionId = extractSessionId(request);

  if (!sessionId) {
    return;
  }

  const session = await getSession(sessionId);

  if (session) {
    if (!request.user && session.userId) {
      request.user = {
        id: session.userId,
      };
    }

    // Extend session TTL on activity
    await extendSession(sessionId);
  }
}

/**
 * Validates either JWT or session (allows both auth methods)
 * Useful for routes that accept both token-based and session-based auth
 */
export async function validateAuthOrSession(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Try JWT first
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      await request.jwtVerify();
      return;
    } catch {
      // JWT invalid, try session
    }
  }

  // Try @fastify/session cookie
  const fastifySessionUserId = request.session?.userId;
  if (fastifySessionUserId && typeof fastifySessionUserId === 'string') {
    if (!request.user) {
      request.user = {
        id: fastifySessionUserId,
        email: request.session?.email,
      };
    }
    return;
  }

  // Fallback: Try header-based session for API clients
  const sessionId = extractSessionId(request);
  if (sessionId) {
    const session = await getSession(sessionId);
    if (session) {
      if (!request.user && session.userId) {
        request.user = { id: session.userId };
      }
      await extendSession(sessionId);
      return;
    }
  }

  // Neither auth method worked
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    },
    meta: {
      timestamp: timestamp(),
      requestId: request.id || generateRequestId(),
    },
  };

  reply.status(401).send(response);
}

export default validateSession;
