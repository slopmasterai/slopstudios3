/**
 * Strudel Integration Tests
 * End-to-end tests for Strudel HTTP endpoints
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/order */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Mock the services before importing anything else
jest.mock('../../src/services/strudel.service.js', () => ({
  initializeStrudelService: jest.fn(),
  shutdownStrudelService: jest.fn(),
  validateStrudelPattern: jest.fn(),
  executeStrudelPattern: jest.fn(),
  enqueueStrudelPattern: jest.fn(),
  cancelStrudelProcess: jest.fn(),
  getStrudelProcessStatus: jest.fn(),
  getStrudelProcessState: jest.fn(),
  getStrudelServiceHealth: jest.fn(),
  listUserStrudelProcesses: jest.fn(),
  stopQueueWorker: jest.fn(),
}));

jest.mock('../../src/services/strudel-metrics.service.js', () => ({
  initializeStrudelMetricsService: jest.fn(),
  shutdownStrudelMetricsService: jest.fn(() => Promise.resolve()),
  getServiceMetrics: jest.fn(),
  getRecentMetrics: jest.fn(),
}));

// Mock auth middleware to simulate JWT verification
jest.mock('../../src/middleware/auth.middleware.js', () => ({
  verifyJWT: jest.fn(
    async (
      request: { user: unknown; headers: { authorization?: string } },
      reply: { status: (code: number) => { send: (data: unknown) => void }; sent: boolean }
    ) => {
      // If authorization header exists, set user
      if (request.headers.authorization?.startsWith('Bearer ')) {
        request.user = { id: 'test-user-id', email: 'test@example.com' };
      } else {
        // Return 401 if no auth header
        reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired authentication token',
          },
        });
      }
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
  const mockRedis = {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
    zcard: jest.fn().mockResolvedValue(0),
    zrange: jest.fn().mockResolvedValue([]),
    zpopmin: jest.fn().mockResolvedValue([]),
    zrem: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
  };

  return {
    createRedisClient: jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    })),
    connectRedis: jest.fn().mockResolvedValue(undefined),
    disconnectRedis: jest.fn().mockResolvedValue(undefined),
    getRedisClient: jest.fn(() => mockRedis),
    isRedisConnected: jest.fn(() => true),
    healthCheck: jest.fn().mockResolvedValue({ healthy: true, latency: 1 }),
  };
});

import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';

import {
  validateStrudelPattern,
  executeStrudelPattern,
  enqueueStrudelPattern,
  cancelStrudelProcess,
  getStrudelProcessStatus,
  getStrudelProcessState,
  getStrudelServiceHealth,
  listUserStrudelProcesses,
} from '../../src/services/strudel.service.js';
import { getServiceMetrics, getRecentMetrics } from '../../src/services/strudel-metrics.service.js';

import {
  validPatterns,
  invalidPatterns,
  mockValidationResults,
  createMockProcessResult,
  createMockRedisState,
} from '../helpers/strudel-fixtures.js';

describe('Strudel Integration Tests', () => {
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
    const { registerStrudelRoutes } = await import('../../src/routes/strudel.routes.js');
    registerStrudelRoutes(app);

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

  describe('POST /api/v1/strudel/validate', () => {
    it('should validate a valid pattern', async () => {
      (validateStrudelPattern as jest.Mock).mockResolvedValue(mockValidationResults.valid);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/validate',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          code: validPatterns.simple.code,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.isValid).toBe(true);
      expect(body.data.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid pattern', async () => {
      (validateStrudelPattern as jest.Mock).mockResolvedValue(mockValidationResults.invalid);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/validate',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          code: invalidPatterns.syntaxError.code,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.data.isValid).toBe(false);
      expect(body.data.errors.length).toBeGreaterThan(0);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/validate',
        payload: {
          code: validPatterns.simple.code,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with missing code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/validate',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/strudel/execute', () => {
    it('should execute a valid pattern successfully', async () => {
      const mockResult = createMockProcessResult('complete');
      (executeStrudelPattern as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          code: validPatterns.simple.code,
          options: { duration: 5 },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('complete');
      expect(body.data.audioMetadata).toBeDefined();
    });

    it('should return 200 for failed execution', async () => {
      const mockResult = createMockProcessResult('failed');
      (executeStrudelPattern as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          code: invalidPatterns.syntaxError.code,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should return 202 when request is queued', async () => {
      const mockResult = createMockProcessResult('queued');
      (executeStrudelPattern as jest.Mock).mockResolvedValue(mockResult);
      (getStrudelProcessState as jest.Mock).mockResolvedValue(
        createMockRedisState('queued', { queuePosition: 3 })
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          code: validPatterns.simple.code,
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe('queued');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/execute',
        payload: {
          code: validPatterns.simple.code,
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 with missing code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          options: { duration: 5 },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/strudel/execute/async', () => {
    it('should return 202 with process ID', async () => {
      const mockResult = createMockProcessResult('queued');
      (enqueueStrudelPattern as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          code: validPatterns.simple.code,
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.processId).toBeDefined();
    });

    it('should return 429 when rate limit exceeded', async () => {
      const mockResult = createMockProcessResult('failed', {
        error: { code: 'RATE_LIMIT', message: 'Rate limit exceeded' },
      });
      (enqueueStrudelPattern as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/strudel/execute/async',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          code: validPatterns.simple.code,
        },
      });

      expect(response.statusCode).toBe(429);
    });
  });

  describe('GET /api/v1/strudel/processes/:id', () => {
    it('should return process status', async () => {
      (getStrudelProcessStatus as jest.Mock).mockResolvedValue({
        status: 'rendering',
        progress: 50,
      });
      (getStrudelProcessState as jest.Mock).mockResolvedValue(
        createMockRedisState('rendering', {
          processId: 'test-process',
          userId: 'test-user-id',
          progress: 50,
        })
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/processes/test-process',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('rendering');
      expect(body.data.progress).toBe(50);
    });

    it('should return 404 for non-existent process', async () => {
      (getStrudelProcessStatus as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/processes/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for another user process', async () => {
      (getStrudelProcessStatus as jest.Mock).mockResolvedValue({
        status: 'rendering',
        progress: 50,
      });
      (getStrudelProcessState as jest.Mock).mockResolvedValue(
        createMockRedisState('rendering', {
          processId: 'test-process',
          userId: 'other-user-id',
        })
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/processes/test-process',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/v1/strudel/processes/:id', () => {
    it('should cancel a running process', async () => {
      (getStrudelProcessStatus as jest.Mock).mockResolvedValue({
        status: 'rendering',
      });
      (getStrudelProcessState as jest.Mock).mockResolvedValue(
        createMockRedisState('rendering', {
          processId: 'test-process',
          userId: 'test-user-id',
        })
      );
      (cancelStrudelProcess as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/strudel/processes/test-process',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 400 for already completed process', async () => {
      (getStrudelProcessStatus as jest.Mock).mockResolvedValue({
        status: 'complete',
      });
      (getStrudelProcessState as jest.Mock).mockResolvedValue(
        createMockRedisState('complete', {
          processId: 'completed-process',
          userId: 'test-user-id',
        })
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/strudel/processes/completed-process',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent process', async () => {
      (getStrudelProcessStatus as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/strudel/processes/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/strudel/processes', () => {
    it('should list user processes', async () => {
      (listUserStrudelProcesses as jest.Mock).mockResolvedValue({
        processes: [createMockRedisState('complete')],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/processes',
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
      (listUserStrudelProcesses as jest.Mock).mockResolvedValue({
        processes: [],
        total: 0,
        page: 2,
        pageSize: 10,
        totalPages: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/processes?page=2&pageSize=10',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.pagination.page).toBe(2);
      expect(body.data.pagination.pageSize).toBe(10);
    });

    it('should filter by status', async () => {
      (listUserStrudelProcesses as jest.Mock).mockResolvedValue({
        processes: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/processes?status=complete',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(listUserStrudelProcesses).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ status: 'complete' })
      );
    });
  });

  describe('GET /api/v1/strudel/metrics', () => {
    it('should return service metrics', async () => {
      (getServiceMetrics as jest.Mock).mockResolvedValue({
        periodSeconds: 3600,
        validation: { total: 100, successful: 90, failed: 10, averageTimeMs: 25 },
        render: {
          total: 50,
          successful: 45,
          failed: 5,
          cancelled: 0,
          averageTimeMs: 5000,
          averageDurationSeconds: 10,
          totalAudioSeconds: 450,
        },
        queue: { currentDepth: 2, peakDepth: 10, averageWaitTimeMs: 500, rejected: 0 },
        errors: { validationErrors: 10, renderErrors: 5, timeoutErrors: 0, systemErrors: 0 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.validation).toBeDefined();
      expect(body.data.render).toBeDefined();
    });

    it('should include recent metrics when requested', async () => {
      (getServiceMetrics as jest.Mock).mockResolvedValue({
        periodSeconds: 3600,
        validation: { total: 0, successful: 0, failed: 0, averageTimeMs: 0 },
        render: {
          total: 0,
          successful: 0,
          failed: 0,
          cancelled: 0,
          averageTimeMs: 0,
          averageDurationSeconds: 0,
          totalAudioSeconds: 0,
        },
        queue: { currentDepth: 0, peakDepth: 0, averageWaitTimeMs: 0, rejected: 0 },
        errors: { validationErrors: 0, renderErrors: 0, timeoutErrors: 0, systemErrors: 0 },
      });
      (getRecentMetrics as jest.Mock).mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/metrics?includeRecent=true',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.recentMetrics).toBeDefined();
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/metrics',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/strudel/health', () => {
    it('should return healthy status', async () => {
      (getStrudelServiceHealth as jest.Mock).mockResolvedValue({
        status: 'healthy',
        version: '1.0.0',
        transpiler: { available: true, version: '1.0.0' },
        audioRenderer: { available: true },
        processes: { active: 2, queued: 1, maxConcurrent: 5 },
        uptimeSeconds: 3600,
        lastCheck: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('healthy');
    });

    it('should return 200 for degraded status', async () => {
      (getStrudelServiceHealth as jest.Mock).mockResolvedValue({
        status: 'degraded',
        version: '1.0.0',
        transpiler: { available: false },
        audioRenderer: { available: true },
        processes: { active: 0, queued: 0, maxConcurrent: 5 },
        uptimeSeconds: 3600,
        lastCheck: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe('degraded');
    });

    it('should return 503 for unhealthy status', async () => {
      (getStrudelServiceHealth as jest.Mock).mockResolvedValue({
        status: 'unhealthy',
        version: '1.0.0',
        transpiler: { available: false },
        audioRenderer: { available: false },
        processes: { active: 0, queued: 0, maxConcurrent: 5 },
        uptimeSeconds: 0,
        lastCheck: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/health',
      });

      expect(response.statusCode).toBe(503);
    });

    it('should not require authentication', async () => {
      (getStrudelServiceHealth as jest.Mock).mockResolvedValue({
        status: 'healthy',
        version: '1.0.0',
        transpiler: { available: true },
        audioRenderer: { available: true },
        processes: { active: 0, queued: 0, maxConcurrent: 5 },
        uptimeSeconds: 3600,
        lastCheck: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/strudel/health',
        // No authorization header
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
