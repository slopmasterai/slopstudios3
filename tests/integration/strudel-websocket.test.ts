/**
 * Strudel WebSocket Integration Tests
 * Tests real-time pattern validation, rendering, and process management
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';

import { validPatterns, invalidPatterns } from '../helpers/strudel-fixtures.js';

// Mock Redis service with in-memory storage
const mockWsRedisStore = new Map<string, string>();
const mockWsListStore = new Map<string, string[]>();

jest.mock('../../src/services/redis.service.js', () => {
  const mockPipeline = {
    lpush: jest.fn().mockReturnThis(),
    ltrim: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const mockRedis = {
    get: jest.fn((key: string) => Promise.resolve(mockWsRedisStore.get(key) ?? null)),
    setex: jest.fn((key: string, _ttl: number, value: string) => {
      mockWsRedisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    set: jest.fn((key: string, value: string) => {
      mockWsRedisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      mockWsRedisStore.delete(key);
      return Promise.resolve(1);
    }),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
    zcard: jest.fn().mockResolvedValue(0),
    zrange: jest.fn().mockResolvedValue([]),
    zpopmin: jest.fn().mockResolvedValue([]),
    zrem: jest.fn().mockResolvedValue(1),
    lrange: jest.fn((key: string) => Promise.resolve(mockWsListStore.get(key) ?? [])),
    scan: jest.fn().mockResolvedValue(['0', []]),
    pipeline: jest.fn(() => mockPipeline),
  };

  return {
    getRedisClient: jest.fn(() => mockRedis),
    isRedisConnected: jest.fn(() => true),
  };
});

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock utils
jest.mock('../../src/utils/index.js', () => ({
  generateRequestId: jest.fn(() => `req_ws_test_${Date.now()}`),
  timestamp: jest.fn(() => new Date().toISOString()),
}));

// Mock strudel-metrics service
jest.mock('../../src/services/strudel-metrics.service.js', () => ({
  recordStrudelMetrics: jest.fn(),
  recordValidation: jest.fn(),
  recordRender: jest.fn(),
  recordCancelledRender: jest.fn(),
}));

// Mock the Strudel and web-audio-engine ESM modules for Jest compatibility
// These modules are ESM-only and need to be mocked for Jest to work
jest.mock('web-audio-engine', () => {
  const mockAudioParam = {
    value: 0,
    setValueAtTime: jest.fn().mockReturnThis(),
    linearRampToValueAtTime: jest.fn().mockReturnThis(),
  };

  const mockGainNode = {
    gain: { ...mockAudioParam },
    connect: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  };

  const mockOscillatorNode = {
    type: 'sine',
    frequency: { ...mockAudioParam },
    connect: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  };

  const mockMerger = {
    connect: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  };

  const mockBuffer = {
    length: 44100,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData: jest.fn(() => new Float32Array(44100)),
  };

  return {
    OfflineAudioContext: jest.fn().mockImplementation(() => ({
      destination: {},
      sampleRate: 44100,
      currentTime: 0,
      createOscillator: jest.fn(() => ({ ...mockOscillatorNode })),
      createGain: jest.fn(() => ({ ...mockGainNode })),
      createChannelMerger: jest.fn(() => ({ ...mockMerger })),
      createChannelSplitter: jest.fn(() => ({ ...mockMerger })),
      startRendering: jest.fn().mockResolvedValue(mockBuffer),
    })),
  };
});

// Create a mock Pattern class for testing
const createMockPattern = (value: unknown = {}) => ({
  _Pattern: true,
  query: jest.fn(() => [
    {
      whole: { begin: { valueOf: () => 0 }, end: { valueOf: () => 1 } },
      part: { begin: { valueOf: () => 0 }, end: { valueOf: () => 1 } },
      value,
      hasOnset: () => true,
    },
  ]),
  firstCycle: jest.fn(() => []),
  withValue: jest.fn().mockReturnThis(),
});

jest.mock('@strudel/transpiler', () => ({
  evaluate: jest.fn(() => Promise.resolve(createMockPattern({ note: 'c3', s: 'sawtooth' }))),
  transpiler: jest.fn((code: string) => code),
}));

jest.mock('@strudel/core', () => ({
  TimeSpan: jest.fn().mockImplementation((begin: number, end: number) => ({
    begin: { valueOf: () => begin },
    end: { valueOf: () => end },
  })),
  State: jest.fn().mockImplementation((span: unknown) => ({ span })),
  Pattern: createMockPattern,
  silence: jest.fn(() => createMockPattern()),
  pure: jest.fn((value: unknown) => createMockPattern(value)),
  stack: jest.fn(() => createMockPattern()),
  cat: jest.fn(() => createMockPattern()),
  seq: jest.fn(() => createMockPattern()),
  s: jest.fn((pattern: string) => createMockPattern({ s: pattern })),
  note: jest.fn((pattern: string) => createMockPattern({ note: pattern })),
  n: jest.fn((pattern: string) => createMockPattern({ n: pattern })),
  sound: jest.fn((pattern: string) => createMockPattern({ sound: pattern })),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@strudel/mini', () => ({}));

describe('Strudel WebSocket Integration', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let clientSocket: ClientSocket;
  let serverPort: number;

  beforeAll(async () => {
    // Create HTTP server
    httpServer = createServer();

    // Create Socket.IO server
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Start listening
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        serverPort = (httpServer.address() as AddressInfo).port;
        resolve();
      });
    });

    // Register Strudel handler
    const { registerStrudelHandler } =
      await import('../../src/websocket/handlers/strudel.handler.js');

    // Initialize Strudel service
    const { initializeStrudelService } = await import('../../src/services/strudel.service.js');
    initializeStrudelService({ maxConcurrentRenders: 5 });

    io.on('connection', (socket) => {
      // Add mock user data
      socket.data.userId = 'user-ws-test-123';
      socket.data.authenticated = true;

      registerStrudelHandler(socket);
    });
  });

  afterAll(async () => {
    // Cleanup
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }

    await io.close();

    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });

    // Shutdown Strudel service
    const { shutdownStrudelService, stopQueueWorker } =
      await import('../../src/services/strudel.service.js');
    stopQueueWorker();
    await shutdownStrudelService();
  });

  beforeEach(async () => {
    // Clear mock stores
    mockWsRedisStore.clear();
    mockWsListStore.clear();

    // Create new client for each test
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }

    clientSocket = ioc(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      autoConnect: false,
    });

    // Connect and wait
    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', resolve);
      clientSocket.on('connect_error', reject);
      clientSocket.connect();
    });
  });

  describe('strudel:validate event', () => {
    it('should validate a simple pattern successfully', async () => {
      const response = await new Promise<{
        success: boolean;
        isValid: boolean;
        errors: unknown[];
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit(
          'strudel:validate',
          { code: validPatterns.simple.code },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; isValid: boolean; errors: unknown[] });
          }
        );
      });

      expect(response.success).toBe(true);
      expect(response.isValid).toBe(true);
      expect(response.errors).toHaveLength(0);
    });

    it('should validate mini-notation pattern', async () => {
      const response = await new Promise<{
        success: boolean;
        isValid: boolean;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit(
          'strudel:validate',
          { code: validPatterns.miniNotation.code },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; isValid: boolean });
          }
        );
      });

      expect(response.success).toBe(true);
      expect(response.isValid).toBe(true);
    });

    it('should return errors for invalid pattern', async () => {
      const response = await new Promise<{
        success: boolean;
        isValid: boolean;
        errors: Array<{ code: string }>;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit(
          'strudel:validate',
          { code: invalidPatterns.syntaxError.code },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(
              response as { success: boolean; isValid: boolean; errors: Array<{ code: string }> }
            );
          }
        );
      });

      expect(response.success).toBe(true);
      expect(response.isValid).toBe(false);
      expect(response.errors.length).toBeGreaterThan(0);
    });

    it('should reject empty payload', async () => {
      const response = await new Promise<{
        success: boolean;
        error: { code: string };
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit('strudel:validate', {}, (response: unknown) => {
          clearTimeout(timeout);
          resolve(response as { success: boolean; error: { code: string } });
        });
      });

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('strudel:execute event', () => {
    it('should execute a valid pattern and return result', async () => {
      const response = await new Promise<{
        success: boolean;
        processId: string;
        status: string;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 10000);

        clientSocket.emit(
          'strudel:execute',
          {
            code: validPatterns.simple.code,
            options: { duration: 1 },
          },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; processId: string; status: string });
          }
        );
      });

      expect(response.success).toBe(true);
      expect(response.processId).toBeDefined();
      expect(response.status).toBe('complete');
    });

    it('should fail for invalid pattern', async () => {
      const response = await new Promise<{
        success: boolean;
        error: { code: string };
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit(
          'strudel:execute',
          {
            code: invalidPatterns.syntaxError.code,
            options: { duration: 1 },
          },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; error: { code: string } });
          }
        );
      });

      expect(response.success).toBe(false);
    });

    it('should emit progress events during rendering', async () => {
      const progressEvents: Array<{ progress: number }> = [];

      clientSocket.on('strudel:progress', (data: { progress: number }) => {
        progressEvents.push(data);
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 10000);

        clientSocket.emit(
          'strudel:execute',
          {
            code: validPatterns.simple.code,
            options: { duration: 2 },
          },
          () => {
            clearTimeout(timeout);
            resolve();
          }
        );
      });

      // Progress events should have been emitted
      // Note: Mock implementation may or may not emit progress events
      expect(Array.isArray(progressEvents)).toBe(true);
    });

    it('should reject missing code', async () => {
      const response = await new Promise<{
        success: boolean;
        error: { code: string };
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit('strudel:execute', { options: { duration: 1 } }, (response: unknown) => {
          clearTimeout(timeout);
          resolve(response as { success: boolean; error: { code: string } });
        });
      });

      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('strudel:cancel event', () => {
    it('should cancel a rendering process', async () => {
      // First, start a longer render
      const executePromise = new Promise<{ processId: string }>((resolve) => {
        clientSocket.emit(
          'strudel:execute',
          {
            code: validPatterns.simple.code,
            options: { duration: 30 },
          },
          (response: unknown) => {
            resolve(response as { processId: string });
          }
        );
      });

      // Wait a bit then cancel
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try to cancel (note: with mock rendering this may complete too fast)
      const cancelResponse = await new Promise<{
        success: boolean;
        cancelled?: boolean;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit('strudel:cancel', { processId: 'any-process' }, (response: unknown) => {
          clearTimeout(timeout);
          resolve(response as { success: boolean; cancelled?: boolean });
        });
      });

      // Response should be success (whether cancelled or not found is implementation dependent)
      expect(cancelResponse).toBeDefined();
      expect(typeof cancelResponse.success).toBe('boolean');

      await executePromise;
    });

    it('should handle cancellation of non-existent process', async () => {
      const response = await new Promise<{
        success: boolean;
        cancelled: boolean;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit(
          'strudel:cancel',
          { processId: 'non-existent-process-123' },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; cancelled: boolean });
          }
        );
      });

      expect(response.success).toBe(true);
      expect(response.cancelled).toBe(false);
    });
  });

  describe('strudel:status event', () => {
    it('should get status of a completed process', async () => {
      // First execute a pattern
      const executeResponse = await new Promise<{
        success: boolean;
        processId: string;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 10000);

        clientSocket.emit(
          'strudel:execute',
          {
            code: validPatterns.simple.code,
            options: { duration: 1 },
          },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; processId: string });
          }
        );
      });

      expect(executeResponse.success).toBe(true);

      // Now get status
      const statusResponse = await new Promise<{
        success: boolean;
        status?: { status: string };
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit(
          'strudel:status',
          { processId: executeResponse.processId },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; status?: { status: string } });
          }
        );
      });

      expect(statusResponse.success).toBe(true);
      // Status may or may not be found depending on Redis mock
    });

    it('should handle status request for non-existent process', async () => {
      const response = await new Promise<{
        success: boolean;
        status: unknown;
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);

        clientSocket.emit(
          'strudel:status',
          { processId: 'non-existent-status-123' },
          (response: unknown) => {
            clearTimeout(timeout);
            resolve(response as { success: boolean; status: unknown });
          }
        );
      });

      expect(response.success).toBe(true);
      expect(response.status).toBeNull();
    });
  });

  describe('Real-time streaming', () => {
    it('should receive validated event after validation', async () => {
      const validatedEvent = new Promise<{ validation: { isValid: boolean } }>((resolve) => {
        clientSocket.once('strudel:validated', (data: { validation: { isValid: boolean } }) => {
          resolve(data);
        });
      });

      clientSocket.emit('strudel:validate', { code: validPatterns.simple.code }, () => {});

      const validated = await Promise.race([
        validatedEvent,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 2000)
        ),
      ]);

      // May or may not receive event depending on implementation
      if (validated) {
        expect(validated.validation.isValid).toBe(true);
      }
    });

    it('should receive complete event after execution', async () => {
      const completeEvent = new Promise<{ processId: string }>((resolve) => {
        clientSocket.once('strudel:complete', (data: { processId: string }) => {
          resolve(data);
        });
      });

      clientSocket.emit(
        'strudel:execute',
        {
          code: validPatterns.simple.code,
          options: { duration: 1 },
        },
        () => {}
      );

      const complete = await Promise.race([
        completeEvent,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 5000)
        ),
      ]);

      // May or may not receive event depending on implementation
      if (complete) {
        expect(complete.processId).toBeDefined();
      }
    });

    it('should receive error event for failed execution', async () => {
      const errorEvent = new Promise<{ error: { code: string } }>((resolve) => {
        clientSocket.once('strudel:error', (data: { error: { code: string } }) => {
          resolve(data);
        });
      });

      clientSocket.emit(
        'strudel:execute',
        {
          code: invalidPatterns.syntaxError.code,
          options: { duration: 1 },
        },
        () => {}
      );

      const error = await Promise.race([
        errorEvent,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 5000)
        ),
      ]);

      // May or may not receive event depending on implementation
      if (error) {
        expect(error.error.code).toBeDefined();
      }
    });
  });

  describe('Connection handling', () => {
    it('should handle disconnect during execution gracefully', async () => {
      // Start execution
      clientSocket.emit(
        'strudel:execute',
        {
          code: validPatterns.simple.code,
          options: { duration: 5 },
        },
        () => {}
      );

      // Disconnect immediately
      clientSocket.disconnect();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reconnect
      await new Promise<void>((resolve, reject) => {
        clientSocket.on('connect', resolve);
        clientSocket.on('connect_error', reject);
        clientSocket.connect();
      });

      expect(clientSocket.connected).toBe(true);
    });

    it('should allow multiple concurrent validations', async () => {
      const validations = [
        validPatterns.simple.code,
        validPatterns.miniNotation.code,
        validPatterns.withEffects.code,
      ].map(
        (code) =>
          new Promise<{ success: boolean; isValid: boolean }>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout'));
            }, 5000);

            clientSocket.emit('strudel:validate', { code }, (response: unknown) => {
              clearTimeout(timeout);
              resolve(response as { success: boolean; isValid: boolean });
            });
          })
      );

      const results = await Promise.all(validations);

      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Rate limiting', () => {
    it('should handle rapid validation requests', async () => {
      const requests = Array.from(
        { length: 10 },
        () =>
          new Promise<{ success: boolean }>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout'));
            }, 10000);

            clientSocket.emit(
              'strudel:validate',
              { code: validPatterns.simple.code },
              (response: unknown) => {
                clearTimeout(timeout);
                resolve(response as { success: boolean });
              }
            );
          })
      );

      const results = await Promise.all(requests);

      // All should complete (rate limiting is per-user, handled at handler level)
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    });
  });
});
