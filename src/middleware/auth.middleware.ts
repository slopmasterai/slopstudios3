/**
 * Auth Middleware
 * JWT authentication middleware for protected routes
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type { AuthenticatedUser } from '../types/server.types.js';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

/**
 * Verifies JWT token and attaches user to request
 */
export async function verifyJWT(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // jwtVerify is added by @fastify/jwt plugin
    await request.jwtVerify();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.warn(
      {
        requestId: request.id,
        error: errorMessage,
        path: request.url,
      },
      'JWT verification failed'
    );

    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token',
      },
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    reply.status(401).send(response);
  }
}

/**
 * Optional JWT verification - doesn't fail if no token
 */
export async function optionalJWT(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      await request.jwtVerify();
    }
  } catch {
    // Ignore errors - authentication is optional
    // user property remains unset if authentication fails
  }
}

/**
 * Creates an authentication decorator for Fastify
 */
export function createAuthDecorator(app: FastifyInstance): void {
  // Note: @fastify/jwt already decorates request with 'user' property
  // We only need to add the preHandler hook for auto-authentication

  // Add authentication hook
  app.addHook('preHandler', async (request) => {
    // Skip if user already set (e.g., from session)
    if (request.user !== undefined && request.user !== null) {
      return;
    }

    // Try to extract user from JWT if present
    try {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const decoded = await request.jwtVerify<{
          userId: string;
          email?: string;
          roles?: string[];
        }>();

        request.user = {
          id: decoded.userId ?? (decoded as unknown as { sub?: string }).sub ?? '',
          email: decoded.email,
          roles: decoded.roles,
        };
      }
    } catch {
      // Token invalid or missing - that's okay for this hook
    }
  });
}

/**
 * Role-based access control middleware
 */
export function requireRoles(...requiredRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // First verify JWT
    await verifyJWT(request, reply);

    // If reply already sent (auth failed), return
    if (reply.sent) {
      return;
    }

    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
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
      return;
    }

    const userRoles = user.roles ?? [];
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      logger.warn(
        {
          requestId: request.id,
          userId: user.id,
          requiredRoles,
          userRoles,
          path: request.url,
        },
        'Insufficient permissions'
      );

      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      reply.status(403).send(response);
    }
  };
}

export default verifyJWT;
