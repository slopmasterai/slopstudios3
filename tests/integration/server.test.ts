/**
 * HTTP Server Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

// Create mock Redis instance
const mockRedisInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(86400),
  sadd: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
  srem: jest.fn().mockResolvedValue(1),
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zcard: jest.fn().mockResolvedValue(0),
  zadd: jest.fn().mockResolvedValue(1),
  pexpire: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  multi: jest.fn().mockReturnValue({
    zremrangebyscore: jest.fn().mockReturnThis(),
    zcard: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    pexpire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([
      [null, 0],
      [null, 0],
      [null, 1],
      [null, 1],
    ]),
  }),
  defineCommand: jest.fn(),
  rateLimit: jest.fn().mockResolvedValue([1, 60000]),
  on: jest.fn(),
  status: 'ready',
};

// Mock ioredis - must use named export
jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => mockRedisInstance),
  };
});

// Mock redis service directly for more reliable testing
jest.mock('../../src/services/redis.service.js', () => ({
  createRedisClient: jest.fn(() => mockRedisInstance),
  connectRedis: jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn(() => mockRedisInstance),
  isRedisConnected: jest.fn(() => true),
  healthCheck: jest.fn().mockResolvedValue({ healthy: true, latency: 1 }),
}));

// Mock @fastify/rate-limit to use local store instead of Redis
jest.mock('@fastify/rate-limit', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(async (fastify) => {
      // Use a simple in-memory rate limiter for tests
      fastify.addHook('onRequest', async () => {
        // No-op rate limiter for tests
      });
    }),
  };
});

// Mock connect-redis to avoid Redis store issues
jest.mock('connect-redis', () => {
  return {
    RedisStore: jest.fn().mockImplementation(() => ({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      touch: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// Set environment variables before imports
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3999'; // Use a valid test port
process.env['HOST'] = '127.0.0.1';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-key-that-is-long-enough-32chars';
process.env['APP_SECRET'] = 'test-app-secret-key-that-is-long-enough-32chars';

describe('HTTP Server', () => {
  let app: Awaited<
    ReturnType<(typeof import('../../src/server/http.server.js'))['createHttpServer']>
  >;

  beforeAll(async () => {
    // Import after mocks are set up
    const { createHttpServer } = await import('../../src/server/http.server.js');
    const { registerHealthRoutes } = await import('../../src/routes/health.routes.js');

    app = await createHttpServer();
    await registerHealthRoutes(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Endpoints', () => {
    it('GET /health should return 200 OK', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('healthy');
      expect(body.data.version).toBeDefined();
      expect(body.data.uptime).toBeGreaterThanOrEqual(0);
      expect(body.meta.timestamp).toBeDefined();
      expect(body.meta.requestId).toBeDefined();
    });

    it('GET /health/live should return 200 OK', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('alive');
      expect(body.data.timestamp).toBeDefined();
    });

    it('GET /health/ready should return 200 with dependency status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.dependencies).toBeDefined();
      expect(body.data.dependencies.redis).toBeDefined();
      expect(body.data.dependencies.database).toBeDefined();
    });

    it('GET /health/redis should return Redis status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/redis',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.connected).toBeDefined();
      expect(body.data.healthy).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown-route',
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.meta.requestId).toBeDefined();
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Request ID', () => {
    it('should include X-Request-ID header in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^req_/);
    });
  });
});
