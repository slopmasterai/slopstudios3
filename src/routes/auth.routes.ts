/**
 * Auth Routes
 * Implements authentication endpoints with session cookie support
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */

import { serverConfig } from '../config/server.config.js';
import { validateSession, validateAuthOrSession } from '../middleware/session.middleware.js';
import {
  createSession,
  destroySession,
  destroyAllUserSessions,
} from '../services/session.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface LoginBody {
  userId: string;
  email?: string;
}

interface LoginResponse {
  sessionId: string;
  userId: string;
  expiresAt: string;
}

interface LogoutResponse {
  message: string;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/login - Create a new session
   * Sets session_id cookie for subsequent requests
   */
  app.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', minLength: 1 },
            email: { type: 'string', format: 'email' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { userId, email } = request.body;

      try {
        // Create session in Redis with request metadata
        const sessionId = await createSession(userId, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          data: { email },
        });

        // Calculate expiration time
        const expiresAt = new Date(Date.now() + serverConfig.session.ttl * 1000).toISOString();

        // Set session data via the @fastify/session plugin
        // The session is automatically persisted to Redis by @fastify/session
        request.session.userId = userId;
        request.session.sessionId = sessionId;
        if (email) {
          request.session.email = email;
        }

        logger.info({ userId, sessionId, ip: request.ip }, 'User logged in, session created');

        const response: ApiResponse<LoginResponse> = {
          success: true,
          data: {
            sessionId,
            userId,
            expiresAt,
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ userId, error: errorMessage }, 'Failed to create session');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'SESSION_CREATE_FAILED',
            message: 'Failed to create session',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /auth/logout - Destroy current session
   * Requires valid session via cookie or header
   */
  app.post(
    '/auth/logout',
    { preHandler: validateSession },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sessionId = request.session?.sessionId;

        if (sessionId) {
          // Destroy session in Redis
          await destroySession(sessionId);
        }

        // Destroy Fastify session (clears cookie)
        request.session.destroy();

        logger.info({ sessionId, userId: request.user?.id }, 'User logged out');

        const response: ApiResponse<LogoutResponse> = {
          success: true,
          data: {
            message: 'Successfully logged out',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to logout');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'LOGOUT_FAILED',
            message: 'Failed to logout',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /auth/logout-all - Destroy all sessions for the current user
   * Requires valid session via cookie or header
   */
  app.post(
    '/auth/logout-all',
    { preHandler: validateAuthOrSession },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.id;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(401).send(response);
      }

      try {
        // Destroy all sessions for this user
        const count = await destroyAllUserSessions(userId);

        // Destroy current Fastify session (clears cookie)
        request.session.destroy();

        logger.info({ userId, sessionsDestroyed: count }, 'All user sessions destroyed');

        const response: ApiResponse<{ sessionsDestroyed: number }> = {
          success: true,
          data: {
            sessionsDestroyed: count,
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ userId, error: errorMessage }, 'Failed to destroy all sessions');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'LOGOUT_ALL_FAILED',
            message: 'Failed to destroy all sessions',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /auth/session - Get current session info
   * Requires valid session via cookie or header
   */
  app.get(
    '/auth/session',
    { preHandler: validateAuthOrSession },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;

      const response: ApiResponse<{
        userId: string | undefined;
        email?: string;
        sessionId?: string;
      }> = {
        success: true,
        data: {
          userId: user?.id,
          email: user?.email,
          sessionId: request.session?.sessionId,
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      return reply.status(200).send(response);
    }
  );
}

export default registerAuthRoutes;
