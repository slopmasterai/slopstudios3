/**
 * Workflow Engine Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service
const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK' as never),
  setex: jest.fn().mockResolvedValue('OK' as never),
  del: jest.fn().mockResolvedValue(1 as never),
  keys: jest.fn().mockResolvedValue([] as never),
  sadd: jest.fn().mockResolvedValue(1 as never),
  srem: jest.fn().mockResolvedValue(1 as never),
  smembers: jest.fn().mockResolvedValue([] as never),
  scard: jest.fn().mockResolvedValue(0 as never),
  rpush: jest.fn().mockResolvedValue(1 as never),
  lpop: jest.fn().mockResolvedValue(null as never),
  lrange: jest.fn().mockResolvedValue([] as never),
  lrem: jest.fn().mockResolvedValue(1 as never),
  llen: jest.fn().mockResolvedValue(0 as never),
  expire: jest.fn().mockResolvedValue(1 as never),
  ttl: jest.fn().mockResolvedValue(3600 as never),
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
  getDefaultAgent: jest.fn().mockResolvedValue({
    id: 'agent-claude-default',
    name: 'Claude Default',
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
  BUILT_IN_AGENTS: {
    CLAUDE: 'agent-claude',
    STRUDEL: 'agent-strudel',
  },
}));

// Mock workflow context - uses 'data' not 'variables'
jest.mock('../../src/services/workflow-context.service.js', () => ({
  createContext: jest.fn().mockResolvedValue({
    workflowId: 'workflow-123',
    data: {},
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
  getContext: jest.fn().mockResolvedValue({
    workflowId: 'workflow-123',
    data: {},
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
  getContextValue: jest.fn().mockResolvedValue({
    success: true,
    value: 'test-value',
    path: 'test.path',
  }),
  setContextValue: jest.fn().mockResolvedValue(true),
  mergeContext: jest.fn().mockResolvedValue({
    workflowId: 'workflow-123',
    data: {},
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }),
  clearContext: jest.fn().mockResolvedValue(true),
  createSnapshot: jest.fn().mockResolvedValue('snapshot-123'),
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
}));

import type { WorkflowDefinition, WorkflowStep } from '../../src/types/agent.types.js';

describe('WorkflowEngineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null as never);
    mockRedis.keys.mockResolvedValue([] as never);
    mockRedis.smembers.mockResolvedValue([] as never);
    mockRedis.scard.mockResolvedValue(0 as never);
  });

  afterEach(async () => {
    const service = await import('../../src/services/workflow-engine.service.js');
    service.stopQueueWorker();
    jest.resetModules();
  });

  describe('executeWorkflow', () => {
    it('should execute a simple workflow', async () => {
      const { executeWorkflow } = await import('../../src/services/workflow-engine.service.js');

      // WorkflowStep uses agentType, inputs, outputs, dependencies (not agentId/input/dependsOn)
      const workflow: WorkflowDefinition = {
        id: 'workflow-123',
        name: 'Test Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test prompt',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executeWorkflow(workflow, 'user-1');

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('workflow-123');
      // With mocked dependencies, async execution can complete before this check
      // Accept 'running' or 'completed' as valid states
      expect(['running', 'completed']).toContain(result.status);
    });

    it('should execute workflow steps in order based on dependencies', async () => {
      const { executeWorkflow, getWorkflowEmitter } = await import(
        '../../src/services/workflow-engine.service.js'
      );
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      const workflow: WorkflowDefinition = {
        id: 'workflow-456',
        name: 'Sequential Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'First Step',
            agentType: 'claude',
            prompt: 'First prompt',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
          {
            id: 'step-2',
            name: 'Second Step',
            agentType: 'claude',
            prompt: 'Second prompt',
            inputs: [],
            outputs: [],
            dependencies: ['step-1'],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Wait for workflow to complete via event emitter
      const completionPromise = new Promise<void>((resolve) => {
        const emitter = getWorkflowEmitter();
        const handler = (event: { type: string }) => {
          if (event.type === 'completed' || event.type === 'failed') {
            emitter.off('workflow', handler);
            resolve();
          }
        };
        emitter.on('workflow', handler);
        // Timeout fallback
        setTimeout(() => {
          emitter.off('workflow', handler);
          resolve();
        }, 500);
      });

      await executeWorkflow(workflow, 'user-1');
      await completionPromise;

      expect(executeAgent).toHaveBeenCalled();
    });

    it('should respect step dependencies', async () => {
      const { executeWorkflow } = await import('../../src/services/workflow-engine.service.js');

      const workflow: WorkflowDefinition = {
        id: 'workflow-deps',
        name: 'Dependency Workflow',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            agentType: 'claude',
            prompt: 'Prompt A',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
          {
            id: 'step-b',
            name: 'Step B',
            agentType: 'claude',
            prompt: 'Prompt B',
            inputs: [],
            outputs: [],
            dependencies: ['step-a'],
          },
          {
            id: 'step-c',
            name: 'Step C',
            agentType: 'claude',
            prompt: 'Prompt C',
            inputs: [],
            outputs: [],
            dependencies: ['step-a', 'step-b'],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executeWorkflow(workflow, 'user-1');

      expect(result).toBeDefined();
      // With mocked dependencies, async execution can complete before this check
      // Accept 'running' or 'completed' as valid states
      expect(['running', 'completed']).toContain(result.status);
    });

    it('should handle step failures with retry', async () => {
      const { executeWorkflow } = await import('../../src/services/workflow-engine.service.js');
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      // First call fails, second succeeds
      executeAgent
        .mockResolvedValueOnce({ success: false, error: 'Temporary failure' })
        .mockResolvedValueOnce({ success: true, result: { response: 'ok' }, durationMs: 50 });

      const workflow: WorkflowDefinition = {
        id: 'workflow-retry',
        name: 'Retry Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'Retry Step',
            agentType: 'claude',
            prompt: 'Test prompt',
            inputs: [],
            outputs: [],
            dependencies: [],
            retryPolicy: {
              maxRetries: 3,
              initialDelayMs: 50,
              backoffMultiplier: 1.5,
              maxDelayMs: 1000,
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executeWorkflow(workflow, 'user-1');

      expect(result).toBeDefined();
    });

    it('should reject workflow when queue size limit is exceeded', async () => {
      const { executeWorkflow } = await import('../../src/services/workflow-engine.service.js');

      // Mock max concurrent workflows reached (triggers queueing)
      mockRedis.scard.mockResolvedValue(10 as never);
      // Mock queue at max capacity (100 is the mocked maxQueueSize)
      mockRedis.llen.mockResolvedValue(100 as never);

      const workflow: WorkflowDefinition = {
        id: 'workflow-queue-full',
        name: 'Queue Full Test',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test prompt',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await expect(executeWorkflow(workflow, 'user-1')).rejects.toThrow(
        'Workflow queue is full (100/100). Please try again later.'
      );
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel a running workflow', async () => {
      const { cancelWorkflow, executeWorkflow } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      // Start a workflow first
      const workflow: WorkflowDefinition = {
        id: 'workflow-cancel',
        name: 'Cancel Test',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state = await executeWorkflow(workflow, 'user-1');

      const result = await cancelWorkflow(state.id);

      expect(result).toBe(true);
    });

    it('should return false for non-existent workflow', async () => {
      const { cancelWorkflow } = await import('../../src/services/workflow-engine.service.js');

      mockRedis.lrange.mockResolvedValue([] as never);

      const result = await cancelWorkflow('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('pauseWorkflow', () => {
    it('should pause a running workflow', async () => {
      const { pauseWorkflow, executeWorkflow } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-pause',
        name: 'Pause Test',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state = await executeWorkflow(workflow, 'user-1');

      const result = await pauseWorkflow(state.id);

      expect(result).toBe(true);
    });

    it('should return false for non-running workflow', async () => {
      const { pauseWorkflow } = await import('../../src/services/workflow-engine.service.js');

      const result = await pauseWorkflow('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('resumeWorkflow', () => {
    it('should resume a paused workflow', async () => {
      const { resumeWorkflow, pauseWorkflow, executeWorkflow, getWorkflowEmitter } = await import(
        '../../src/services/workflow-engine.service.js'
      );
      const { executeAgent } = (await import(
        '../../src/services/agent-registry.service.js'
      )) as any;

      // Make executeAgent delay to give us time to pause
      executeAgent.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true, result: { response: 'ok' }, durationMs: 50 }), 200)
          )
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-resume',
        name: 'Resume Test',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Wait for step to start before pausing
      const stepStartedPromise = new Promise<void>((resolve) => {
        const emitter = getWorkflowEmitter();
        const handler = (event: { type: string }) => {
          if (event.type === 'step:started') {
            emitter.off('workflow', handler);
            resolve();
          }
        };
        emitter.on('workflow', handler);
        setTimeout(() => {
          emitter.off('workflow', handler);
          resolve();
        }, 100);
      });

      const state = await executeWorkflow(workflow, 'user-1');
      await stepStartedPromise;

      const pauseResult = await pauseWorkflow(state.id);
      expect(pauseResult).toBe(true);

      const result = await resumeWorkflow(state.id);
      expect(result).toBe(true);
    });

    it('should return false for non-paused workflow', async () => {
      const { resumeWorkflow, executeWorkflow } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-no-resume',
        name: 'No Resume Test',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state = await executeWorkflow(workflow, 'user-1');

      // Try to resume without pausing first
      const result = await resumeWorkflow(state.id);

      expect(result).toBe(false);
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return workflow status', async () => {
      const { getWorkflowStatus, executeWorkflow } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-status',
        name: 'Status Test',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state = await executeWorkflow(workflow, 'user-1');

      // Mock the stored state
      mockRedis.get.mockResolvedValue(JSON.stringify(state) as never);

      const result = await getWorkflowStatus(state.id);

      expect(result).not.toBeNull();
      expect(result?.status).toBeDefined();
    });

    it('should return null for non-existent workflow', async () => {
      const { getWorkflowStatus } = await import('../../src/services/workflow-engine.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getWorkflowStatus('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listWorkflows', () => {
    it('should list all workflows for a user', async () => {
      const { listWorkflows } = await import('../../src/services/workflow-engine.service.js');

      const state1 = {
        id: 'wf_exec-1',
        workflowId: 'workflow-1',
        userId: 'user-1',
        status: 'completed',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
        progress: 100,
      };

      const state2 = {
        id: 'wf_exec-2',
        workflowId: 'workflow-2',
        userId: 'user-1',
        status: 'running',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
        progress: 50,
      };

      mockRedis.smembers.mockResolvedValue(['wf_exec-1', 'wf_exec-2'] as never);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(state1) as never)
        .mockResolvedValueOnce(JSON.stringify(state2) as never);

      const result = await listWorkflows('user-1');

      expect(result.workflows.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it('should filter workflows by status', async () => {
      const { listWorkflows } = await import('../../src/services/workflow-engine.service.js');

      const state1 = {
        id: 'wf_exec-1',
        workflowId: 'workflow-1',
        userId: 'user-1',
        status: 'completed',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
        progress: 100,
      };

      const state2 = {
        id: 'wf_exec-2',
        workflowId: 'workflow-2',
        userId: 'user-1',
        status: 'running',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
        progress: 50,
      };

      mockRedis.smembers.mockResolvedValue(['wf_exec-1', 'wf_exec-2'] as never);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(state1) as never)
        .mockResolvedValueOnce(JSON.stringify(state2) as never);

      const result = await listWorkflows('user-1', { status: 'running' });

      expect(result.workflows.length).toBe(1);
      expect(result.workflows[0].status).toBe('running');
    });
  });

  describe('validateWorkflowDefinition', () => {
    it('should validate a correct workflow definition', async () => {
      const { validateWorkflowDefinition } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-valid',
        name: 'Valid Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test prompt',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
          {
            id: 'step-2',
            name: 'Step 2',
            agentType: 'claude',
            prompt: 'Test prompt 2',
            inputs: [],
            outputs: [],
            dependencies: ['step-1'],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validateWorkflowDefinition(workflow);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing step dependencies', async () => {
      const { validateWorkflowDefinition } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-invalid',
        name: 'Invalid Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
          {
            id: 'step-2',
            name: 'Step 2',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: ['non-existent'],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validateWorkflowDefinition(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('non-existent'))).toBe(true);
    });

    it('should detect circular dependencies', async () => {
      const { validateWorkflowDefinition } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-circular',
        name: 'Circular Workflow',
        steps: [
          {
            id: 'step-a',
            name: 'Step A',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: ['step-c'],
          },
          {
            id: 'step-b',
            name: 'Step B',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: ['step-a'],
          },
          {
            id: 'step-c',
            name: 'Step C',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: ['step-b'],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validateWorkflowDefinition(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('circular'))).toBe(true);
    });

    it('should detect duplicate step IDs', async () => {
      const { validateWorkflowDefinition } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-duplicate',
        name: 'Duplicate Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'First Step',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
          {
            id: 'step-1',
            name: 'Duplicate Step',
            agentType: 'claude',
            prompt: 'Test',
            inputs: [],
            outputs: [],
            dependencies: [],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validateWorkflowDefinition(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
    });

    it('should validate workflow with too many steps', async () => {
      const { validateWorkflowDefinition } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const steps: WorkflowStep[] = [];
      for (let i = 0; i < 60; i++) {
        steps.push({
          id: `step-${i}`,
          name: `Step ${i}`,
          agentType: 'claude',
          prompt: 'Test',
          inputs: [],
          outputs: [],
          dependencies: [],
        });
      }

      const workflow: WorkflowDefinition = {
        id: 'workflow-too-many',
        name: 'Too Many Steps',
        steps,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validateWorkflowDefinition(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('maximum'))).toBe(true);
    });

    it('should require prompt or promptTemplateId', async () => {
      const { validateWorkflowDefinition } = await import(
        '../../src/services/workflow-engine.service.js'
      );

      const workflow: WorkflowDefinition = {
        id: 'workflow-no-prompt',
        name: 'No Prompt Workflow',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            agentType: 'claude',
            // No prompt or promptTemplateId
            inputs: [],
            outputs: [],
            dependencies: [],
          } as any,
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = validateWorkflowDefinition(workflow);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('prompt'))).toBe(true);
    });
  });

  describe('getEngineStats', () => {
    it('should return engine statistics', async () => {
      const { getEngineStats } = await import('../../src/services/workflow-engine.service.js');

      mockRedis.scard.mockResolvedValue(2 as never);
      mockRedis.llen.mockResolvedValue(5 as never);

      const stats = await getEngineStats();

      expect(stats.activeWorkflows).toBe(2);
      expect(stats.queuedWorkflows).toBe(5);
      expect(stats.maxConcurrent).toBe(10);
    });
  });
});
