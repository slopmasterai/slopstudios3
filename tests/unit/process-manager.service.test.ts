/**
 * Process Manager Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
/* eslint-disable import/order */

import { EventEmitter } from 'events';

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Shared mock child process that survives module resets
let sharedMockChildProcess: EventEmitter & {
  pid: number;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: jest.Mock;
};

// Initialize mock child process
function createMockChildProcess() {
  return Object.assign(new EventEmitter(), {
    pid: 12345,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: jest.fn().mockReturnValue(true),
  });
}

sharedMockChildProcess = createMockChildProcess();

// Mock child_process - the factory returns the shared mock
jest.mock('child_process', () => ({
  spawn: jest.fn(() => sharedMockChildProcess),
}));

// We'll set up a shared mockRedis that the factory returns
let sharedMockRedis: ReturnType<typeof createMockRedis>;

function createMockRedis() {
  return {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    scard: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
    zadd: jest.fn().mockResolvedValue(1),
    zcard: jest.fn().mockResolvedValue(0),
    zrank: jest.fn().mockResolvedValue(0),
    zrange: jest.fn().mockResolvedValue([]),
    zpopmin: jest.fn().mockResolvedValue([]),
    zrem: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(86400),
    expire: jest.fn().mockResolvedValue(1),
    pipeline: jest.fn().mockReturnValue({
      lpush: jest.fn().mockReturnThis(),
      ltrim: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
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
  };
}

// Initialize the shared mock
sharedMockRedis = createMockRedis();

// Mock Redis service
jest.mock('../../src/services/redis.service.js', () => ({
  getRedisClient: jest.fn(() => sharedMockRedis),
  isRedisConnected: jest.fn(() => true),
}));

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { spawn } from 'child_process';

import { getRedisClient, isRedisConnected } from '../../src/services/redis.service.js';

describe('ProcessManagerService', () => {
  // Use the shared mock for tests to reference
  const mockRedis = sharedMockRedis;

  // Reference to the current mock child process (updated in beforeEach)
  let mockChildProcess: typeof sharedMockChildProcess;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations to defaults
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue(null);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.sadd.mockResolvedValue(1);
    mockRedis.srem.mockResolvedValue(1);
    mockRedis.scard.mockResolvedValue(0);
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.zadd.mockResolvedValue(1);
    mockRedis.zcard.mockResolvedValue(0);
    mockRedis.zrank.mockResolvedValue(0);
    mockRedis.zrange.mockResolvedValue([]);
    mockRedis.zpopmin.mockResolvedValue([]);
    mockRedis.zrem.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(86400);
    mockRedis.expire.mockResolvedValue(1);

    // Create a fresh mock child process and update the shared reference
    // This ensures the mock factory returns the correct object after resetModules
    sharedMockChildProcess = createMockChildProcess();
    mockChildProcess = sharedMockChildProcess;
  });

  afterEach(() => {
    // Remove all listeners from mock child process to prevent leaks between tests
    mockChildProcess.removeAllListeners();
    mockChildProcess.stdout.removeAllListeners();
    mockChildProcess.stderr.removeAllListeners();
    jest.resetModules();
  });

  describe('spawnProcess', () => {
    it('should spawn a process and return the process ID', async () => {
      // Dynamic import after mocks are set up
      const { spawnProcess } = await import('../../src/services/process-manager.service.js');

      const processId = 'test-process-123';
      const spawnPromise = spawnProcess({
        id: processId,
        userId: 'user-1',
        command: '/usr/bin/echo',
        args: ['hello'],
        timeoutMs: 5000,
      });

      // Simulate process exit
      setTimeout(() => {
        mockChildProcess.emit('exit', 0, null);
      }, 10);

      const result = await spawnPromise;

      expect(result).toBe(processId);
      expect(spawn).toHaveBeenCalledWith(
        '/usr/bin/echo',
        ['hello'],
        expect.objectContaining({
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      );
      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it('should capture stdout and update state', async () => {
      const { spawnProcess, getProcessState } =
        await import('../../src/services/process-manager.service.js');

      const processId = 'test-process-stdout';

      // Mock getProcessState to return the stored data
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.includes(processId)) {
          return JSON.stringify({
            config: { id: processId, userId: 'user-1', prompt: '' },
            status: 'running',
            stdout: 'Hello, World!',
            stderr: '',
            retryCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return null;
      });

      const spawnPromise = spawnProcess({
        id: processId,
        userId: 'user-1',
        command: '/usr/bin/echo',
        args: ['Hello, World!'],
        timeoutMs: 5000,
      });

      // Simulate stdout data
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('Hello, World!'));
        mockChildProcess.emit('exit', 0, null);
      }, 10);

      await spawnPromise;

      // Verify state was updated
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should handle process errors', async () => {
      const { spawnProcess } = await import('../../src/services/process-manager.service.js');

      const processId = 'test-process-error';

      // Track the state stored by spawnProcess so updateProcessState can read it
      let storedState: string | null = null;
      mockRedis.setex.mockImplementation(async (_key: string, _ttl: number, value: string) => {
        storedState = value;
        return 'OK';
      });
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.includes(processId)) {
          return storedState;
        }
        return null;
      });

      const spawnPromise = spawnProcess({
        id: processId,
        userId: 'user-1',
        command: '/nonexistent/command',
        timeoutMs: 5000,
      });

      // Simulate process error
      setTimeout(() => {
        mockChildProcess.emit('error', new Error('Command not found'));
      }, 10);

      await spawnPromise;

      // Wait for the async error handler to complete its Redis operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify state was updated to failed
      const setexCalls = mockRedis.setex.mock.calls;
      const lastCall = setexCalls[setexCalls.length - 1];
      if (lastCall) {
        const state = JSON.parse(lastCall[2] as string);
        expect(state.status).toBe('failed');
        expect(state.error).toBe('Command not found');
      }
    });

    it('should handle timeout', async () => {
      jest.useFakeTimers();

      const { spawnProcess } = await import('../../src/services/process-manager.service.js');

      const processId = 'test-process-timeout';
      const timeoutMs = 1000;

      const spawnPromise = spawnProcess({
        id: processId,
        userId: 'user-1',
        command: '/usr/bin/sleep',
        args: ['10'],
        timeoutMs,
      });

      // Fast-forward past timeout
      jest.advanceTimersByTime(timeoutMs + 100);

      // Simulate process being killed after timeout
      mockChildProcess.emit('exit', null, 'SIGKILL');

      await spawnPromise;

      jest.useRealTimers();
    });
  });

  describe('killProcess', () => {
    it('should send kill signal to process', async () => {
      const { spawnProcess, killProcess } =
        await import('../../src/services/process-manager.service.js');

      const processId = 'test-process-kill';

      // Spawn a process first and await to ensure it's registered
      const spawnedId = await spawnProcess({
        id: processId,
        userId: 'user-1',
        command: '/usr/bin/sleep',
        args: ['60'],
        timeoutMs: 60000,
      });

      expect(spawnedId).toBe(processId);

      const killed = await killProcess(processId);

      expect(killed).toBe(true);
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Cleanup - simulate exit
      mockChildProcess.emit('exit', null, 'SIGTERM');
    });

    it('should return false for non-existent process', async () => {
      const { killProcess } = await import('../../src/services/process-manager.service.js');

      const killed = await killProcess('non-existent-process');

      expect(killed).toBe(false);
    });
  });

  describe('getProcessState', () => {
    it('should return process state from Redis', async () => {
      const { getProcessState } = await import('../../src/services/process-manager.service.js');

      const processId = 'test-process-state';
      const expectedState = {
        config: { id: processId, userId: 'user-1', prompt: 'test' },
        status: 'completed',
        stdout: 'output',
        stderr: '',
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(expectedState));

      const state = await getProcessState(processId);

      expect(state).toEqual(expectedState);
      expect(mockRedis.get).toHaveBeenCalledWith(`process:${processId}`);
    });

    it('should return null for non-existent process', async () => {
      const { getProcessState } = await import('../../src/services/process-manager.service.js');

      mockRedis.get.mockResolvedValue(null);

      const state = await getProcessState('non-existent');

      expect(state).toBeNull();
    });
  });

  describe('queue operations', () => {
    it('should enqueue process and return position', async () => {
      const { enqueueProcess } = await import('../../src/services/process-manager.service.js');

      mockRedis.zrank.mockResolvedValue(2);

      const result = await enqueueProcess({
        processId: 'queue-test-1',
        userId: 'user-1',
        priority: 5,
        enqueuedAt: new Date().toISOString(),
      });

      // enqueueProcess returns { position, estimatedWaitSeconds }
      expect(result.position).toBe(3); // 0-indexed rank + 1
      expect(result.estimatedWaitSeconds).toBeDefined();
      expect(mockRedis.zadd).toHaveBeenCalled();
    });

    it('should dequeue process', async () => {
      const { dequeueProcess } = await import('../../src/services/process-manager.service.js');

      const queueItem = {
        processId: 'queue-test-2',
        userId: 'user-1',
        priority: 5,
        enqueuedAt: new Date().toISOString(),
      };

      mockRedis.zpopmin.mockResolvedValue([JSON.stringify(queueItem)]);

      const item = await dequeueProcess();

      expect(item).toEqual(queueItem);
      expect(mockRedis.zpopmin).toHaveBeenCalled();
    });

    it('should return queue size', async () => {
      const { getQueueSize } = await import('../../src/services/process-manager.service.js');

      mockRedis.zcard.mockResolvedValue(5);

      const size = await getQueueSize();

      expect(size).toBe(5);
    });
  });

  describe('listActiveProcesses', () => {
    it('should return list of active process IDs', async () => {
      const { listActiveProcesses } = await import('../../src/services/process-manager.service.js');

      const expectedIds = ['process-1', 'process-2', 'process-3'];
      mockRedis.smembers.mockResolvedValue(expectedIds);

      const ids = await listActiveProcesses();

      expect(ids).toEqual(expectedIds);
      expect(mockRedis.smembers).toHaveBeenCalledWith('process:active');
    });
  });

  describe('cleanupZombieProcesses', () => {
    it('should cleanup processes marked as running but not in memory', async () => {
      const { cleanupZombieProcesses } =
        await import('../../src/services/process-manager.service.js');

      // Mock Redis to return zombie processes
      mockRedis.smembers.mockResolvedValue(['zombie-1', 'zombie-2']);
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.includes('zombie-')) {
          return JSON.stringify({
            config: { id: key.replace('process:', ''), userId: 'user-1', prompt: '' },
            status: 'running',
            stdout: '',
            stderr: '',
            retryCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return null;
      });

      const cleanedUp = await cleanupZombieProcesses();

      expect(cleanedUp).toBe(2);
    });
  });

  describe('onProcessEvent', () => {
    it('should subscribe to process events', async () => {
      const { onProcessEvent, getProcessEmitter } =
        await import('../../src/services/process-manager.service.js');

      const listener = jest.fn();
      const unsubscribe = onProcessEvent(listener);

      // Emit an event
      const emitter = getProcessEmitter();
      emitter.emit('process', {
        processId: 'test',
        userId: 'user-1',
        type: 'start',
        timestamp: new Date().toISOString(),
      });

      expect(listener).toHaveBeenCalled();

      // Unsubscribe
      unsubscribe();

      // Emit again
      emitter.emit('process', {
        processId: 'test',
        userId: 'user-1',
        type: 'exit',
        timestamp: new Date().toISOString(),
      });

      // Should still be 1 call
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
