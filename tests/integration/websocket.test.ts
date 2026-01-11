/**
 * WebSocket Server Integration Tests
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

import type { Server } from 'http';

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
process.env['PORT'] = '3998'; // Use a valid test port
process.env['HOST'] = '127.0.0.1';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-key-that-is-long-enough-32chars';
process.env['APP_SECRET'] = 'test-app-secret-key-that-is-long-enough-32chars';

describe('WebSocket Server', () => {
  let httpServer: Server;
  let serverUrl: string;
  let clientSocket: ClientSocket;

  beforeAll(async () => {
    // Import after mocks are set up
    const { createHttpServer } = await import('../../src/server/http.server.js');
    const { createWebSocketServer } = await import('../../src/server/websocket.server.js');
    const { registerAllHandlers } = await import('../../src/websocket/handlers/index.js');

    const app = await createHttpServer();
    await app.listen({ port: 0, host: '127.0.0.1' });

    httpServer = app.server;
    const io = createWebSocketServer(httpServer);

    // Register handlers
    io.on('connection', (socket) => {
      registerAllHandlers(socket);
    });

    const address = httpServer.address();
    if (address !== null && typeof address === 'object') {
      serverUrl = `http://127.0.0.1:${String(address.port)}`;
    }
  });

  afterAll(async () => {
    const { closeWebSocketServer } = await import('../../src/server/websocket.server.js');
    await closeWebSocketServer();
    httpServer.close();
  });

  afterEach(() => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect to the server', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should receive welcome event on connection', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('welcome', (data) => {
        expect(data.message).toBeDefined();
        expect(data.socketId).toBeDefined();
        expect(data.serverTime).toBeDefined();
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should disconnect properly', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.disconnect();
      });

      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });
    });
  });

  describe('Heartbeat', () => {
    it('should respond to ping events', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('ping', (response: { timestamp: number }) => {
          expect(response.timestamp).toBeDefined();
          expect(typeof response.timestamp).toBe('number');
          done();
        });
      });
    });

    it('should respond to heartbeat events', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        const clientTimestamp = Date.now();
        clientSocket.emit(
          'heartbeat',
          { timestamp: clientTimestamp },
          (response: { timestamp: number; serverTime: string; latency: number | null }) => {
            expect(response.timestamp).toBeDefined();
            expect(response.serverTime).toBeDefined();
            expect(response.latency).toBeDefined();
            done();
          }
        );
      });
    });
  });

  describe('Room Management', () => {
    it('should join a room', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit(
          'joinRoom',
          'test-room',
          (response: { success: boolean; room?: string }) => {
            expect(response.success).toBe(true);
            expect(response.room).toBe('test-room');
            done();
          }
        );
      });
    });

    it('should leave a room', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('joinRoom', 'test-room', () => {
          clientSocket.emit(
            'leaveRoom',
            'test-room',
            (response: { success: boolean; room?: string }) => {
              expect(response.success).toBe(true);
              expect(response.room).toBe('test-room');
              done();
            }
          );
        });
      });
    });
  });

  describe('Connection Info', () => {
    it('should return connection info', (done) => {
      clientSocket = ioClient(serverUrl, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit(
          'getConnectionInfo',
          (info: { socketId: string; connected: boolean; authenticated: boolean }) => {
            expect(info.socketId).toBeDefined();
            expect(info.connected).toBe(true);
            expect(info.authenticated).toBe(false);
            done();
          }
        );
      });
    });
  });

  describe('Namespaces', () => {
    it('should connect to /media namespace', (done) => {
      clientSocket = ioClient(`${serverUrl}/media`, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should connect to /notifications namespace', (done) => {
      clientSocket = ioClient(`${serverUrl}/notifications`, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });
  });
});
