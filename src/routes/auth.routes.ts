/**
 * Auth Routes
 * Implements JWT-based authentication endpoints
 */

import { Type, type Static } from '@sinclair/typebox';
import * as bcrypt from 'bcrypt';
import { serverConfig } from '../config/server.config.js';
import { getRedisClient, isRedisConnected } from '../services/redis.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Schema definitions
const RegisterSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 6, maxLength: 100 }),
});

type RegisterBody = Static<typeof RegisterSchema>;

const LoginSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
});

type LoginBody = Static<typeof LoginSchema>;

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'user' | 'admin';
    createdAt: string;
    updatedAt: string;
  };
  token: string;
  expiresIn: number;
}

// Helper to get user from Redis
async function getUserByEmail(email: string): Promise<User | null> {
  if (!isRedisConnected()) return null;
  const redis = getRedisClient();
  const userData = await redis.get(`user:email:${email.toLowerCase()}`);
  if (!userData) return null;
  return JSON.parse(userData) as User;
}

async function getUserById(id: string): Promise<User | null> {
  if (!isRedisConnected()) return null;
  const redis = getRedisClient();
  const userData = await redis.get(`user:${id}`);
  if (!userData) return null;
  return JSON.parse(userData) as User;
}

async function createUser(name: string, email: string, password: string): Promise<User> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const now = new Date().toISOString();
  const user: User = {
    id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name,
    email: normalizedEmail,
    passwordHash,
    role: 'user',
    createdAt: now,
    updatedAt: now,
  };

  // Store user by ID and email
  await redis.set(`user:${user.id}`, JSON.stringify(user));
  await redis.set(`user:email:${normalizedEmail}`, JSON.stringify(user));

  logger.info({ userId: user.id, email: user.email }, 'User created');

  return user;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/auth/register - Register a new user
   */
  app.post<{ Body: RegisterBody }>(
    '/api/v1/auth/register',
    {
      schema: { body: RegisterSchema },
    },
    async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
      const { name, email, password } = request.body;

      try {
        const user = await createUser(name, email, password);

        // Generate JWT token
        const token = app.jwt.sign(
          { id: user.id, email: user.email, name: user.name, role: user.role },
          { expiresIn: serverConfig.jwt.expiresIn }
        );

        const expiresIn = typeof serverConfig.jwt.expiresIn === 'string'
          ? parseInt(serverConfig.jwt.expiresIn) || 86400
          : serverConfig.jwt.expiresIn;

        const response: ApiResponse<AuthResponse> = {
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
            token,
            expiresIn,
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(201).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ email, error: errorMessage }, 'Failed to register user');

        const statusCode = errorMessage.includes('already exists') ? 409 : 500;
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: statusCode === 409 ? 'USER_EXISTS' : 'REGISTRATION_FAILED',
            message: errorMessage,
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(statusCode).send(response);
      }
    }
  );

  /**
   * POST /api/v1/auth/login - Login with email and password
   */
  app.post<{ Body: LoginBody }>(
    '/api/v1/auth/login',
    {
      schema: { body: LoginSchema },
    },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      try {
        const user = await getUserByEmail(email);

        if (!user) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id || generateRequestId(),
            },
          };
          return reply.status(401).send(response);
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id || generateRequestId(),
            },
          };
          return reply.status(401).send(response);
        }

        // Generate JWT token
        const token = app.jwt.sign(
          { id: user.id, email: user.email, name: user.name, role: user.role },
          { expiresIn: serverConfig.jwt.expiresIn }
        );

        const expiresIn = typeof serverConfig.jwt.expiresIn === 'string'
          ? parseInt(serverConfig.jwt.expiresIn) || 86400
          : serverConfig.jwt.expiresIn;

        logger.info({ userId: user.id, email: user.email }, 'User logged in');

        const response: ApiResponse<AuthResponse> = {
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
            token,
            expiresIn,
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };

        return reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ email, error: errorMessage }, 'Failed to login');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'LOGIN_FAILED',
            message: 'Login failed',
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
   * POST /api/v1/auth/logout - Logout (client-side token invalidation)
   */
  app.post(
    '/api/v1/auth/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // JWT tokens are stateless - logout is handled client-side
      // We just acknowledge the request
      const response: ApiResponse<{ message: string }> = {
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
    }
  );

  /**
   * GET /api/v1/auth/me - Get current user info
   */
  app.get(
    '/api/v1/auth/me',
    {
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          await request.jwtVerify();
        } catch {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid or expired token',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id || generateRequestId(),
            },
          };
          return reply.status(401).send(response);
        }
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tokenUser = request.user as { id: string; email: string; name: string; role: string };

      const user = await getUserById(tokenUser.id);
      if (!user) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id || generateRequestId(),
          },
        };
        return reply.status(404).send(response);
      }

      const response: ApiResponse<{
        id: string;
        email: string;
        name: string;
        role: string;
        createdAt: string;
        updatedAt: string;
      }> = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      return reply.status(200).send(response);
    }
  );

  /**
   * POST /api/v1/auth/refresh - Refresh JWT token
   */
  app.post(
    '/api/v1/auth/refresh',
    {
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          await request.jwtVerify();
        } catch {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid or expired token',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id || generateRequestId(),
            },
          };
          return reply.status(401).send(response);
        }
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tokenUser = request.user as { id: string; email: string; name: string; role: string };

      // Generate new token
      const token = app.jwt.sign(
        { id: tokenUser.id, email: tokenUser.email, name: tokenUser.name, role: tokenUser.role },
        { expiresIn: serverConfig.jwt.expiresIn }
      );

      const expiresIn = typeof serverConfig.jwt.expiresIn === 'string'
        ? parseInt(serverConfig.jwt.expiresIn) || 86400
        : serverConfig.jwt.expiresIn;

      const response: ApiResponse<{ token: string; expiresIn: number }> = {
        success: true,
        data: {
          token,
          expiresIn,
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      return reply.status(200).send(response);
    }
  );

  logger.info('Auth routes registered');
}

export default registerAuthRoutes;
