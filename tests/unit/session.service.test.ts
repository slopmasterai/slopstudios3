/**
 * Session Service Unit Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Create mock Redis instance
const mockRedisInstance = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(86400),
  sadd: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
  srem: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
  status: 'ready',
};

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Set environment variables before imports
process.env['NODE_ENV'] = 'test';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['APP_SECRET'] = 'test-app-secret';
process.env['SESSION_TTL'] = '86400';

describe('Session Service', () => {
  let sessionService: typeof import('../../src/services/session.service.js');
  let redisService: typeof import('../../src/services/redis.service.js');

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Reset mock implementations
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.setex.mockResolvedValue('OK');
    mockRedisInstance.del.mockResolvedValue(1);
    mockRedisInstance.ttl.mockResolvedValue(86400);
    mockRedisInstance.sadd.mockResolvedValue(1);
    mockRedisInstance.smembers.mockResolvedValue([]);
    mockRedisInstance.srem.mockResolvedValue(1);
    mockRedisInstance.expire.mockResolvedValue(1);

    // Import modules
    redisService = await import('../../src/services/redis.service.js');
    sessionService = await import('../../src/services/session.service.js');

    // Initialize Redis client
    redisService.createRedisClient();
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const userId = 'user-123';
      const sessionId = await sessionService.createSession(userId);

      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^sess_/);
      expect(mockRedisInstance.setex).toHaveBeenCalled();
      expect(mockRedisInstance.sadd).toHaveBeenCalled();
    });

    it('should create session with additional data', async () => {
      const userId = 'user-123';
      const sessionData = {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        data: { customField: 'value' },
      };

      const sessionId = await sessionService.createSession(userId, sessionData);

      expect(sessionId).toBeDefined();
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        expect.stringContaining('session:'),
        expect.any(Number),
        expect.stringContaining('192.168.1.1')
      );
    });
  });

  describe('getSession', () => {
    it('should return null for non-existent session', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const session = await sessionService.getSession('non-existent-id');

      expect(session).toBeNull();
    });

    it('should return session data for valid session', async () => {
      const sessionData = {
        id: 'sess_123',
        userId: 'user-123',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        data: {},
      };

      mockRedisInstance.get.mockResolvedValue(JSON.stringify(sessionData));

      const session = await sessionService.getSession('sess_123');

      expect(session).toBeDefined();
      expect(session?.id).toBe('sess_123');
      expect(session?.userId).toBe('user-123');
    });

    it('should return null for expired session', async () => {
      const sessionData = {
        id: 'sess_123',
        userId: 'user-123',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
        lastActivityAt: new Date().toISOString(),
        data: {},
      };

      mockRedisInstance.get.mockResolvedValue(JSON.stringify(sessionData));

      const session = await sessionService.getSession('sess_123');

      expect(session).toBeNull();
      expect(mockRedisInstance.del).toHaveBeenCalled();
    });
  });

  describe('updateSession', () => {
    it('should return false for non-existent session', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await sessionService.updateSession('non-existent-id', { data: {} });

      expect(result).toBe(false);
    });

    it('should update existing session', async () => {
      const sessionData = {
        id: 'sess_123',
        userId: 'user-123',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        data: { oldField: 'old' },
      };

      mockRedisInstance.get.mockResolvedValue(JSON.stringify(sessionData));
      mockRedisInstance.ttl.mockResolvedValue(3600);

      const result = await sessionService.updateSession('sess_123', {
        data: { newField: 'new' },
      });

      expect(result).toBe(true);
      expect(mockRedisInstance.setex).toHaveBeenCalled();
    });
  });

  describe('extendSession', () => {
    it('should return false for non-existent session', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await sessionService.extendSession('non-existent-id');

      expect(result).toBe(false);
    });

    it('should extend existing session TTL', async () => {
      const sessionData = {
        id: 'sess_123',
        userId: 'user-123',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        data: {},
      };

      mockRedisInstance.get.mockResolvedValue(JSON.stringify(sessionData));

      const result = await sessionService.extendSession('sess_123');

      expect(result).toBe(true);
      expect(mockRedisInstance.setex).toHaveBeenCalled();
      expect(mockRedisInstance.expire).toHaveBeenCalled();
    });
  });

  describe('destroySession', () => {
    it('should destroy session and cleanup index', async () => {
      const sessionData = {
        id: 'sess_123',
        userId: 'user-123',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        data: {},
      };

      mockRedisInstance.get.mockResolvedValue(JSON.stringify(sessionData));

      const result = await sessionService.destroySession('sess_123');

      expect(result).toBe(true);
      expect(mockRedisInstance.srem).toHaveBeenCalled();
      expect(mockRedisInstance.del).toHaveBeenCalled();
    });
  });

  describe('destroyAllUserSessions', () => {
    it('should return 0 for user with no sessions', async () => {
      mockRedisInstance.smembers.mockResolvedValue([]);

      const count = await sessionService.destroyAllUserSessions('user-123');

      expect(count).toBe(0);
    });

    it('should destroy all user sessions', async () => {
      mockRedisInstance.smembers.mockResolvedValue(['sess_1', 'sess_2', 'sess_3']);

      const count = await sessionService.destroyAllUserSessions('user-123');

      expect(count).toBe(3);
      expect(mockRedisInstance.del).toHaveBeenCalledTimes(2); // Sessions + index
    });
  });

  describe('isSessionValid', () => {
    it('should return false for non-existent session', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const valid = await sessionService.isSessionValid('non-existent-id');

      expect(valid).toBe(false);
    });

    it('should return true for valid session', async () => {
      const sessionData = {
        id: 'sess_123',
        userId: 'user-123',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        data: {},
      };

      mockRedisInstance.get.mockResolvedValue(JSON.stringify(sessionData));

      const valid = await sessionService.isSessionValid('sess_123');

      expect(valid).toBe(true);
    });
  });
});
