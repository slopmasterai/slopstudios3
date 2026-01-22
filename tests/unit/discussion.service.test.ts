/**
 * Discussion Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
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
      discussion: {
        maxRounds: 5,
        maxParticipants: 10,
        convergenceThreshold: 0.85,
        timeoutMs: 900000,
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
const mockGetDiscussionMetrics = jest.fn().mockResolvedValue({
  totalExecutions: 0,
  avgRounds: 0,
  convergenceRate: 0,
  avgConsensusScore: 0,
  avgParticipants: 0,
  avgDurationMs: 0,
});
jest.mock('../../src/services/agent-metrics.service.js', () => ({
  recordAgentMetric: jest.fn(),
  recordDiscussionMetric: jest.fn(),
  getDiscussionMetrics: mockGetDiscussionMetrics,
}));

// Mock workflow context service
jest.mock('../../src/services/workflow-context.service.js', () => ({
  createContext: jest.fn().mockResolvedValue(undefined),
  setContextValue: jest.fn().mockResolvedValue(undefined),
  getContext: jest.fn().mockResolvedValue({}),
  clearContext: jest.fn().mockResolvedValue(undefined),
}));

import type {
  DiscussionConfig,
  DiscussionParticipant,
  DiscussionContribution,
} from '../../src/types/agent.types.js';

describe('DiscussionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null as never);

    // Default mock for agent execution
    mockExecuteAgent.mockResolvedValue({
      success: true,
      result: 'Participant contribution with agreement: 8/10',
      durationMs: 100,
    });
  });

  afterEach(async () => {
    jest.resetModules();
  });

  describe('evaluateConsensus', () => {
    it('should calculate unanimous consensus', async () => {
      const { evaluateConsensus } = await import('../../src/services/discussion.service.js');

      const contributions: DiscussionContribution[] = [
        { participantId: 'p1', role: 'expert', content: 'Content 1', agreementScore: 0.9, timestamp: '' },
        { participantId: 'p2', role: 'critic', content: 'Content 2', agreementScore: 0.85, timestamp: '' },
        { participantId: 'p3', role: 'analyst', content: 'Content 3', agreementScore: 0.88, timestamp: '' },
      ];

      const participants: DiscussionParticipant[] = [
        { agentId: 'p1', role: 'expert' },
        { agentId: 'p2', role: 'critic' },
        { agentId: 'p3', role: 'analyst' },
      ];

      const score = evaluateConsensus(contributions, 'unanimous', participants);

      // Minimum score is 0.85, which is >= 0.8 threshold, so we get the actual min
      expect(score).toBeCloseTo(0.85, 2);
    });

    it('should calculate majority consensus', async () => {
      const { evaluateConsensus } = await import('../../src/services/discussion.service.js');

      const contributions: DiscussionContribution[] = [
        { participantId: 'p1', role: 'expert', content: 'Content 1', agreementScore: 0.9, timestamp: '' },
        { participantId: 'p2', role: 'critic', content: 'Content 2', agreementScore: 0.6, timestamp: '' },
        { participantId: 'p3', role: 'analyst', content: 'Content 3', agreementScore: 0.8, timestamp: '' },
      ];

      const participants: DiscussionParticipant[] = [
        { agentId: 'p1', role: 'expert' },
        { agentId: 'p2', role: 'critic' },
        { agentId: 'p3', role: 'analyst' },
      ];

      const score = evaluateConsensus(contributions, 'majority', participants);

      // Average: (0.9 + 0.6 + 0.8) / 3 = 0.7667
      expect(score).toBeCloseTo(0.7667, 2);
    });

    it('should calculate weighted consensus', async () => {
      const { evaluateConsensus } = await import('../../src/services/discussion.service.js');

      // participantId uses index-based format (participant_N) to avoid collisions
      const contributions: DiscussionContribution[] = [
        { participantId: 'participant_0', role: 'expert', content: 'Content 1', agreementScore: 0.9, timestamp: '' },
        { participantId: 'participant_1', role: 'critic', content: 'Content 2', agreementScore: 0.6, timestamp: '' },
      ];

      const participants: DiscussionParticipant[] = [
        { agentId: 'p1', role: 'expert', weight: 0.7 },
        { agentId: 'p2', role: 'critic', weight: 0.3 },
      ];

      const score = evaluateConsensus(contributions, 'weighted', participants);

      // Weighted: (0.9 * 0.7 + 0.6 * 0.3) / 1.0 = 0.63 + 0.18 = 0.81
      expect(score).toBeCloseTo(0.81, 2);
    });

    it('should use facilitator consensus score when strategy is facilitator', async () => {
      const { evaluateConsensus } = await import('../../src/services/discussion.service.js');

      const contributions: DiscussionContribution[] = [
        { participantId: 'p1', role: 'expert', content: 'Content', agreementScore: 0.5, timestamp: '' },
      ];

      const participants: DiscussionParticipant[] = [{ agentId: 'p1', role: 'expert' }];

      const facilitatorSynthesis = { consensusScore: 0.88 };

      const score = evaluateConsensus(contributions, 'facilitator', participants, facilitatorSynthesis);

      expect(score).toBe(0.88);
    });

    it('should return 0 for empty contributions', async () => {
      const { evaluateConsensus } = await import('../../src/services/discussion.service.js');

      const score = evaluateConsensus([], 'majority', []);

      expect(score).toBe(0);
    });
  });

  describe('checkConvergence', () => {
    it('should return true when last round meets threshold', async () => {
      const { checkConvergence } = await import('../../src/services/discussion.service.js');

      const rounds = [
        { round: 1, contributions: [], consensusScore: 0.6, durationMs: 100, timestamp: '' },
        { round: 2, contributions: [], consensusScore: 0.75, durationMs: 100, timestamp: '' },
        { round: 3, contributions: [], consensusScore: 0.9, durationMs: 100, timestamp: '' },
      ];

      const converged = checkConvergence(rounds, 0.85);

      expect(converged).toBe(true);
    });

    it('should return false when threshold not met', async () => {
      const { checkConvergence } = await import('../../src/services/discussion.service.js');

      const rounds = [
        { round: 1, contributions: [], consensusScore: 0.5, durationMs: 100, timestamp: '' },
        { round: 2, contributions: [], consensusScore: 0.6, durationMs: 100, timestamp: '' },
      ];

      const converged = checkConvergence(rounds, 0.85);

      expect(converged).toBe(false);
    });

    it('should detect convergence trend', async () => {
      const { checkConvergence } = await import('../../src/services/discussion.service.js');

      const rounds = [
        { round: 1, contributions: [], consensusScore: 0.75, durationMs: 100, timestamp: '' },
        { round: 2, contributions: [], consensusScore: 0.8, durationMs: 100, timestamp: '' },
        { round: 3, contributions: [], consensusScore: 0.83, durationMs: 100, timestamp: '' },
      ];

      // Average is ~0.793, which is >= 0.85 * 0.9 = 0.765, and scores are increasing
      const converged = checkConvergence(rounds, 0.85);

      expect(converged).toBe(true);
    });

    it('should return false for empty rounds', async () => {
      const { checkConvergence } = await import('../../src/services/discussion.service.js');

      const converged = checkConvergence([], 0.85);

      expect(converged).toBe(false);
    });
  });

  describe('conductRound', () => {
    it('should conduct a discussion round with all participants', async () => {
      const { conductRound } = await import('../../src/services/discussion.service.js');

      const participants: DiscussionParticipant[] = [
        { agentId: 'agent-1', role: 'expert', perspective: 'Technical perspective' },
        { agentId: 'agent-2', role: 'critic', perspective: 'Critical perspective' },
      ];

      mockExecuteAgent
        .mockResolvedValueOnce({
          success: true,
          result: 'Expert contribution. Agreement: 8/10',
          durationMs: 100,
        })
        .mockResolvedValueOnce({
          success: true,
          result: 'Critic contribution. Agreement: 7/10',
          durationMs: 100,
        });

      const config: DiscussionConfig = {
        maxRounds: 3,
        participants,
        discussionPromptTemplate: 'Discuss {{topic}}',
        consensusStrategy: 'majority',
      };

      const result = await conductRound(
        'exec-123',
        'Test topic',
        participants,
        config,
        1,
        undefined,
        'user-1'
      );

      expect(result.round.round).toBe(1);
      expect(result.round.contributions).toHaveLength(2);
      expect(result.round.consensusScore).toBeGreaterThan(0);
      expect(result.taskResults).toHaveLength(2);
      expect(result.taskResults.every(tr => tr.success)).toBe(true);
    });

    it('should handle participant failures gracefully', async () => {
      const { conductRound } = await import('../../src/services/discussion.service.js');

      const participants: DiscussionParticipant[] = [
        { agentId: 'agent-1', role: 'expert' },
        { agentId: 'agent-2', role: 'critic' },
      ];

      mockExecuteAgent
        .mockResolvedValueOnce({
          success: true,
          result: 'Expert contribution',
          durationMs: 100,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Agent failed',
          durationMs: 100,
        });

      const config: DiscussionConfig = {
        maxRounds: 3,
        participants,
        discussionPromptTemplate: 'Discuss {{topic}}',
        consensusStrategy: 'majority',
      };

      const result = await conductRound(
        'exec-123',
        'Test topic',
        participants,
        config,
        1,
        undefined,
        'user-1'
      );

      // Only successful contribution should be included
      expect(result.round.contributions).toHaveLength(1);
      // But taskResults should include both (success and failure)
      expect(result.taskResults).toHaveLength(2);
      expect(result.taskResults.filter(tr => tr.success)).toHaveLength(1);
      expect(result.taskResults.filter(tr => !tr.success)).toHaveLength(1);
    });

    it('should include facilitator synthesis when strategy is facilitator', async () => {
      const { conductRound } = await import('../../src/services/discussion.service.js');

      const participants: DiscussionParticipant[] = [
        { agentId: 'agent-1', role: 'expert' },
      ];

      // Participant contribution
      mockExecuteAgent.mockResolvedValueOnce({
        success: true,
        result: 'Expert contribution. Agreement: 8/10',
        durationMs: 100,
      });

      // Facilitator synthesis
      mockExecuteAgent.mockResolvedValueOnce({
        success: true,
        result: JSON.stringify({
          synthesis: 'Synthesized consensus',
          consensusScore: 0.85,
          agreements: ['Point 1'],
          disagreements: [],
        }),
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 3,
        participants,
        discussionPromptTemplate: 'Discuss {{topic}}',
        consensusStrategy: 'facilitator',
        facilitatorAgentId: 'facilitator-agent',
      };

      const result = await conductRound(
        'exec-123',
        'Test topic',
        participants,
        config,
        1,
        undefined,
        'user-1'
      );

      expect(result.round.synthesis).toBe('Synthesized consensus');
      expect(result.round.consensusScore).toBe(0.85);
    });
  });

  describe('executeDiscussion', () => {
    it('should execute a full discussion and return result', async () => {
      const { executeDiscussion } = await import('../../src/services/discussion.service.js');

      // All participant responses return high agreement
      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Contribution with agreement: 9/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 3,
        participants: [
          { agentId: 'agent-1', role: 'expert' },
          { agentId: 'agent-2', role: 'critic' },
        ],
        discussionPromptTemplate: 'Discuss {{topic}}',
        consensusStrategy: 'majority',
        convergenceThreshold: 0.85,
      };

      const result = await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Discuss architecture' }],
        },
        config
      );

      expect(result.pattern).toBe('discussion');
      expect(result.rounds.length).toBeGreaterThan(0);
      expect(result.participantSummaries).toBeDefined();
      // taskResults should contain results from all participant executions
      expect(result.taskResults.length).toBeGreaterThan(0);
    });

    it('should populate taskResults with per-participant results from all rounds', async () => {
      const { executeDiscussion } = await import('../../src/services/discussion.service.js');

      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Contribution. Agreement: 5/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 2,
        participants: [
          { agentId: 'agent-1', role: 'expert' },
          { agentId: 'agent-2', role: 'critic' },
        ],
        discussionPromptTemplate: 'Discuss {{topic}}',
        consensusStrategy: 'majority',
        convergenceThreshold: 0.99, // High threshold to ensure 2 rounds run
      };

      const result = await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Discuss architecture' }],
        },
        config
      );

      // 2 participants x 2 rounds = 4 task results
      expect(result.taskResults).toHaveLength(4);
      expect(result.taskResults.every(tr => tr.success)).toBe(true);
      expect(result.taskResults.every(tr => tr.taskId !== undefined)).toBe(true);
    });

    it('should include failed participant executions in taskResults', async () => {
      const { executeDiscussion } = await import('../../src/services/discussion.service.js');

      // First participant succeeds, second fails
      mockExecuteAgent
        .mockResolvedValueOnce({
          success: true,
          result: 'Success contribution. Agreement: 9/10',
          durationMs: 100,
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Agent execution failed',
          durationMs: 50,
        });

      const config: DiscussionConfig = {
        maxRounds: 1,
        participants: [
          { agentId: 'agent-1', role: 'expert' },
          { agentId: 'agent-2', role: 'critic' },
        ],
        discussionPromptTemplate: 'Discuss {{topic}}',
        consensusStrategy: 'majority',
      };

      const result = await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Discuss architecture' }],
        },
        config
      );

      // Both task results should be present
      expect(result.taskResults).toHaveLength(2);
      expect(result.taskResults.filter(tr => tr.success)).toHaveLength(1);
      expect(result.taskResults.filter(tr => !tr.success)).toHaveLength(1);

      const failedResult = result.taskResults.find(tr => !tr.success);
      expect(failedResult?.error).toBe('Agent execution failed');
    });

    it('should converge when threshold is reached', async () => {
      const { executeDiscussion } = await import('../../src/services/discussion.service.js');

      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Strong agreement. Agreement: 9/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 5,
        participants: [
          { agentId: 'agent-1', role: 'expert' },
        ],
        discussionPromptTemplate: 'Discuss',
        consensusStrategy: 'majority',
        convergenceThreshold: 0.8,
      };

      const result = await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Topic' }],
        },
        config
      );

      expect(result.converged).toBe(true);
    });

    it('should stop at max rounds if not converged', async () => {
      const { executeDiscussion } = await import('../../src/services/discussion.service.js');

      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Disagreement. Agreement: 3/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 2,
        participants: [
          { agentId: 'agent-1', role: 'expert' },
        ],
        discussionPromptTemplate: 'Discuss',
        consensusStrategy: 'majority',
        convergenceThreshold: 0.9,
      };

      const result = await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Topic' }],
        },
        config
      );

      expect(result.converged).toBe(false);
      expect(result.rounds.length).toBe(2);
    });

    it('should throw error when no participants provided', async () => {
      const { executeDiscussion } = await import('../../src/services/discussion.service.js');

      const config: DiscussionConfig = {
        maxRounds: 3,
        participants: [],
        discussionPromptTemplate: 'Discuss',
        consensusStrategy: 'majority',
      };

      await expect(
        executeDiscussion(
          {
            userId: 'user-1',
            pattern: 'discussion',
            tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Topic' }],
          },
          config
        )
      ).rejects.toThrow('requires at least one participant');
    });

    it('should track participant summaries correctly', async () => {
      const { executeDiscussion } = await import('../../src/services/discussion.service.js');

      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Contribution. Agreement: 8/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 2,
        participants: [
          { agentId: 'agent-1', role: 'expert' },
          { agentId: 'agent-2', role: 'critic' },
        ],
        discussionPromptTemplate: 'Discuss',
        consensusStrategy: 'majority',
        convergenceThreshold: 0.95, // High threshold to ensure 2 rounds
      };

      const result = await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Topic' }],
        },
        config
      );

      // participantSummaries uses index-based keys (participant_N) to avoid collisions
      expect(result.participantSummaries['participant_0']).toBeDefined();
      expect(result.participantSummaries['participant_0'].contributions).toBe(2);
      expect(result.participantSummaries['participant_1'].contributions).toBe(2);
    });
  });

  describe('getDiscussionResult', () => {
    it('should retrieve stored discussion result', async () => {
      const { getDiscussionResult } = await import('../../src/services/discussion.service.js');

      const storedResult = {
        id: 'discussion_123',
        status: 'completed',
        pattern: 'discussion',
        rounds: [],
        finalConsensus: 'Agreed position',
        consensusScore: 0.9,
        converged: true,
        participantSummaries: {},
        durationMs: 5000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        taskResults: [],
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(storedResult) as never);

      const result = await getDiscussionResult('discussion_123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('discussion_123');
      expect(result?.converged).toBe(true);
    });

    it('should return null for non-existent result', async () => {
      const { getDiscussionResult } = await import('../../src/services/discussion.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getDiscussionResult('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getDiscussionRounds', () => {
    it('should retrieve discussion rounds', async () => {
      const { getDiscussionRounds } = await import('../../src/services/discussion.service.js');

      const rounds = [
        JSON.stringify({
          round: 1,
          contributions: [{ participantId: 'p1', content: 'First', role: 'expert' }],
          consensusScore: 0.6,
          durationMs: 100,
          timestamp: new Date().toISOString(),
        }),
        JSON.stringify({
          round: 2,
          contributions: [{ participantId: 'p1', content: 'Second', role: 'expert' }],
          consensusScore: 0.85,
          durationMs: 100,
          timestamp: new Date().toISOString(),
        }),
      ];

      mockRedis.lrange.mockResolvedValue(rounds as never);

      const result = await getDiscussionRounds('discussion_123');

      expect(result).toHaveLength(2);
      expect(result[0].round).toBe(1);
      expect(result[1].round).toBe(2);
    });
  });

  describe('getDiscussionMetrics', () => {
    it('should return discussion metrics from metrics service', async () => {
      const { getDiscussionMetrics } = await import('../../src/services/discussion.service.js');

      // Configure mock to return specific metrics
      mockGetDiscussionMetrics.mockResolvedValueOnce({
        totalExecutions: 2,
        avgRounds: 3,
        avgParticipants: 2.5,
        convergenceRate: 0.5,
        avgConsensusScore: 0.75,
        avgDurationMs: 15000,
      });

      const result = await getDiscussionMetrics();

      expect(result.totalExecutions).toBe(2);
      expect(result.avgRounds).toBe(3);
      expect(result.avgParticipants).toBe(2.5);
      expect(result.convergenceRate).toBe(0.5);
      expect(result.avgConsensusScore).toBe(0.75);
    });

    it('should return empty metrics when no data', async () => {
      const { getDiscussionMetrics } = await import('../../src/services/discussion.service.js');

      // Configure mock to return empty metrics
      mockGetDiscussionMetrics.mockResolvedValueOnce({
        totalExecutions: 0,
        avgRounds: 0,
        convergenceRate: 0,
        avgConsensusScore: 0,
        avgParticipants: 0,
        avgDurationMs: 0,
      });

      const result = await getDiscussionMetrics();

      expect(result.totalExecutions).toBe(0);
      expect(result.avgRounds).toBe(0);
      expect(result.convergenceRate).toBe(0);
    });
  });

  describe('event emission', () => {
    it('should emit round-started event', async () => {
      const { executeDiscussion, discussionEvents } = await import(
        '../../src/services/discussion.service.js'
      );

      const roundStartedHandler = jest.fn();
      discussionEvents.on('agent:discussion:round-started', roundStartedHandler);

      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Contribution. Agreement: 9/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 1,
        participants: [{ agentId: 'agent-1', role: 'expert' }],
        discussionPromptTemplate: 'Discuss',
        consensusStrategy: 'majority',
      };

      await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Topic' }],
        },
        config
      );

      expect(roundStartedHandler).toHaveBeenCalled();
      discussionEvents.off('agent:discussion:round-started', roundStartedHandler);
    });

    it('should emit contribution event for each participant', async () => {
      const { executeDiscussion, discussionEvents } = await import(
        '../../src/services/discussion.service.js'
      );

      const contributionHandler = jest.fn();
      discussionEvents.on('agent:discussion:contribution', contributionHandler);

      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Contribution. Agreement: 8/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 1,
        participants: [
          { agentId: 'agent-1', role: 'expert' },
          { agentId: 'agent-2', role: 'critic' },
        ],
        discussionPromptTemplate: 'Discuss',
        consensusStrategy: 'majority',
      };

      await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Topic' }],
        },
        config
      );

      expect(contributionHandler).toHaveBeenCalledTimes(2);
      discussionEvents.off('agent:discussion:contribution', contributionHandler);
    });

    it('should emit converged event when consensus is reached', async () => {
      const { executeDiscussion, discussionEvents } = await import(
        '../../src/services/discussion.service.js'
      );

      const convergedHandler = jest.fn();
      discussionEvents.on('agent:discussion:converged', convergedHandler);

      mockExecuteAgent.mockResolvedValue({
        success: true,
        result: 'Strong agreement. Agreement: 9/10',
        durationMs: 100,
      });

      const config: DiscussionConfig = {
        maxRounds: 3,
        participants: [{ agentId: 'agent-1', role: 'expert' }],
        discussionPromptTemplate: 'Discuss',
        consensusStrategy: 'majority',
        convergenceThreshold: 0.8,
      };

      await executeDiscussion(
        {
          userId: 'user-1',
          pattern: 'discussion',
          tasks: [{ id: 'topic', agentType: 'claude', prompt: 'Topic' }],
        },
        config
      );

      expect(convergedHandler).toHaveBeenCalled();
      discussionEvents.off('agent:discussion:converged', convergedHandler);
    });
  });

  describe('synthesizeContributions', () => {
    it('should synthesize contributions using facilitator agent', async () => {
      const { synthesizeContributions } = await import('../../src/services/discussion.service.js');

      mockExecuteAgent.mockResolvedValueOnce({
        success: true,
        result: JSON.stringify({
          synthesis: 'Synthesized position',
          consensusScore: 0.85,
          agreements: ['Point 1', 'Point 2'],
          disagreements: ['Minor point'],
        }),
        durationMs: 100,
      });

      const contributions: DiscussionContribution[] = [
        { participantId: 'p1', role: 'expert', content: 'Expert view', timestamp: '' },
        { participantId: 'p2', role: 'critic', content: 'Critical view', timestamp: '' },
      ];

      const synthesis = await synthesizeContributions(
        contributions,
        'facilitator-agent',
        'Test topic',
        1,
        'user-1'
      );

      expect(synthesis).toBe('Synthesized position');
    });

    it('should throw error when synthesis fails', async () => {
      const { synthesizeContributions } = await import('../../src/services/discussion.service.js');

      mockExecuteAgent.mockResolvedValueOnce({
        success: false,
        error: 'Synthesis failed',
        durationMs: 100,
      });

      const contributions: DiscussionContribution[] = [
        { participantId: 'p1', role: 'expert', content: 'View', timestamp: '' },
      ];

      await expect(
        synthesizeContributions(contributions, 'facilitator-agent', 'Topic', 1, 'user-1')
      ).rejects.toThrow('Synthesis failed');
    });
  });
});
