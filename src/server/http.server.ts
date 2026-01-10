/**
 * HTTP Server Module
 * Initializes Fastify instance with plugins and middleware
 */

import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySession from '@fastify/session';
import { RedisStore } from 'connect-redis';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';

import { serverConfig } from '../config/server.config.js';
import { getRedisClient } from '../services/redis.service.js';
import { generateRequestId, timestamp } from '../utils/index.js';
import { getFastifyLoggerOptions } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';

let fastifyInstance: FastifyInstance | null = null;

export async function createHttpServer(): Promise<FastifyInstance> {
  if (fastifyInstance) {
    return fastifyInstance;
  }

  const app = Fastify({
    logger: getFastifyLoggerOptions(),
    genReqId: () => generateRequestId(),
    bodyLimit: 1048576, // 1MB
    connectionTimeout: 30000, // 30 seconds
    requestTimeout: 30000, // 30 seconds
    trustProxy: true,
  });

  // Register plugins in order
  await registerPlugins(app);

  // Register error handler
  app.setErrorHandler(errorHandler);

  // Register not found handler
  app.setNotFoundHandler(notFoundHandler);

  fastifyInstance = app;
  return app;
}

async function registerPlugins(app: FastifyInstance): Promise<void> {
  // 1. Security headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // 2. CORS
  await app.register(fastifyCors, {
    origin: serverConfig.cors.origin,
    credentials: serverConfig.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  });

  // 3. Cookie parsing
  await app.register(fastifyCookie, {
    secret: serverConfig.session.secret,
    hook: 'onRequest',
    parseOptions: {
      httpOnly: true,
      secure: serverConfig.env === 'production',
      sameSite: 'strict',
    },
  });

  // 4. Session management with Redis store
  const redisStore = new RedisStore({
    client: getRedisClient(),
    prefix: 'session:',
  });

  await app.register(fastifySession, {
    secret: serverConfig.session.secret,
    cookieName: 'session_id',
    cookie: {
      secure: serverConfig.env === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: serverConfig.session.ttl * 1000, // Convert seconds to milliseconds
    },
    store: redisStore,
    saveUninitialized: false,
  });

  // 5. JWT authentication
  await app.register(fastifyJwt, {
    secret: serverConfig.jwt.secret,
    sign: {
      expiresIn: serverConfig.jwt.expiresIn,
    },
    cookie: {
      cookieName: 'token',
      signed: true,
    },
  });

  // 6. Rate limiting with Redis store
  await app.register(fastifyRateLimit, {
    max: serverConfig.rateLimit.maxRequests,
    timeWindow: serverConfig.rateLimit.windowMs,
    redis: getRedisClient(),
    keyGenerator: (request: FastifyRequest) => {
      // Use user ID if authenticated, otherwise use IP
      const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id;
      return userId || request.ip;
    },
    errorResponseBuilder: (_request: FastifyRequest, context) => {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        },
        meta: {
          timestamp: timestamp(),
          requestId: (_request as FastifyRequest & { id: string }).id || generateRequestId(),
        },
      };
      return response;
    },
  });

  // Add request ID to response headers
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-ID', request.id);
  });
}

function errorHandler(
  error: Error & { statusCode?: number; code?: string; validation?: unknown[] },
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const statusCode = error.statusCode || 500;
  const isProduction = serverConfig.env === 'production';

  // Log error with context
  request.log.error({
    err: error,
    requestId: request.id,
    method: request.method,
    url: request.url,
  });

  // Determine error code and message
  let errorCode = 'INTERNAL_ERROR';
  let errorMessage = 'An internal server error occurred';

  if (error.validation) {
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Request validation failed';
  } else if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Authorization header is required';
  } else if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Invalid authorization token';
  } else if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    errorCode = 'TOKEN_EXPIRED';
    errorMessage = 'Authorization token has expired';
  } else if (statusCode === 404) {
    errorCode = 'NOT_FOUND';
    errorMessage = 'Resource not found';
  } else if (statusCode < 500 && error.message) {
    errorMessage = error.message;
    errorCode = error.code || 'CLIENT_ERROR';
  }

  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: errorCode,
      message: isProduction && statusCode >= 500 ? 'An internal server error occurred' : errorMessage,
    },
    meta: {
      timestamp: timestamp(),
      requestId: request.id,
    },
  };

  reply.status(statusCode).send(response);
}

function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  const response: ApiResponse<null> = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    },
    meta: {
      timestamp: timestamp(),
      requestId: request.id,
    },
  };

  reply.status(404).send(response);
}

export async function startHttpServer(): Promise<void> {
  if (!fastifyInstance) {
    throw new Error('HTTP server not initialized. Call createHttpServer() first.');
  }

  try {
    await fastifyInstance.listen({
      port: serverConfig.port,
      host: serverConfig.host,
    });
    fastifyInstance.log.info(`HTTP server listening on ${serverConfig.host}:${serverConfig.port}`);
  } catch (error) {
    fastifyInstance.log.error(error, 'Failed to start HTTP server');
    throw error;
  }
}

export async function stopHttpServer(): Promise<void> {
  if (!fastifyInstance) {
    return;
  }

  try {
    await fastifyInstance.close();
    fastifyInstance = null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to stop HTTP server: ${errorMessage}`);
  }
}

export function getHttpServer(): FastifyInstance {
  if (!fastifyInstance) {
    throw new Error('HTTP server not initialized. Call createHttpServer() first.');
  }
  return fastifyInstance;
}

export { fastifyInstance };
