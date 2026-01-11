/**
 * Claude Integration Tests
 * End-to-end tests for Claude HTTP endpoints and WebSocket events
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/order */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Mock the services before importing anything else
jest.mock('../../src/services/claude.service.js', () => ({
  initializeClaudeService: jest.fn(),
  executeClaudeCommand: jest.fn(),
  enqueueClaudeCommand: jest.fn(),
  cancelClaudeProcess: jest.fn(),
  getClaudeProcessStatus: jest.fn(),
  getClaudeServiceHealth: jest.fn(),
  stopQueueWorker: jest.fn(),
  subscribeToStream: jest.fn(() => jest.fn()),
  streamClaudeResponse: jest.fn(),
}));

jest.mock('../../src/services/process-manager.service.js', () => ({
  getProcessState: jest.fn(),
  listActiveProcesses: jest.fn(() => Promise.resolve([])),
  terminateAllProcesses: jest.fn(() => Promise.resolve(0)),
  waitForProcesses: jest.fn(() => Promise.resolve(true)),
  cleanupZombieProcesses: jest.fn(() => Promise.resolve(0)),
  listUserProcesses: jest.fn().mockResolvedValue({
    processes: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  }),
}));

jest.mock('../../src/services/claude-metrics.service.js', () => ({
  initializeMetricsService: jest.fn(),
  shutdownMetricsService: jest.fn(() => Promise.resolve()),
}));

// Mock auth middleware to bypass JWT verification
jest.mock('../../src/middleware/auth.middleware.js', () => ({
  verifyJWT: jest.fn(
    (
      request: { user: unknown; headers: { authorization?: string } },
      _reply: unknown,
      done: () => void
    ) => {
      // If authorization header exists, set user
      if (request.headers.authorization?.startsWith('Bearer ')) {
        request.user = { id: 'test-user-id', email: 'test@example.com' };
      }
      done();
    }
  ),
}));

// Mock rate limit middleware
jest.mock('../../src/middleware/rate-limit.middleware.js', () => ({
  createRateLimiter: jest.fn(() => (_request: unknown, _reply: unknown, done: () => void) => {
    done();
  }),
}));

// Mock Redis
jest.mock('../../src/services/redis.service.js', () => {
  const createMockMulti = () => ({
    zremrangebyscore: jest.fn().mockReturnThis(),
    zcard: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    pexpire: jest.fn().mockReturnThis(),
    lpush: jest.fn().mockReturnThis(),
    ltrim: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([
      [null, 0], // zremrangebyscore result
      [null, 0], // zcard result (0 requests in window = under limit)
      [null, 1], // zadd result
      [null, 1], // pexpire result
    ]),
  });

  return {
    createRedisClient: jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    })),
    connectRedis: jest.fn().mockResolvedValue(undefined),
    disconnectRedis: jest.fn().mockResolvedValue(undefined),
    getRedisClient: jest.fn(() => ({
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      scard: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      multi: jest.fn(() => createMockMulti()),
    })),
    isRedisConnected: jest.fn(() => true),
    healthCheck: jest.fn().mockResolvedValue({ healthy: true, latency: 1 }),
  };
});

// Mock session service
jest.mock('../../src/services/session.service.js', () => ({
  createSession: jest.fn().mockResolvedValue('test-session-id'),
  getSession: jest.fn().mockResolvedValue({
    id: 'test-session-id',
    userId: 'test-user-id',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    lastActivityAt: new Date().toISOString(),
    data: {},
  }),
  destroySession: jest.fn().mockResolvedValue(true),
  destroyAllUserSessions: jest.fn().mockResolvedValue(1),
  extendSession: jest.fn().mockResolvedValue(true),
  isSessionValid: jest.fn().mockResolvedValue(true),
}));

import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';

import {
  executeClaudeCommand,
  enqueueClaudeCommand,
  cancelClaudeProcess,
  getClaudeProcessStatus,
  getClaudeServiceHealth,
} from '../../src/services/claude.service.js';
import {
  getProcessState,
  listActiveProcesses,
} from '../../src/services/process-manager.service.js';

describe('Claude Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    // Create a minimal Fastify app for testing
    app = Fastify({ logger: false });

    // Register JWT plugin (needed for route registration)
    await app.register(fastifyJwt, {
      secret: 'test-secret-key',
    });

    // Decorate request with user property (if not already decorated)
    if (!app.hasRequestDecorator('user')) {
      app.decorateRequest('user', null);
    }

    // Import and register routes (auth and rate limit are mocked)
    const { registerClaudeRoutes } = await import('../../src/routes/claude.routes.js');
    registerClaudeRoutes(app);

    await app.ready();

    // Generate a simple auth token (the mocked verifyJWT doesn't validate it)
    authToken = 'test-token';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/claude/execute', () => {
    it('should execute Claude command successfully', async () => {
      const mockResult = {
        id: 'claude_test123',
        userId: 'test-user-id',
        status: 'completed',
        stdout: 'Hello from Claude!',
        stderr: '',
        exitCode: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1000,
      };

      (executeClaudeCommand as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('completed');
      expect(body.data.stdout).toBe('Hello from Claude!');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute',
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with invalid payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          // Missing required 'prompt' field
          systemPrompt: 'You are a helpful assistant',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 202 when request is queued', async () => {
      const mockResult = {
        id: 'claude_queued123',
        userId: 'test-user-id',
        status: 'queued',
        stdout: '',
        stderr: '',
        exitCode: null,
        startedAt: '',
        completedAt: '',
        durationMs: 0,
      };

      (executeClaudeCommand as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe('queued');
    });
  });

  describe('POST /api/v1/claude/execute/async', () => {
    it('should return 202 with process ID (fire-and-forget)', async () => {
      (enqueueClaudeCommand as jest.Mock).mockResolvedValue({
        processId: 'claude_async123',
        status: 'pending',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.processId).toBeDefined();
      expect(body.data.status).toBe('pending');
    });

    it('should return 202 with queue position when request is queued', async () => {
      (enqueueClaudeCommand as jest.Mock).mockResolvedValue({
        processId: 'claude_queued123',
        status: 'queued',
        queuePosition: 3,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('queued');
      expect(body.data.queuePosition).toBe(3);
    });

    it('should return 429 when rate limit exceeded', async () => {
      (enqueueClaudeCommand as jest.Mock).mockResolvedValue({
        processId: 'claude_ratelimit123',
        status: 'queued',
        error: 'Rate limit exceeded. Try again later.',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should return 503 when CLI is not available', async () => {
      (enqueueClaudeCommand as jest.Mock).mockResolvedValue({
        processId: 'claude_unavailable123',
        status: 'queued',
        error: 'Claude CLI not available and no API fallback configured',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should return 500 for other execution failures', async () => {
      (enqueueClaudeCommand as jest.Mock).mockResolvedValue({
        processId: 'claude_error123',
        status: 'queued',
        error: 'Unknown execution error',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EXECUTION_FAILED');
    });

    it('should return 500 when enqueueClaudeCommand throws', async () => {
      (enqueueClaudeCommand as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/claude/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'Hello, Claude!',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('EXECUTION_FAILED');
      expect(body.error.message).toBe('Unexpected error');
    });
  });

  describe('GET /api/v1/claude/processes/:id', () => {
    it('should return process status', async () => {
      (getClaudeProcessStatus as jest.Mock).mockResolvedValue({
        status: 'running',
        queuePosition: undefined,
        result: undefined,
      });

      (getProcessState as jest.Mock).mockResolvedValue({
        config: { id: 'test-process', userId: 'test-user-id', prompt: 'test' },
        status: 'running',
        createdAt: new Date().toISOString(),
        stdout: '',
        stderr: '',
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claude/processes/test-process',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('running');
    });

    it('should return 404 for non-existent process', async () => {
      (getClaudeProcessStatus as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claude/processes/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/claude/processes/:id', () => {
    it('should cancel a running process', async () => {
      (getClaudeProcessStatus as jest.Mock).mockResolvedValue({
        status: 'running',
      });

      (cancelClaudeProcess as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/claude/processes/test-process',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 400 for already completed process', async () => {
      (getClaudeProcessStatus as jest.Mock).mockResolvedValue({
        status: 'completed',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/claude/processes/completed-process',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent process', async () => {
      (getClaudeProcessStatus as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/claude/processes/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/claude/processes', () => {
    it('should list user processes', async () => {
      (listActiveProcesses as jest.Mock).mockResolvedValue(['process-1', 'process-2']);

      (getProcessState as jest.Mock).mockImplementation(async (id: string) => ({
        config: { id, userId: 'test-user-id', prompt: 'test' },
        status: 'running',
        createdAt: new Date().toISOString(),
        stdout: '',
        stderr: '',
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      }));

      (getClaudeProcessStatus as jest.Mock).mockResolvedValue({
        status: 'running',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claude/processes',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.processes)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claude/processes?page=1&pageSize=20',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.pagination).toBeDefined();
      expect(body.data.pagination.page).toBe(1);
      expect(body.data.pagination.pageSize).toBe(20);
    });
  });

  describe('GET /api/v1/claude/health', () => {
    it('should return healthy status when service is available', async () => {
      (getClaudeServiceHealth as jest.Mock).mockResolvedValue({
        healthy: true,
        cli: { installed: true, path: '/usr/local/bin/claude', version: '1.0.0' },
        apiFallbackAvailable: true,
        activeProcesses: 2,
        queueSize: 0,
        maxConcurrentProcesses: 5,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claude/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.healthy).toBe(true);
      expect(body.data.cli.installed).toBe(true);
    });

    it('should return 503 when service is unavailable', async () => {
      (getClaudeServiceHealth as jest.Mock).mockResolvedValue({
        healthy: false,
        cli: { installed: false, error: 'Claude CLI not found' },
        apiFallbackAvailable: false,
        activeProcesses: 0,
        queueSize: 0,
        maxConcurrentProcesses: 5,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claude/health',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.data.healthy).toBe(false);
    });

    it('should not require authentication', async () => {
      (getClaudeServiceHealth as jest.Mock).mockResolvedValue({
        healthy: true,
        cli: { installed: true },
        apiFallbackAvailable: true,
        activeProcesses: 0,
        queueSize: 0,
        maxConcurrentProcesses: 5,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/claude/health',
        // No authorization header
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
