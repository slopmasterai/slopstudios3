/**
 * Agent Metrics Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service
const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK' as never),
  setex: jest.fn().mockResolvedValue('OK' as never),
  del: jest.fn().mockResolvedValue(1 as never),
  lrange: jest.fn().mockResolvedValue([] as never),
  lpush: jest.fn().mockResolvedValue(1 as never),
  ltrim: jest.fn().mockResolvedValue('OK' as never),
  keys: jest.fn().mockResolvedValue([] as never),
};

jest.mock('../../src/services/redis.service.js', () => ({
  getRedisClient: jest.fn(() => mockRedis),
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

describe('AgentMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.lrange.mockResolvedValue([] as never);
  });

  afterEach(async () => {
    jest.resetModules();
  });

  describe('initializeAgentMetricsService', () => {
    it('should initialize successfully', async () => {
      const { initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      expect(() => {
        initializeAgentMetricsService();
      }).not.toThrow();
    });

    it('should accept custom configuration', async () => {
      const { initializeAgentMetricsService, getServiceConfig } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService({
        enableMetrics: false,
        aggregationPeriodSeconds: 7200,
      });

      const config = getServiceConfig();
      expect(config.enableMetrics).toBe(false);
      expect(config.aggregationPeriodSeconds).toBe(7200);
    });
  });

  describe('recordWorkflowMetric', () => {
    it('should record successful workflow metrics', async () => {
      const { recordWorkflowMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordWorkflowMetric({
        executionId: 'exec-123',
        workflowId: 'workflow-123',
        userId: 'user-1',
        status: 'completed',
        durationMs: 1000,
        stepCount: 5,
        completedSteps: 5,
        failedSteps: 0,
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
      expect(mockRedis.ltrim).toHaveBeenCalled();
    });

    it('should record failed workflow metrics', async () => {
      const { recordWorkflowMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordWorkflowMetric({
        executionId: 'exec-456',
        workflowId: 'workflow-456',
        userId: 'user-1',
        status: 'failed',
        durationMs: 500,
        stepCount: 5,
        completedSteps: 2,
        failedSteps: 1,
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
    });

    it('should not record when metrics are disabled', async () => {
      const { recordWorkflowMetric, initializeAgentMetricsService, updateServiceConfig } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();
      updateServiceConfig({ enableMetrics: false });

      await recordWorkflowMetric({
        executionId: 'exec-789',
        workflowId: 'workflow-789',
        userId: 'user-1',
        status: 'completed',
        durationMs: 100,
        stepCount: 1,
        completedSteps: 1,
        failedSteps: 0,
      });

      expect(mockRedis.lpush).not.toHaveBeenCalled();
    });
  });

  describe('recordStepMetric', () => {
    it('should record successful step metrics', async () => {
      const { recordStepMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordStepMetric({
        executionId: 'exec-123',
        stepId: 'step-1',
        agentType: 'claude',
        agentId: 'agent-1',
        status: 'completed',
        durationMs: 250,
        retryCount: 0,
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
      expect(mockRedis.ltrim).toHaveBeenCalled();
    });

    it('should record failed step metrics', async () => {
      const { recordStepMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordStepMetric({
        executionId: 'exec-456',
        stepId: 'step-2',
        agentType: 'custom',
        agentId: 'agent-2',
        status: 'failed',
        durationMs: 100,
        retryCount: 2,
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
    });
  });

  describe('recordTemplateMetric', () => {
    it('should record template usage metrics', async () => {
      const { recordTemplateMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordTemplateMetric({
        templateId: 'template-123',
        success: true,
        variablesUsed: 3,
        interpolationTimeMs: 5,
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
      expect(mockRedis.ltrim).toHaveBeenCalled();
    });

    it('should record failed template metrics', async () => {
      const { recordTemplateMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordTemplateMetric({
        templateId: 'template-456',
        success: false,
        variablesUsed: 2,
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
    });
  });

  describe('recordAgentMetric', () => {
    it('should record agent execution metrics', async () => {
      const { recordAgentMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordAgentMetric({
        agentId: 'agent-123',
        agentType: 'claude',
        success: true,
        responseTimeMs: 1500,
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
      expect(mockRedis.ltrim).toHaveBeenCalled();
    });

    it('should record agent error metrics', async () => {
      const { recordAgentMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await recordAgentMetric({
        agentId: 'agent-456',
        agentType: 'custom',
        success: false,
        responseTimeMs: 200,
        errorType: 'TIMEOUT',
      });

      expect(mockRedis.lpush).toHaveBeenCalled();
    });
  });

  describe('getWorkflowMetrics', () => {
    it('should return aggregated workflow metrics', async () => {
      const { getWorkflowMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      const metricsData = [
        JSON.stringify({
          executionId: 'exec-1',
          status: 'completed',
          durationMs: 100,
          timestamp: now - 1000,
        }),
        JSON.stringify({
          executionId: 'exec-2',
          status: 'completed',
          durationMs: 200,
          timestamp: now - 2000,
        }),
        JSON.stringify({
          executionId: 'exec-3',
          status: 'failed',
          durationMs: 50,
          timestamp: now - 3000,
        }),
      ];

      mockRedis.lrange.mockResolvedValue(metricsData as never);

      const metrics = await getWorkflowMetrics(3600);

      expect(metrics.totalWorkflows).toBe(3);
      expect(metrics.successfulWorkflows).toBe(2);
      expect(metrics.failedWorkflows).toBe(1);
      expect(metrics.avgDurationMs).toBeGreaterThan(0);
      expect(metrics.successRate).toBe(2 / 3);
    });

    it('should filter metrics by period', async () => {
      const { getWorkflowMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      const metricsData = [
        JSON.stringify({
          executionId: 'exec-1',
          status: 'completed',
          durationMs: 100,
          timestamp: now - 1000, // 1 second ago (within period)
        }),
        JSON.stringify({
          executionId: 'exec-2',
          status: 'completed',
          durationMs: 200,
          timestamp: now - 3700000, // More than 1 hour ago (outside period)
        }),
      ];

      mockRedis.lrange.mockResolvedValue(metricsData as never);

      const metrics = await getWorkflowMetrics(3600); // 1 hour period

      // Only the recent metric should be counted
      expect(metrics.totalWorkflows).toBe(1);
    });

    it('should return empty metrics when no data', async () => {
      const { getWorkflowMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();
      mockRedis.lrange.mockResolvedValue([] as never);

      const metrics = await getWorkflowMetrics();

      expect(metrics.totalWorkflows).toBe(0);
      expect(metrics.avgDurationMs).toBe(0);
      expect(metrics.successRate).toBe(0);
    });

    it('should calculate percentiles correctly', async () => {
      const { getWorkflowMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      const metricsData = [];

      // Generate 100 metrics with durations 10, 20, 30, ..., 1000
      for (let i = 1; i <= 100; i++) {
        metricsData.push(
          JSON.stringify({
            executionId: `exec-${i}`,
            status: 'completed',
            durationMs: i * 10,
            timestamp: now - i * 1000,
          })
        );
      }

      mockRedis.lrange.mockResolvedValue(metricsData as never);

      const metrics = await getWorkflowMetrics(3600);

      expect(metrics.p50DurationMs).toBeGreaterThan(0);
      expect(metrics.p95DurationMs).toBeGreaterThan(metrics.p50DurationMs);
      expect(metrics.p99DurationMs).toBeGreaterThanOrEqual(metrics.p95DurationMs);
    });
  });

  describe('getStepMetrics', () => {
    it('should return step metrics by agent type', async () => {
      const { getStepMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      const metricsData = [
        JSON.stringify({
          stepId: 'step-1',
          agentType: 'claude',
          status: 'completed',
          durationMs: 100,
          retryCount: 0,
          timestamp: now - 1000,
        }),
        JSON.stringify({
          stepId: 'step-2',
          agentType: 'claude',
          status: 'completed',
          durationMs: 200,
          retryCount: 1,
          timestamp: now - 2000,
        }),
        JSON.stringify({
          stepId: 'step-3',
          agentType: 'strudel',
          status: 'failed',
          durationMs: 50,
          retryCount: 0,
          timestamp: now - 3000,
        }),
      ];

      mockRedis.lrange.mockResolvedValue(metricsData as never);

      const metrics = await getStepMetrics(3600);

      expect(metrics.claude.totalSteps).toBe(2);
      expect(metrics.claude.successfulSteps).toBe(2);
      expect(metrics.claude.retriedSteps).toBe(1);
      expect(metrics.strudel.totalSteps).toBe(1);
      expect(metrics.strudel.failedSteps).toBe(1);
    });

    it('should return empty metrics for all agent types when no data', async () => {
      const { getStepMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();
      mockRedis.lrange.mockResolvedValue([] as never);

      const metrics = await getStepMetrics();

      expect(metrics.claude.totalSteps).toBe(0);
      expect(metrics.strudel.totalSteps).toBe(0);
      expect(metrics.custom.totalSteps).toBe(0);
    });
  });

  describe('getTemplateMetrics', () => {
    it('should return template usage metrics', async () => {
      const { getTemplateMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      const metricsData = [
        JSON.stringify({
          templateId: 'tpl-1',
          success: true,
          variablesUsed: 3,
          timestamp: now - 1000,
        }),
        JSON.stringify({
          templateId: 'tpl-1',
          success: true,
          variablesUsed: 2,
          timestamp: now - 2000,
        }),
        JSON.stringify({
          templateId: 'tpl-2',
          success: false,
          variablesUsed: 1,
          timestamp: now - 3000,
        }),
      ];

      mockRedis.lrange.mockResolvedValue(metricsData as never);

      const metrics = await getTemplateMetrics(3600);

      expect(metrics.length).toBe(2);
      const tpl1 = metrics.find((m) => m.templateId === 'tpl-1');
      expect(tpl1?.usageCount).toBe(2);
      expect(tpl1?.successfulInterpolations).toBe(2);
      expect(tpl1?.avgVariablesUsed).toBe(2.5);
    });

    it('should respect limit parameter', async () => {
      const { getTemplateMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      const metricsData = [];

      // Generate metrics for 20 different templates
      for (let i = 1; i <= 20; i++) {
        metricsData.push(
          JSON.stringify({
            templateId: `tpl-${i}`,
            success: true,
            variablesUsed: i,
            timestamp: now - i * 1000,
          })
        );
      }

      mockRedis.lrange.mockResolvedValue(metricsData as never);

      const metrics = await getTemplateMetrics(3600, 5);

      expect(metrics.length).toBe(5);
    });
  });

  describe('getAgentPerformanceMetrics', () => {
    it('should return agent performance metrics', async () => {
      const { getAgentPerformanceMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      const metricsData = [
        JSON.stringify({
          agentId: 'agent-1',
          agentType: 'claude',
          success: true,
          responseTimeMs: 100,
          timestamp: now - 1000,
        }),
        JSON.stringify({
          agentId: 'agent-1',
          agentType: 'claude',
          success: true,
          responseTimeMs: 200,
          timestamp: now - 2000,
        }),
        JSON.stringify({
          agentId: 'agent-1',
          agentType: 'claude',
          success: false,
          responseTimeMs: 50,
          errorType: 'TIMEOUT',
          timestamp: now - 3000,
        }),
      ];

      mockRedis.lrange.mockResolvedValue(metricsData as never);

      const metrics = await getAgentPerformanceMetrics(3600);

      expect(metrics.length).toBe(1);
      expect(metrics[0].agentId).toBe('agent-1');
      expect(metrics[0].totalExecutions).toBe(3);
      expect(metrics[0].successfulExecutions).toBe(2);
      expect(metrics[0].failedExecutions).toBe(1);
      expect(metrics[0].avgResponseTimeMs).toBeGreaterThan(0);
    });
  });

  describe('getOrchestrationMetrics', () => {
    it('should return comprehensive service metrics', async () => {
      const { getOrchestrationMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const now = Date.now();
      // Set up different mock data for each metrics type
      mockRedis.lrange.mockResolvedValue([] as never);

      const metrics = await getOrchestrationMetrics(3600);

      expect(metrics.workflows).toBeDefined();
      expect(metrics.stepsByAgent).toBeDefined();
      expect(metrics.templates).toBeDefined();
      expect(metrics.agents).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.periodSeconds).toBe(3600);
    });
  });

  describe('cleanupOldMetrics', () => {
    it('should not throw when cleaning up metrics', async () => {
      const { cleanupOldMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await expect(cleanupOldMetrics()).resolves.not.toThrow();
    });
  });

  describe('shutdownAgentMetricsService', () => {
    it('should shutdown gracefully', async () => {
      const { shutdownAgentMetricsService, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      await expect(shutdownAgentMetricsService()).resolves.not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should get and update service config', async () => {
      const { getServiceConfig, updateServiceConfig, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();

      const initialConfig = getServiceConfig();
      expect(initialConfig.enableMetrics).toBe(true);

      updateServiceConfig({ metricsRetentionDays: 14 });

      const updatedConfig = getServiceConfig();
      expect(updatedConfig.metricsRetentionDays).toBe(14);
    });
  });

  describe('error handling', () => {
    it('should handle Redis errors gracefully when recording metrics', async () => {
      const { recordWorkflowMetric, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();
      mockRedis.lpush.mockRejectedValue(new Error('Redis error') as never);

      // Should not throw
      await expect(
        recordWorkflowMetric({
          executionId: 'exec-123',
          workflowId: 'workflow-123',
          userId: 'user-1',
          status: 'completed',
          durationMs: 100,
          stepCount: 1,
          completedSteps: 1,
          failedSteps: 0,
        })
      ).resolves.not.toThrow();
    });

    it('should return default metrics when Redis errors on get', async () => {
      const { getWorkflowMetrics, initializeAgentMetricsService } = await import(
        '../../src/services/agent-metrics.service.js'
      );

      initializeAgentMetricsService();
      mockRedis.lrange.mockRejectedValue(new Error('Redis error') as never);

      const metrics = await getWorkflowMetrics();

      expect(metrics.totalWorkflows).toBe(0);
    });
  });
});
