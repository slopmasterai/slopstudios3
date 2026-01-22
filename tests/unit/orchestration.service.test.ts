/**
 * Orchestration Service Unit Tests
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
  keys: jest.fn().mockResolvedValue([] as never),
  hset: jest.fn().mockResolvedValue(1 as never),
  hget: jest.fn().mockResolvedValue(null as never),
  hgetall: jest.fn().mockResolvedValue({} as never),
  lpush: jest.fn().mockResolvedValue(1 as never),
  lrange: jest.fn().mockResolvedValue([] as never),
  expire: jest.fn().mockResolvedValue(1 as never),
  ltrim: jest.fn().mockResolvedValue('OK' as never),
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

// Mock config
jest.mock('../../src/config/server.config.js', () => ({
  serverConfig: {
    agent: {
      maxConcurrentWorkflows: 10,
      workflowTimeoutMs: 600000,
      enableQueue: true,
      maxQueueSize: 100,
      maxWorkflowSteps: 50,
      contextTtlSeconds: 3600,
      enableParallelExecution: true,
      maxParallelSteps: 5,
    },
  },
}));

// Mock agent registry - status is 'idle' not 'available'
jest.mock('../../src/services/agent-registry.service.js', () => ({
  getAgent: jest.fn().mockResolvedValue({
    id: 'agent-1',
    name: 'Test Agent',
    type: 'custom',
    status: 'idle',
    capabilities: [],
    config: {},
    metadata: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
  getDefaultAgent: jest.fn().mockResolvedValue({
    id: 'agent-default',
    name: 'Default Agent',
    type: 'claude',
    status: 'idle',
    capabilities: [],
    config: {},
    metadata: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
  executeAgent: jest.fn().mockResolvedValue({
    success: true,
    result: { response: 'executed' },
    durationMs: 100,
  }),
  listAgents: jest.fn().mockResolvedValue([
    {
      id: 'agent-1',
      name: 'Test Agent',
      type: 'custom',
      status: 'idle',
      capabilities: [],
    },
  ]),
}));

// Mock prompt template service
jest.mock('../../src/services/prompt-template.service.js', () => ({
  getTemplate: jest.fn().mockResolvedValue({
    id: 'tpl_test',
    name: 'Test Template',
    content: 'Hello {{name}}!',
    variables: [{ name: 'name', type: 'string', required: true }],
    category: 'user',
    version: 1,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
  interpolateTemplate: jest.fn().mockResolvedValue({
    success: true,
    content: 'Hello World!',
  }),
}));

// Mock metrics
jest.mock('../../src/services/agent-metrics.service.js', () => ({
  recordWorkflowMetric: jest.fn(),
  recordStepMetric: jest.fn(),
  recordAgentMetric: jest.fn(),
}));

import type { OrchestrationRequest, OrchestrationTask } from '../../src/types/agent.types.js';

describe('OrchestrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null as never);
  });

  afterEach(async () => {
    jest.resetModules();
  });

  describe('orchestrate', () => {
    it('should orchestrate a sequential request', async () => {
      const { orchestrate } = await import('../../src/services/orchestration.service.js');

      // OrchestrationRequest uses tasks (not steps) with agentType (not agentId)
      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'sequential',
        tasks: [
          { id: 'task-1', agentType: 'claude', prompt: 'step 1' },
          { id: 'task-2', agentType: 'claude', prompt: 'step 2' },
        ],
      };

      const result = await orchestrate(request);

      expect(result.status).toBe('completed');
      expect(result.pattern).toBe('sequential');
      expect(result.taskResults).toHaveLength(2);
    });

    it('should handle different patterns', async () => {
      const { orchestrate } = await import('../../src/services/orchestration.service.js');

      const patterns: Array<OrchestrationRequest['pattern']> = [
        'sequential',
        'parallel',
      ];

      for (const pattern of patterns) {
        const request: OrchestrationRequest = {
          userId: 'user-1',
          pattern,
          tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'test' }],
        };

        const result = await orchestrate(request);

        expect(result.status).toBe('completed');
      }
    });
  });

  describe('orchestrateSequential', () => {
    it('should execute tasks in sequence', async () => {
      const { orchestrateSequential } = await import(
        '../../src/services/orchestration.service.js'
      );
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'sequential',
        tasks: [
          { id: 'task-1', agentType: 'claude', prompt: 'prompt 1' },
          { id: 'task-2', agentType: 'claude', prompt: 'prompt 2' },
          { id: 'task-3', agentType: 'claude', prompt: 'prompt 3' },
        ],
      };

      const result = await orchestrateSequential(request);

      expect(result.status).toBe('completed');
      expect(executeAgent).toHaveBeenCalledTimes(3);
      expect(result.taskResults).toHaveLength(3);
    });

    it('should pass context between tasks', async () => {
      const { orchestrateSequential } = await import(
        '../../src/services/orchestration.service.js'
      );
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      executeAgent
        .mockResolvedValueOnce({ success: true, result: { value: 'first' }, durationMs: 50 })
        .mockResolvedValueOnce({ success: true, result: { value: 'second' }, durationMs: 50 });

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'sequential',
        tasks: [
          { id: 'task-1', agentType: 'claude', prompt: 'start' },
          { id: 'task-2', agentType: 'claude', prompt: 'continue with {{_lastResult}}' },
        ],
        context: {},
      };

      const result = await orchestrateSequential(request);

      expect(result.status).toBe('completed');
      expect(result.taskResults).toHaveLength(2);
    });

    it('should stop on failure', async () => {
      const { orchestrateSequential } = await import(
        '../../src/services/orchestration.service.js'
      );
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      executeAgent
        .mockResolvedValueOnce({ success: true, result: {}, durationMs: 50 })
        .mockResolvedValueOnce({ success: false, error: 'Failed', durationMs: 50 })
        .mockResolvedValueOnce({ success: true, result: {}, durationMs: 50 });

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'sequential',
        tasks: [
          { id: 'task-1', agentType: 'claude', prompt: 'prompt 1' },
          { id: 'task-2', agentType: 'claude', prompt: 'prompt 2' },
          { id: 'task-3', agentType: 'claude', prompt: 'prompt 3' },
        ],
      };

      const result = await orchestrateSequential(request);

      expect(result.status).toBe('failed');
      // Third task should not be called
      expect(executeAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe('orchestrateParallel', () => {
    it('should execute tasks in parallel', async () => {
      const { orchestrateParallel } = await import('../../src/services/orchestration.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'parallel',
        tasks: [
          { id: 'task-a', agentType: 'claude', prompt: 'task a' },
          { id: 'task-b', agentType: 'claude', prompt: 'task b' },
          { id: 'task-c', agentType: 'claude', prompt: 'task c' },
        ],
      };

      const result = await orchestrateParallel(request);

      expect(result.status).toBe('completed');
      expect(executeAgent).toHaveBeenCalledTimes(3);
      expect(result.taskResults).toHaveLength(3);
    });

    it('should respect maxParallel option', async () => {
      const { orchestrateParallel } = await import('../../src/services/orchestration.service.js');

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'parallel',
        tasks: [
          { id: 'task-1', agentType: 'claude', prompt: 'task 1' },
          { id: 'task-2', agentType: 'claude', prompt: 'task 2' },
          { id: 'task-3', agentType: 'claude', prompt: 'task 3' },
          { id: 'task-4', agentType: 'claude', prompt: 'task 4' },
        ],
        options: { maxParallel: 2 },
      };

      const result = await orchestrateParallel(request);

      expect(result.status).toBe('completed');
      expect(result.taskResults).toHaveLength(4);
    });

    it('should collect all results even with failures', async () => {
      const { orchestrateParallel } = await import('../../src/services/orchestration.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      executeAgent
        .mockResolvedValueOnce({ success: true, result: { result: 1 }, durationMs: 50 })
        .mockResolvedValueOnce({ success: false, error: 'Failed', durationMs: 50 })
        .mockResolvedValueOnce({ success: true, result: { result: 3 }, durationMs: 50 });

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'parallel',
        tasks: [
          { id: 'task-1', agentType: 'claude', prompt: 'prompt 1' },
          { id: 'task-2', agentType: 'claude', prompt: 'prompt 2' },
          { id: 'task-3', agentType: 'claude', prompt: 'prompt 3' },
        ],
      };

      const result = await orchestrateParallel(request);

      expect(result.taskResults).toHaveLength(3);
      // At least one failure means overall status is failed
      expect(result.status).toBe('failed');
    });
  });

  describe('orchestrateConditional', () => {
    it('should execute task when condition is true', async () => {
      const { orchestrateConditional } = await import(
        '../../src/services/orchestration.service.js'
      );
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'conditional',
        tasks: [
          { id: 'task-yes', agentType: 'claude', prompt: 'yes branch', condition: 'context.flag === true' },
          { id: 'task-no', agentType: 'claude', prompt: 'no branch' },
        ],
        context: { flag: true },
      };

      const result = await orchestrateConditional(request);

      expect(result.status).toBe('completed');
      expect(executeAgent).toHaveBeenCalledTimes(1);
    });

    it('should execute fallback task when no condition matches', async () => {
      const { orchestrateConditional } = await import(
        '../../src/services/orchestration.service.js'
      );
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'conditional',
        tasks: [
          { id: 'task-conditional', agentType: 'claude', prompt: 'conditional', condition: 'context.flag === true' },
          { id: 'task-fallback', agentType: 'claude', prompt: 'fallback' }, // No condition = fallback
        ],
        context: { flag: false },
      };

      const result = await orchestrateConditional(request);

      expect(result.status).toBe('completed');
      expect(executeAgent).toHaveBeenCalledTimes(1);
    });

    it('should return completed with no tasks when no condition matches and no fallback', async () => {
      const { orchestrateConditional } = await import(
        '../../src/services/orchestration.service.js'
      );

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'conditional',
        tasks: [
          { id: 'task-1', agentType: 'claude', prompt: 'prompt 1', condition: 'context.value === 1' },
          { id: 'task-2', agentType: 'claude', prompt: 'prompt 2', condition: 'context.value === 2' },
        ],
        context: { value: 3 },
      };

      const result = await orchestrateConditional(request);

      expect(result.status).toBe('completed');
      expect(result.taskResults).toHaveLength(0);
    });
  });

  describe('orchestrateMapReduce', () => {
    it('should map over items and execute tasks', async () => {
      const { orchestrateMapReduce } = await import('../../src/services/orchestration.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      executeAgent
        .mockResolvedValueOnce({ success: true, result: { value: 1 }, durationMs: 50 })
        .mockResolvedValueOnce({ success: true, result: { value: 2 }, durationMs: 50 })
        .mockResolvedValueOnce({ success: true, result: { value: 3 }, durationMs: 50 })
        .mockResolvedValueOnce({ success: true, result: { sum: 6 }, durationMs: 50 });

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'map-reduce',
        tasks: [
          { id: 'map', agentType: 'claude', prompt: 'process {{_item}}' },
          { id: 'reduce', agentType: 'claude', prompt: 'reduce {{_mapResults}}' },
        ],
        options: { items: ['a', 'b', 'c'] },
      };

      const result = await orchestrateMapReduce(request);

      expect(result.status).toBe('completed');
      // 3 map + 1 reduce = 4 calls
      expect(executeAgent).toHaveBeenCalledTimes(4);
    });

    it('should fail if no map task is provided', async () => {
      const { orchestrateMapReduce } = await import('../../src/services/orchestration.service.js');

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'map-reduce',
        tasks: [
          { id: 'other', agentType: 'claude', prompt: 'other task' },
        ],
        options: { items: ['a', 'b'] },
      };

      await expect(orchestrateMapReduce(request)).rejects.toThrow('map');
    });

    it('should fail if no items are provided', async () => {
      const { orchestrateMapReduce } = await import('../../src/services/orchestration.service.js');

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'map-reduce',
        tasks: [
          { id: 'map', agentType: 'claude', prompt: 'process' },
        ],
        options: { items: [] },
      };

      await expect(orchestrateMapReduce(request)).rejects.toThrow('items');
    });

    it('should fail if map phase fails', async () => {
      const { orchestrateMapReduce } = await import('../../src/services/orchestration.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      executeAgent
        .mockResolvedValueOnce({ success: true, result: { value: 1 }, durationMs: 50 })
        .mockResolvedValueOnce({ success: false, error: 'Map failed', durationMs: 50 });

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'map-reduce',
        tasks: [
          { id: 'map', agentType: 'claude', prompt: 'process {{_item}}' },
          { id: 'reduce', agentType: 'claude', prompt: 'reduce' },
        ],
        options: { items: [1, 2] },
      };

      const result = await orchestrateMapReduce(request);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('map');
    });
  });

  describe('chain helper', () => {
    it('should chain multiple agent calls sequentially', async () => {
      const { chain } = await import('../../src/services/orchestration.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      const result = await chain(
        'user-1',
        { agentType: 'claude', prompt: 'step 1' },
        { agentType: 'claude', prompt: 'step 2' }
      );

      expect(result.status).toBe('completed');
      expect(executeAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe('parallel helper', () => {
    it('should execute multiple agents in parallel', async () => {
      const { parallel } = await import('../../src/services/orchestration.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      const result = await parallel(
        'user-1',
        { agentType: 'claude', prompt: 'task a' },
        { agentType: 'claude', prompt: 'task b' }
      );

      expect(result.status).toBe('completed');
      expect(executeAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe('getOrchestrationResult', () => {
    it('should retrieve a stored orchestration result', async () => {
      const { getOrchestrationResult } = await import('../../src/services/orchestration.service.js');

      const storedResult = {
        id: 'orch_123',
        status: 'completed',
        pattern: 'sequential',
        taskResults: [],
        durationMs: 100,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(storedResult) as never);

      const result = await getOrchestrationResult('orch_123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('orch_123');
      expect(result?.status).toBe('completed');
    });

    it('should return null for non-existent result', async () => {
      const { getOrchestrationResult } = await import('../../src/services/orchestration.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getOrchestrationResult('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getOrchestrationMetrics', () => {
    it('should return orchestration metrics', async () => {
      const { getOrchestrationMetrics } = await import('../../src/services/orchestration.service.js');

      const storedMetrics = [
        JSON.stringify({
          id: 'orch_1',
          pattern: 'sequential',
          status: 'completed',
          durationMs: 100,
          taskCount: 2,
          successCount: 2,
          failCount: 0,
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          id: 'orch_2',
          pattern: 'parallel',
          status: 'failed',
          durationMs: 200,
          taskCount: 3,
          successCount: 2,
          failCount: 1,
          timestamp: new Date().toISOString(),
        }),
      ];

      mockRedis.lrange.mockResolvedValue(storedMetrics as never);

      const metrics = await getOrchestrationMetrics(100);

      expect(metrics.total).toBe(2);
      expect(metrics.byPattern.sequential).toBe(1);
      expect(metrics.byPattern.parallel).toBe(1);
      expect(metrics.byStatus.completed).toBe(1);
      expect(metrics.byStatus.failed).toBe(1);
    });

    it('should return empty metrics when no data', async () => {
      const { getOrchestrationMetrics } = await import('../../src/services/orchestration.service.js');

      mockRedis.lrange.mockResolvedValue([] as never);

      const metrics = await getOrchestrationMetrics();

      expect(metrics.total).toBe(0);
      expect(metrics.avgDurationMs).toBe(0);
      expect(metrics.successRate).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle agent execution errors gracefully', async () => {
      const { orchestrate } = await import('../../src/services/orchestration.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      executeAgent.mockRejectedValue(new Error('Agent crashed'));

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'sequential',
        tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'test' }],
      };

      const result = await orchestrate(request);

      expect(result.status).toBe('failed');
      expect(result.taskResults[0].error).toBeDefined();
    });

    it('should handle invalid agent ID', async () => {
      const { orchestrateSequential } = await import(
        '../../src/services/orchestration.service.js'
      );
      const { getAgent, getDefaultAgent } = (await import('../../src/services/agent-registry.service.js')) as any;

      getAgent.mockResolvedValue(null);
      getDefaultAgent.mockResolvedValue(null);

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'sequential',
        tasks: [{ id: 'task-1', agentId: 'non-existent', agentType: 'custom', prompt: 'test' }],
      };

      const result = await orchestrateSequential(request);

      expect(result.status).toBe('failed');
    });

    it('should handle task without prompt or template', async () => {
      const { orchestrateSequential } = await import(
        '../../src/services/orchestration.service.js'
      );

      const request: OrchestrationRequest = {
        userId: 'user-1',
        pattern: 'sequential',
        tasks: [{ id: 'task-1', agentType: 'claude' } as any], // No prompt or promptTemplateId
      };

      const result = await orchestrateSequential(request);

      expect(result.status).toBe('failed');
      expect(result.taskResults[0].error).toContain('prompt');
    });
  });
});
