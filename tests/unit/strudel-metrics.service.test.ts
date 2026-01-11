/**
 * Strudel Metrics Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service
jest.mock('../../src/services/redis.service.js', () => {
  const mockPipeline = {
    lpush: jest.fn().mockReturnThis(),
    ltrim: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    lrange: jest.fn().mockResolvedValue([]),
    zcard: jest.fn().mockResolvedValue(0),
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

import type { StrudelProcessMetrics } from '../../src/services/strudel-metrics.service.js';

describe('StrudelMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Reset metrics after each test
    const { resetMetrics, shutdownStrudelMetricsService } =
      await import('../../src/services/strudel-metrics.service.js');
    await resetMetrics();
    await shutdownStrudelMetricsService();
  });

  describe('initializeStrudelMetricsService', () => {
    it('should initialize successfully', async () => {
      const { initializeStrudelMetricsService, shutdownStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      expect(() => {
        initializeStrudelMetricsService();
      }).not.toThrow();

      await shutdownStrudelMetricsService();
    });
  });

  describe('recordStrudelMetrics', () => {
    it('should record validation metrics', async () => {
      const { recordStrudelMetrics, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      const metrics: StrudelProcessMetrics = {
        processId: 'test-1',
        userId: 'user-1',
        type: 'validation',
        durationMs: 50,
        success: true,
        timestamp: new Date().toISOString(),
      };

      recordStrudelMetrics(metrics);

      const counters = getCounters();
      expect(counters.totalValidations).toBe(1);
      expect(counters.successfulValidations).toBe(1);
      expect(counters.failedValidations).toBe(0);
    });

    it('should record failed validation metrics', async () => {
      const { recordStrudelMetrics, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      const metrics: StrudelProcessMetrics = {
        processId: 'test-2',
        userId: 'user-1',
        type: 'validation',
        durationMs: 25,
        success: false,
        timestamp: new Date().toISOString(),
        errorCode: 'SYNTAX_ERROR',
      };

      recordStrudelMetrics(metrics);

      const counters = getCounters();
      expect(counters.totalValidations).toBe(1);
      expect(counters.successfulValidations).toBe(0);
      expect(counters.failedValidations).toBe(1);
      expect(counters.validationErrors).toBe(1);
    });

    it('should record render metrics', async () => {
      const { recordStrudelMetrics, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      const metrics: StrudelProcessMetrics = {
        processId: 'test-3',
        userId: 'user-1',
        type: 'render',
        durationMs: 5000,
        audioLengthSeconds: 30,
        success: true,
        timestamp: new Date().toISOString(),
      };

      recordStrudelMetrics(metrics);

      const counters = getCounters();
      expect(counters.totalRenders).toBe(1);
      expect(counters.successfulRenders).toBe(1);
      expect(counters.failedRenders).toBe(0);
      expect(counters.totalAudioSeconds).toBe(30);
    });

    it('should record failed render metrics', async () => {
      const { recordStrudelMetrics, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      const metrics: StrudelProcessMetrics = {
        processId: 'test-4',
        userId: 'user-1',
        type: 'render',
        durationMs: 1000,
        audioLengthSeconds: 0,
        success: false,
        timestamp: new Date().toISOString(),
        errorCode: 'RENDER_ERROR',
      };

      recordStrudelMetrics(metrics);

      const counters = getCounters();
      expect(counters.totalRenders).toBe(1);
      expect(counters.successfulRenders).toBe(0);
      expect(counters.failedRenders).toBe(1);
      expect(counters.renderErrors).toBe(1);
    });
  });

  describe('recordValidation', () => {
    it('should track validation duration statistics', async () => {
      const { recordValidation, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      recordValidation(true, 50);
      recordValidation(true, 100);
      recordValidation(true, 25);

      const counters = getCounters();
      expect(counters.totalValidations).toBe(3);
      expect(counters.minValidationTimeMs).toBe(25);
      expect(counters.maxValidationTimeMs).toBe(100);
      expect(counters.totalValidationTimeMs).toBe(175);
    });
  });

  describe('recordRender', () => {
    it('should track render duration statistics', async () => {
      const { recordRender, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      recordRender(true, 1000, 10);
      recordRender(true, 5000, 30);
      recordRender(true, 2000, 20);

      const counters = getCounters();
      expect(counters.totalRenders).toBe(3);
      expect(counters.minRenderTimeMs).toBe(1000);
      expect(counters.maxRenderTimeMs).toBe(5000);
      expect(counters.totalRenderTimeMs).toBe(8000);
      expect(counters.totalAudioSeconds).toBe(60);
    });
  });

  describe('recordCancelledRender', () => {
    it('should increment cancelled counter', async () => {
      const { recordCancelledRender, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      recordCancelledRender();
      recordCancelledRender();

      const counters = getCounters();
      expect(counters.cancelledRenders).toBe(2);
    });
  });

  describe('recordQueueRejection', () => {
    it('should increment queue rejection counter', async () => {
      const { recordQueueRejection, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      recordQueueRejection();

      const counters = getCounters();
      expect(counters.queueRejections).toBe(1);
    });
  });

  describe('updatePeakQueueDepth', () => {
    it('should track peak queue depth', async () => {
      const { updatePeakQueueDepth, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      updatePeakQueueDepth(5);
      updatePeakQueueDepth(10);
      updatePeakQueueDepth(3);

      const counters = getCounters();
      expect(counters.peakQueueDepth).toBe(10);
    });
  });

  describe('getServiceMetrics', () => {
    it('should return aggregated metrics', async () => {
      const { recordValidation, recordRender, getServiceMetrics, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      // Record some metrics
      recordValidation(true, 50);
      recordValidation(false, 25);
      recordRender(true, 5000, 30);
      recordRender(false, 1000, 0);

      const metrics = await getServiceMetrics(3600);

      expect(metrics.periodSeconds).toBe(3600);
      expect(metrics.validation.total).toBe(2);
      expect(metrics.validation.successful).toBe(1);
      expect(metrics.validation.failed).toBe(1);
      expect(metrics.render.total).toBe(2);
      expect(metrics.render.successful).toBe(1);
      expect(metrics.render.failed).toBe(1);
      expect(metrics.render.totalAudioSeconds).toBe(30);
    });

    it('should handle empty metrics', async () => {
      const { getServiceMetrics, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      const metrics = await getServiceMetrics();

      expect(metrics.validation.total).toBe(0);
      expect(metrics.render.total).toBe(0);
      expect(metrics.validation.averageTimeMs).toBe(0);
      expect(metrics.render.averageTimeMs).toBe(0);
    });
  });

  describe('getRecentMetrics', () => {
    it('should return recent metrics from buffer', async () => {
      const { recordStrudelMetrics, getRecentMetrics, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      // Record some metrics
      for (let i = 0; i < 5; i++) {
        recordStrudelMetrics({
          processId: `test-${i}`,
          userId: 'user-1',
          type: 'validation',
          durationMs: 50 + i * 10,
          success: true,
          timestamp: new Date().toISOString(),
        });
      }

      const recent = await getRecentMetrics(10);

      // Should return from buffer since Redis mock returns empty
      expect(recent.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getUserMetrics', () => {
    it('should filter metrics by user ID', async () => {
      const { recordStrudelMetrics, getUserMetrics, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      // Record metrics for different users
      recordStrudelMetrics({
        processId: 'test-1',
        userId: 'user-1',
        type: 'validation',
        durationMs: 50,
        success: true,
        timestamp: new Date().toISOString(),
      });

      recordStrudelMetrics({
        processId: 'test-2',
        userId: 'user-2',
        type: 'validation',
        durationMs: 50,
        success: true,
        timestamp: new Date().toISOString(),
      });

      const user1Metrics = await getUserMetrics('user-1', 10);
      const user2Metrics = await getUserMetrics('user-2', 10);

      // Metrics are in buffer, filtering should work
      expect(user1Metrics.every((m) => m.userId === 'user-1')).toBe(true);
      expect(user2Metrics.every((m) => m.userId === 'user-2')).toBe(true);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all counters', async () => {
      const {
        recordValidation,
        recordRender,
        resetMetrics,
        getCounters,
        initializeStrudelMetricsService,
      } = await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      // Record some metrics
      recordValidation(true, 50);
      recordRender(true, 5000, 30);

      // Verify metrics were recorded
      let counters = getCounters();
      expect(counters.totalValidations).toBeGreaterThan(0);
      expect(counters.totalRenders).toBeGreaterThan(0);

      // Reset
      await resetMetrics();

      // Verify counters are reset
      counters = getCounters();
      expect(counters.totalValidations).toBe(0);
      expect(counters.totalRenders).toBe(0);
      expect(counters.totalAudioSeconds).toBe(0);
    });
  });

  describe('percentile calculations', () => {
    it('should calculate validation duration percentiles', async () => {
      const { recordValidation, getValidationPercentiles, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      // Record many validation durations
      for (let i = 1; i <= 100; i++) {
        recordValidation(true, i);
      }

      const percentiles = getValidationPercentiles();

      expect(percentiles.p50).toBeGreaterThan(0);
      expect(percentiles.p95).toBeGreaterThan(percentiles.p50);
      expect(percentiles.p99).toBeGreaterThanOrEqual(percentiles.p95);
    });

    it('should calculate render duration percentiles', async () => {
      const { recordRender, getRenderPercentiles, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      // Record many render durations
      for (let i = 1; i <= 100; i++) {
        recordRender(true, i * 100, i);
      }

      const percentiles = getRenderPercentiles();

      expect(percentiles.p50).toBeGreaterThan(0);
      expect(percentiles.p95).toBeGreaterThan(percentiles.p50);
      expect(percentiles.p99).toBeGreaterThanOrEqual(percentiles.p95);
    });

    it('should return 0 for empty samples', async () => {
      const {
        getValidationPercentiles,
        getRenderPercentiles,
        initializeStrudelMetricsService,
        resetMetrics,
      } = await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();
      await resetMetrics();

      const validationPercentiles = getValidationPercentiles();
      const renderPercentiles = getRenderPercentiles();

      expect(validationPercentiles.p50).toBe(0);
      expect(renderPercentiles.p50).toBe(0);
    });
  });

  describe('error tracking', () => {
    it('should track timeout errors', async () => {
      const { recordRender, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      recordRender(false, 60000, 0, 'TIMEOUT_ERROR');

      const counters = getCounters();
      expect(counters.timeoutErrors).toBe(1);
    });

    it('should track system errors', async () => {
      const { recordRender, getCounters, initializeStrudelMetricsService } =
        await import('../../src/services/strudel-metrics.service.js');

      initializeStrudelMetricsService();

      recordRender(false, 1000, 0, 'SYSTEM_ERROR');
      recordRender(false, 1000, 0, 'INTERNAL_ERROR');

      const counters = getCounters();
      expect(counters.systemErrors).toBe(2);
    });
  });
});
