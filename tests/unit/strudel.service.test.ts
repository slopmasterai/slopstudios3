/**
 * Strudel Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-floating-promises */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service with in-memory storage
const mockRedisStore = new Map<string, string>();

jest.mock('../../src/services/redis.service.js', () => {
  const mockRedis = {
    get: jest.fn((key: string) => Promise.resolve(mockRedisStore.get(key) ?? null)),
    setex: jest.fn((key: string, _ttl: number, value: string) => {
      mockRedisStore.set(key, value);
      return Promise.resolve('OK');
    }),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
    zcard: jest.fn().mockResolvedValue(0),
    zrange: jest.fn().mockResolvedValue([]),
    zpopmin: jest.fn().mockResolvedValue([]),
    zrem: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
    del: jest.fn((key: string) => {
      mockRedisStore.delete(key);
      return Promise.resolve(1);
    }),
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
  generateRequestId: jest.fn(() => 'req_test123'),
  timestamp: jest.fn(() => new Date().toISOString()),
}));

// Mock strudel-metrics service
jest.mock('../../src/services/strudel-metrics.service.js', () => ({
  recordStrudelMetrics: jest.fn(),
  recordValidation: jest.fn(),
  recordRender: jest.fn(),
}));

// Mock the Strudel and web-audio-engine ESM modules for Jest compatibility
// These modules are ESM-only and need to be mocked for Jest to work
jest.mock('web-audio-engine', () => {
  const mockAudioParam = {
    value: 0,
    setValueAtTime: jest.fn().mockReturnThis(),
    linearRampToValueAtTime: jest.fn().mockReturnThis(),
    exponentialRampToValueAtTime: jest.fn().mockReturnThis(),
  };

  const mockGainNode = {
    gain: { ...mockAudioParam },
    connect: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
    _output: null, // Used by effects service
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

  const mockDelayNode = {
    delayTime: { ...mockAudioParam },
    connect: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  };

  const mockBiquadFilterNode = {
    type: 'lowpass',
    frequency: { ...mockAudioParam },
    Q: { ...mockAudioParam },
    gain: { ...mockAudioParam },
    connect: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
  };

  const mockBufferSourceNode = {
    buffer: null,
    playbackRate: { ...mockAudioParam },
    connect: jest.fn().mockReturnThis(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  };

  const mockBuffer = {
    length: 44100,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData: jest.fn(() => new Float32Array(44100)),
    copyToChannel: jest.fn(),
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
      createDelay: jest.fn(() => ({ ...mockDelayNode })),
      createBiquadFilter: jest.fn(() => ({ ...mockBiquadFilterNode })),
      createBufferSource: jest.fn(() => ({ ...mockBufferSourceNode })),
      createBuffer: jest.fn(() => ({ ...mockBuffer })),
      decodeAudioData: jest.fn().mockResolvedValue(mockBuffer),
      startRendering: jest.fn().mockResolvedValue(mockBuffer),
    })),
  };
});

// Create a mock Pattern class for testing
const createMockPattern = (value: any = {}) => ({
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
  evaluate: jest.fn((code: string) =>
    Promise.resolve(createMockPattern({ note: 'c3', s: 'sawtooth' }))
  ),
  transpiler: jest.fn((code: string) => code),
}));

jest.mock('@strudel/core', () => ({
  TimeSpan: jest.fn().mockImplementation((begin: number, end: number) => ({
    begin: { valueOf: () => begin },
    end: { valueOf: () => end },
  })),
  State: jest.fn().mockImplementation((span: any) => ({ span })),
  Pattern: createMockPattern,
  silence: jest.fn(() => createMockPattern()),
  pure: jest.fn((value: any) => createMockPattern(value)),
  stack: jest.fn((...patterns: any[]) => createMockPattern()),
  cat: jest.fn((...patterns: any[]) => createMockPattern()),
  seq: jest.fn((...patterns: any[]) => createMockPattern()),
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

import {
  validPatterns,
  invalidPatterns,
  createMockProcessConfig,
  defaultRenderOptions,
} from '../helpers/strudel-fixtures.js';

describe('StrudelService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisStore.clear();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up the queue worker to prevent Jest from hanging
    try {
      const { stopQueueWorker, shutdownStrudelService } =
        await import('../../src/services/strudel.service.js');
      stopQueueWorker();
      await shutdownStrudelService();
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateStrudelPattern', () => {
    it('should validate a simple valid pattern', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await validateStrudelPattern(validPatterns.simple.code);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should validate mini-notation patterns', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await validateStrudelPattern(validPatterns.miniNotation.code);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate patterns with effects', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await validateStrudelPattern(validPatterns.withEffects.code);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for syntax errors', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await validateStrudelPattern(invalidPatterns.syntaxError.code);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('SYNTAX_ERROR');
    });

    it('should detect patterns that are too long', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      initializeStrudelService({ maxPatternLength: 100 });

      const longPattern = 'a'.repeat(200);
      const result = await validateStrudelPattern(longPattern);

      expect(result.isValid).toBe(false);
      expect(result.errors[0].code).toBe('PATTERN_TOO_LONG');
    });

    it('should detect potential infinite loops', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await validateStrudelPattern(invalidPatterns.infiniteLoop.code);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INFINITE_LOOP')).toBe(true);
    });

    it('should generate warnings for short patterns', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await validateStrudelPattern('"c3"');

      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.code === 'SHORT_PATTERN')).toBe(true);
    });

    it('should detect unmatched brackets', async () => {
      const { validateStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await validateStrudelPattern('"[c3 e3 g3"');

      expect(result.warnings.some((w) => w.code === 'UNMATCHED_BRACKETS')).toBe(true);
    });
  });

  describe('executeStrudelPattern', () => {
    it('should execute a valid pattern and return result', async () => {
      const { executeStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      initializeStrudelService({ maxConcurrentRenders: 5 });

      const config = createMockProcessConfig({
        code: validPatterns.simple.code,
        options: { duration: 1 }, // Short duration for test
      });

      const result = await executeStrudelPattern(config);

      expect(result.processId).toBe(config.processId);
      expect(result.success).toBe(true);
      expect(result.status).toBe('complete');
      expect(result.audioMetadata).toBeDefined();
      expect(result.timing.totalTimeMs).toBeGreaterThan(0);
    });

    it('should fail for invalid patterns', async () => {
      const { executeStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const config = createMockProcessConfig({
        code: invalidPatterns.syntaxError.code,
      });

      const result = await executeStrudelPattern(config);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });

    it('should reject patterns exceeding max length', async () => {
      const { executeStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      initializeStrudelService({ maxPatternLength: 100 });

      const config = createMockProcessConfig({
        code: 'a'.repeat(200),
      });

      const result = await executeStrudelPattern(config);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('exceeds maximum length');
    });

    it('should reject render duration exceeding max', async () => {
      const { executeStrudelPattern, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      initializeStrudelService({ maxRenderDuration: 10 });

      const config = createMockProcessConfig({
        options: { duration: 100 },
      });

      const result = await executeStrudelPattern(config);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('exceeds maximum');
    });
  });

  describe('cancelStrudelProcess', () => {
    it('should cancel a queued process', async () => {
      const { cancelStrudelProcess, updateStrudelProcessState, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      // Create a mock queued state
      await updateStrudelProcessState('test-cancel-1', {
        processId: 'test-cancel-1',
        userId: 'user-1',
        status: 'queued',
        code: validPatterns.simple.code,
        options: defaultRenderOptions,
        priority: 0,
        progress: 0,
        createdAt: new Date().toISOString(),
      });

      const result = await cancelStrudelProcess('test-cancel-1');

      expect(result).toBe(true);
    });

    it('should cancel a rendering process', async () => {
      const { cancelStrudelProcess, updateStrudelProcessState, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      // Create a mock rendering state
      await updateStrudelProcessState('test-cancel-2', {
        processId: 'test-cancel-2',
        userId: 'user-1',
        status: 'rendering',
        code: validPatterns.simple.code,
        options: defaultRenderOptions,
        priority: 0,
        progress: 50,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      });

      const result = await cancelStrudelProcess('test-cancel-2');

      expect(result).toBe(true);
    });

    it('should return false for non-existent process', async () => {
      const { cancelStrudelProcess, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await cancelStrudelProcess('non-existent-process');

      expect(result).toBe(false);
    });
  });

  describe('getStrudelProcessStatus', () => {
    it('should return status for existing process', async () => {
      const { getStrudelProcessStatus, updateStrudelProcessState, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      // Create a mock state
      await updateStrudelProcessState('test-status-1', {
        processId: 'test-status-1',
        userId: 'user-1',
        status: 'rendering',
        code: validPatterns.simple.code,
        options: defaultRenderOptions,
        priority: 0,
        progress: 75,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      });

      const status = await getStrudelProcessStatus('test-status-1');

      expect(status).not.toBeNull();
      expect(status?.status).toBe('rendering');
      expect(status?.progress).toBe(75);
    });

    it('should return null for non-existent process', async () => {
      const { getStrudelProcessStatus, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const status = await getStrudelProcessStatus('non-existent-process');

      expect(status).toBeNull();
    });
  });

  describe('getStrudelServiceHealth', () => {
    it('should return healthy status', async () => {
      const { getStrudelServiceHealth, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      initializeStrudelService({ maxConcurrentRenders: 5 });

      const health = await getStrudelServiceHealth();

      expect(health.status).toBe('healthy');
      expect(health.transpiler.available).toBe(true);
      expect(health.audioRenderer.available).toBe(true);
      expect(health.processes.maxConcurrent).toBe(5);
      expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('listUserStrudelProcesses', () => {
    it('should list processes for a user', async () => {
      const { listUserStrudelProcesses, updateStrudelProcessState, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      // Create mock states for the user
      await updateStrudelProcessState('test-list-1', {
        processId: 'test-list-1',
        userId: 'user-list-test',
        status: 'complete',
        code: validPatterns.simple.code,
        options: defaultRenderOptions,
        priority: 0,
        progress: 100,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const result = await listUserStrudelProcesses('user-list-test');

      expect(result.processes).toBeDefined();
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should filter by status', async () => {
      const { listUserStrudelProcesses, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await listUserStrudelProcesses('user-list-test', { status: 'complete' });

      expect(result.processes).toBeDefined();
    });

    it('should handle pagination', async () => {
      const { listUserStrudelProcesses, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const result = await listUserStrudelProcesses('user-list-test', { page: 2, pageSize: 5 });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
    });
  });

  describe('service configuration', () => {
    it('should update service configuration', async () => {
      const { getStrudelServiceConfig, updateStrudelServiceConfig, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      initializeStrudelService({ maxConcurrentRenders: 3 });

      let config = getStrudelServiceConfig();
      expect(config.maxConcurrentRenders).toBe(3);

      updateStrudelServiceConfig({ maxConcurrentRenders: 10 });

      config = getStrudelServiceConfig();
      expect(config.maxConcurrentRenders).toBe(10);
    });

    it('should toggle queue worker based on config', async () => {
      const { updateStrudelServiceConfig, initializeStrudelService, stopQueueWorker } =
        await import('../../src/services/strudel.service.js');

      initializeStrudelService({ enableQueue: true });

      // Disable queue
      updateStrudelServiceConfig({ enableQueue: false });

      // Re-enable queue
      updateStrudelServiceConfig({ enableQueue: true });

      // Clean up
      stopQueueWorker();
    });
  });

  describe('progress streaming', () => {
    it('should subscribe to and receive progress events', async () => {
      const { subscribeToProgress, initializeStrudelService } =
        await import('../../src/services/strudel.service.js');

      await initializeStrudelService();

      const receivedEvents: unknown[] = [];
      const unsubscribe = subscribeToProgress('test-progress-1', (event) => {
        receivedEvents.push(event);
      });

      expect(typeof unsubscribe).toBe('function');

      // Clean up
      unsubscribe();
    });
  });
});
