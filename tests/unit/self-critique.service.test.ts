/**
 * Self-Critique Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-deprecated */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service
const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK' as never),
  setex: jest.fn().mockResolvedValue('OK' as never),
  del: jest.fn().mockResolvedValue(1 as never),
  rpush: jest.fn().mockResolvedValue(1 as never),
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
    collaboration: {
      critique: {
        maxIterations: 5,
        defaultThreshold: 0.8,
        timeoutMs: 600000,
      },
    },
  },
}));

// Mock agent registry
const mockExecuteAgent = jest.fn();
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
  executeAgent: mockExecuteAgent,
}));

// Mock metrics
const mockGetSelfCritiqueMetrics = jest.fn();
jest.mock('../../src/services/agent-metrics.service.js', () => ({
  recordAgentMetric: jest.fn(),
  recordCritiqueMetric: jest.fn(),
  getSelfCritiqueMetrics: mockGetSelfCritiqueMetrics,
}));

// Mock prompt template service
jest.mock('../../src/services/prompt-template.service.js', () => ({
  interpolateTemplate: jest.fn().mockResolvedValue({
    success: true,
    content: 'Interpolated content',
  }),
}));

// Mock workflow context service
jest.mock('../../src/services/workflow-context.service.js', () => ({
  createContext: jest.fn().mockResolvedValue(undefined),
  setContextValue: jest.fn().mockResolvedValue(undefined),
  getContext: jest.fn().mockResolvedValue({}),
  clearContext: jest.fn().mockResolvedValue(undefined),
}));

import type { SelfCritiqueConfig, QualityCriterion } from '../../src/types/agent.types.js';

describe('SelfCritiqueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null as never);

    // Reset mock implementation to clear any queued mockResolvedValueOnce values
    mockExecuteAgent.mockReset();

    // Default mock for agent execution - returns content with evaluatable JSON
    mockExecuteAgent.mockResolvedValue({
      success: true,
      result: 'Test output content',
      durationMs: 100,
    });
  });

  afterEach(async () => {
    jest.resetModules();
  });

  describe('calculateOverallScore', () => {
    it('should calculate weighted average score', async () => {
      const { calculateOverallScore } = await import('../../src/services/self-critique.service.js');

      const criteriaScores = {
        clarity: 0.8,
        accuracy: 0.6,
        completeness: 0.9,
      };

      const criteria: QualityCriterion[] = [
        { name: 'clarity', description: 'Clear', evaluationPrompt: 'Rate', weight: 0.3, threshold: 0.7 },
        { name: 'accuracy', description: 'Accurate', evaluationPrompt: 'Rate', weight: 0.5, threshold: 0.8 },
        { name: 'completeness', description: 'Complete', evaluationPrompt: 'Rate', weight: 0.2, threshold: 0.7 },
      ];

      const score = calculateOverallScore(criteriaScores, criteria);

      // (0.8 * 0.3 + 0.6 * 0.5 + 0.9 * 0.2) / 1.0 = 0.24 + 0.3 + 0.18 = 0.72
      expect(score).toBeCloseTo(0.72, 2);
    });

    it('should handle missing criteria scores', async () => {
      const { calculateOverallScore } = await import('../../src/services/self-critique.service.js');

      const criteriaScores = {
        clarity: 0.8,
        // accuracy missing
      };

      const criteria: QualityCriterion[] = [
        { name: 'clarity', description: 'Clear', evaluationPrompt: 'Rate', weight: 0.5, threshold: 0.7 },
        { name: 'accuracy', description: 'Accurate', evaluationPrompt: 'Rate', weight: 0.5, threshold: 0.8 },
      ];

      const score = calculateOverallScore(criteriaScores, criteria);

      // (0.8 * 0.5 + 0 * 0.5) / 1.0 = 0.4
      expect(score).toBeCloseTo(0.4, 2);
    });

    it('should return 0 when no criteria', async () => {
      const { calculateOverallScore } = await import('../../src/services/self-critique.service.js');

      const score = calculateOverallScore({}, []);

      expect(score).toBe(0);
    });
  });

  describe('generateImprovementPrompt', () => {
    it('should generate improvement prompt from critique', async () => {
      const { generateImprovementPrompt } = await import('../../src/services/self-critique.service.js');

      const output = 'Original output text';
      const critique = {
        overallScore: 0.6,
        criteriaScores: { clarity: 0.5, accuracy: 0.7 },
        feedback: 'Needs more clarity in the explanation',
        meetsThreshold: false,
      };

      const prompt = await generateImprovementPrompt(output, critique);

      expect(prompt).toContain('Original output text');
      expect(prompt).toContain('Needs more clarity');
      expect(prompt).toContain('clarity');
      expect(prompt).toContain('accuracy');
    });

    it('should use custom template when provided', async () => {
      const { generateImprovementPrompt } = await import('../../src/services/self-critique.service.js');

      const output = 'Test output';
      const critique = {
        overallScore: 0.7,
        criteriaScores: { quality: 0.7 },
        feedback: 'Good but needs work',
        meetsThreshold: false,
      };
      const customTemplate = 'Custom: {{output}} - Feedback: {{feedback}}';

      const prompt = await generateImprovementPrompt(output, critique, customTemplate);

      expect(prompt).toContain('Custom:');
      expect(prompt).toContain('Test output');
      expect(prompt).toContain('Good but needs work');
    });
  });

  describe('evaluateOutput', () => {
    it('should evaluate output and return scores', async () => {
      const { evaluateOutput } = await import('../../src/services/self-critique.service.js');

      // Mock agent to return evaluation JSON
      mockExecuteAgent.mockResolvedValueOnce({
        success: true,
        result: JSON.stringify({
          criteriaScores: { clarity: 0.8, accuracy: 0.9 },
          feedback: 'Good output overall',
          suggestions: ['Add more details'],
        }),
        durationMs: 100,
      });

      const criteria: QualityCriterion[] = [
        { name: 'clarity', description: 'Clear', evaluationPrompt: 'Rate', weight: 0.5, threshold: 0.7 },
        { name: 'accuracy', description: 'Accurate', evaluationPrompt: 'Rate', weight: 0.5, threshold: 0.8 },
      ];

      const evaluation = await evaluateOutput('Test content', criteria, 'agent-1', 'user-1');

      expect(evaluation.criteriaScores.clarity).toBe(0.8);
      expect(evaluation.criteriaScores.accuracy).toBe(0.9);
      expect(evaluation.feedback).toBe('Good output overall');
      expect(evaluation.overallScore).toBeCloseTo(0.85, 2);
    });

    it('should handle evaluation failure gracefully', async () => {
      const { evaluateOutput } = await import('../../src/services/self-critique.service.js');

      mockExecuteAgent.mockResolvedValueOnce({
        success: false,
        error: 'Agent failed',
        durationMs: 100,
      });

      const criteria: QualityCriterion[] = [
        { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.7 },
      ];

      await expect(evaluateOutput('Test', criteria, 'agent-1', 'user-1')).rejects.toThrow('Evaluation failed');
    });

    it('should handle malformed JSON response', async () => {
      const { evaluateOutput } = await import('../../src/services/self-critique.service.js');

      mockExecuteAgent.mockResolvedValueOnce({
        success: true,
        result: 'This is not JSON at all',
        durationMs: 100,
      });

      const criteria: QualityCriterion[] = [
        { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.7 },
      ];

      const evaluation = await evaluateOutput('Test', criteria, 'agent-1', 'user-1');

      // Should return default scores when parsing fails
      expect(evaluation.overallScore).toBe(0.5);
      expect(evaluation.meetsThreshold).toBe(false);
    });
  });

  describe('executeSelfCritique', () => {
    it('should execute self-critique and return result', async () => {
      const { executeSelfCritique } = await import('../../src/services/self-critique.service.js');

      // First call: task execution
      mockExecuteAgent.mockResolvedValueOnce({
        success: true,
        result: 'Initial output',
        durationMs: 100,
      });

      // Second call: evaluation
      mockExecuteAgent.mockResolvedValueOnce({
        success: true,
        result: JSON.stringify({
          criteriaScores: { clarity: 0.9, accuracy: 0.95 },
          feedback: 'Excellent output',
        }),
        durationMs: 100,
      });

      const config: SelfCritiqueConfig = {
        maxIterations: 3,
        qualityCriteria: [
          { name: 'clarity', description: 'Clear', evaluationPrompt: 'Rate', weight: 0.5, threshold: 0.8 },
          { name: 'accuracy', description: 'Accurate', evaluationPrompt: 'Rate', weight: 0.5, threshold: 0.9 },
        ],
        stopOnQualityThreshold: 0.85,
      };

      const result = await executeSelfCritique(
        {
          userId: 'user-1',
          pattern: 'self-critique',
          tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Write something' }],
        },
        config
      );

      expect(result.pattern).toBe('self-critique');
      expect(result.iterations.length).toBeGreaterThan(0);
      expect(result.finalOutput).toBeDefined();
      expect(result.finalScore).toBeGreaterThan(0);
    });

    it('should iterate until quality threshold is met', async () => {
      const { executeSelfCritique } = await import('../../src/services/self-critique.service.js');

      // First iteration: low score
      mockExecuteAgent
        .mockResolvedValueOnce({ success: true, result: 'Initial output', durationMs: 100 })
        .mockResolvedValueOnce({
          success: true,
          result: JSON.stringify({ criteriaScores: { quality: 0.5 }, feedback: 'Needs improvement' }),
          durationMs: 100,
        });

      // Second iteration: improved score
      mockExecuteAgent
        .mockResolvedValueOnce({ success: true, result: 'Improved output', durationMs: 100 })
        .mockResolvedValueOnce({
          success: true,
          result: JSON.stringify({ criteriaScores: { quality: 0.95 }, feedback: 'Great!' }),
          durationMs: 100,
        });

      const config: SelfCritiqueConfig = {
        maxIterations: 5,
        qualityCriteria: [
          { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.9 },
        ],
        stopOnQualityThreshold: 0.9,
      };

      const result = await executeSelfCritique(
        {
          userId: 'user-1',
          pattern: 'self-critique',
          tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Write something' }],
        },
        config
      );

      expect(result.converged).toBe(true);
      expect(result.iterations.length).toBe(2);
      expect(result.finalScore).toBeGreaterThanOrEqual(0.9);
    });

    it('should stop at max iterations if threshold not met', async () => {
      const { executeSelfCritique } = await import('../../src/services/self-critique.service.js');

      // All iterations return low scores
      for (let i = 0; i < 6; i++) {
        mockExecuteAgent
          .mockResolvedValueOnce({ success: true, result: `Output ${i}`, durationMs: 100 })
          .mockResolvedValueOnce({
            success: true,
            result: JSON.stringify({ criteriaScores: { quality: 0.5 }, feedback: 'Still needs work' }),
            durationMs: 100,
          });
      }

      const config: SelfCritiqueConfig = {
        maxIterations: 3,
        qualityCriteria: [
          { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.9 },
        ],
        stopOnQualityThreshold: 0.9,
      };

      const result = await executeSelfCritique(
        {
          userId: 'user-1',
          pattern: 'self-critique',
          tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Write something' }],
        },
        config
      );

      expect(result.converged).toBe(false);
      expect(result.iterations.length).toBe(3);
    });

    it('should handle task execution failure with failed status and error', async () => {
      const { executeSelfCritique } = await import('../../src/services/self-critique.service.js');

      mockExecuteAgent.mockResolvedValueOnce({
        success: false,
        error: 'Task failed',
        durationMs: 100,
      });

      const config: SelfCritiqueConfig = {
        maxIterations: 3,
        qualityCriteria: [
          { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.8 },
        ],
      };

      const result = await executeSelfCritique(
        {
          userId: 'user-1',
          pattern: 'self-critique',
          tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Write something' }],
        },
        config
      );

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Task failed');
      expect(result.iterations.length).toBe(0);
      expect(result.converged).toBe(false);
    });

    it('should throw error when no task is provided', async () => {
      const { executeSelfCritique } = await import('../../src/services/self-critique.service.js');

      const config: SelfCritiqueConfig = {
        maxIterations: 3,
        qualityCriteria: [
          { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.8 },
        ],
      };

      await expect(
        executeSelfCritique(
          {
            userId: 'user-1',
            pattern: 'self-critique',
            tasks: [],
          },
          config
        )
      ).rejects.toThrow('requires at least one task');
    });
  });

  describe('getCritiqueResult', () => {
    it('should retrieve stored critique result', async () => {
      const { getCritiqueResult } = await import('../../src/services/self-critique.service.js');

      const storedResult = {
        id: 'critique_123',
        status: 'completed',
        pattern: 'self-critique',
        iterations: [],
        finalOutput: 'Final result',
        finalScore: 0.9,
        converged: true,
        durationMs: 1000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        taskResults: [],
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(storedResult) as never);

      const result = await getCritiqueResult('critique_123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('critique_123');
      expect(result?.converged).toBe(true);
    });

    it('should return null for non-existent result', async () => {
      const { getCritiqueResult } = await import('../../src/services/self-critique.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getCritiqueResult('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getCritiqueIterations', () => {
    it('should retrieve critique iterations', async () => {
      const { getCritiqueIterations } = await import('../../src/services/self-critique.service.js');

      const iterations = [
        JSON.stringify({
          iteration: 1,
          output: 'First output',
          critique: { overallScore: 0.6 },
          durationMs: 100,
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          iteration: 2,
          output: 'Second output',
          critique: { overallScore: 0.9 },
          durationMs: 100,
          timestamp: new Date().toISOString(),
        }),
      ];

      mockRedis.lrange.mockResolvedValue(iterations as never);

      const result = await getCritiqueIterations('critique_123');

      expect(result).toHaveLength(2);
      expect(result[0].iteration).toBe(1);
      expect(result[1].iteration).toBe(2);
    });
  });

  describe('getCritiqueMetrics', () => {
    it('should return critique metrics from metrics service', async () => {
      const { getCritiqueMetrics } = await import('../../src/services/self-critique.service.js');

      // Configure mock to return specific metrics
      mockGetSelfCritiqueMetrics.mockResolvedValueOnce({
        totalExecutions: 2,
        avgIterations: 3,
        convergenceRate: 0.5,
        avgQualityImprovement: 0.2,
        avgDurationMs: 7500,
      });

      const result = await getCritiqueMetrics();

      expect(result.totalExecutions).toBe(2);
      expect(result.avgIterations).toBe(3);
      expect(result.convergenceRate).toBe(0.5);
      expect(result.avgQualityImprovement).toBe(0.2);
    });

    it('should return empty metrics when no data', async () => {
      const { getCritiqueMetrics } = await import('../../src/services/self-critique.service.js');

      // Configure mock to return empty metrics
      mockGetSelfCritiqueMetrics.mockResolvedValueOnce({
        totalExecutions: 0,
        avgIterations: 0,
        convergenceRate: 0,
        avgQualityImprovement: 0,
        avgDurationMs: 0,
      });

      const result = await getCritiqueMetrics();

      expect(result.totalExecutions).toBe(0);
      expect(result.avgIterations).toBe(0);
      expect(result.convergenceRate).toBe(0);
    });
  });

  describe('event emission', () => {
    it('should emit iteration event', async () => {
      const { executeSelfCritique, critiqueEvents } = await import(
        '../../src/services/self-critique.service.js'
      );

      const iterationHandler = jest.fn();
      critiqueEvents.on('agent:critique:iteration', iterationHandler);

      mockExecuteAgent
        .mockResolvedValueOnce({ success: true, result: 'Output', durationMs: 100 })
        .mockResolvedValueOnce({
          success: true,
          result: JSON.stringify({ criteriaScores: { quality: 0.9 }, feedback: 'Good' }),
          durationMs: 100,
        });

      const config: SelfCritiqueConfig = {
        maxIterations: 1,
        qualityCriteria: [
          { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.9 },
        ],
      };

      await executeSelfCritique(
        {
          userId: 'user-1',
          pattern: 'self-critique',
          tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Test' }],
        },
        config
      );

      expect(iterationHandler).toHaveBeenCalled();
      critiqueEvents.off('agent:critique:iteration', iterationHandler);
    });

    it('should emit converged event when threshold is met', async () => {
      const { executeSelfCritique, critiqueEvents } = await import(
        '../../src/services/self-critique.service.js'
      );

      const convergedHandler = jest.fn();
      critiqueEvents.on('agent:critique:converged', convergedHandler);

      mockExecuteAgent
        .mockResolvedValueOnce({ success: true, result: 'Output', durationMs: 100 })
        .mockResolvedValueOnce({
          success: true,
          result: JSON.stringify({ criteriaScores: { quality: 0.95 }, feedback: 'Excellent' }),
          durationMs: 100,
        });

      const config: SelfCritiqueConfig = {
        maxIterations: 3,
        qualityCriteria: [
          { name: 'quality', description: 'Quality', evaluationPrompt: 'Rate', weight: 1, threshold: 0.9 },
        ],
        stopOnQualityThreshold: 0.9,
      };

      await executeSelfCritique(
        {
          userId: 'user-1',
          pattern: 'self-critique',
          tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Test' }],
        },
        config
      );

      expect(convergedHandler).toHaveBeenCalled();
      critiqueEvents.off('agent:critique:converged', convergedHandler);
    });
  });
});
