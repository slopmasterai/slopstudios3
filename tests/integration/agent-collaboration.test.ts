/**
 * Agent Collaboration Integration Tests
 * End-to-end tests for Self-Critique and Discussion HTTP/WebSocket endpoints
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-deprecated */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Define stable mock references outside factory functions to survive restoreMocks
const mockSelfCritiqueService = {
  executeSelfCritique: jest.fn(),
  getCritiqueResult: jest.fn(),
  getCritiqueIterations: jest.fn(),
  getCritiqueMetrics: jest.fn(),
  getServiceConfig: jest.fn().mockReturnValue({
    defaultMaxIterations: 3,
    defaultQualityThreshold: 0.8,
  }),
  critiqueEvents: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  },
};

const mockDiscussionService = {
  executeDiscussion: jest.fn(),
  getDiscussionResult: jest.fn(),
  getDiscussionRounds: jest.fn(),
  getDiscussionMetrics: jest.fn(),
  getServiceConfig: jest.fn().mockReturnValue({
    defaultMaxRounds: 3,
    defaultConvergenceThreshold: 0.7,
  }),
  discussionEvents: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  },
};

// Mock the collaboration services before importing anything else
jest.mock('../../src/services/self-critique.service.js', () => mockSelfCritiqueService);

jest.mock('../../src/services/discussion.service.js', () => mockDiscussionService);

// Mock other services
jest.mock('../../src/services/prompt-template.service', () => ({
  createTemplate: jest.fn(),
  getTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  listTemplates: jest.fn(),
  interpolateTemplate: jest.fn(),
}));

jest.mock('../../src/services/agent-registry.service', () => ({
  registerAgent: jest.fn(),
  unregisterAgent: jest.fn(),
  getAgent: jest.fn(),
  listAgents: jest.fn(),
  executeAgent: jest.fn(),
  updateAgentStatus: jest.fn(),
  getDefaultAgent: jest.fn(),
  getRegistryStats: jest.fn(),
}));

jest.mock('../../src/services/workflow-engine.service', () => ({
  executeWorkflow: jest.fn(),
  cancelWorkflow: jest.fn(),
  pauseWorkflow: jest.fn(),
  resumeWorkflow: jest.fn(),
  getWorkflowStatus: jest.fn(),
  listWorkflows: jest.fn(),
  validateWorkflowDefinition: jest.fn(),
  getEngineStats: jest.fn(),
}));

jest.mock('../../src/services/orchestration.service', () => ({
  orchestrate: jest.fn(),
  orchestrateSequential: jest.fn(),
  orchestrateParallel: jest.fn(),
  orchestrateSelfCritique: jest.fn(),
  orchestrateDiscussion: jest.fn(),
  getOrchestrationResult: jest.fn(),
  getOrchestrationMetrics: jest.fn(),
}));

jest.mock('../../src/services/agent-metrics.service', () => ({
  initializeAgentMetricsService: jest.fn(),
  shutdownAgentMetricsService: jest.fn(() => Promise.resolve()),
  getOrchestrationMetrics: jest.fn(),
  getWorkflowMetrics: jest.fn(),
  getStepMetrics: jest.fn(),
  getTemplateMetrics: jest.fn(),
  getAgentPerformanceMetrics: jest.fn(),
  getSelfCritiqueMetrics: jest.fn(),
  getDiscussionMetrics: jest.fn(),
  recordCritiqueMetric: jest.fn(),
  recordDiscussionMetric: jest.fn(),
}));

// Mock auth middleware
jest.mock('../../src/middleware/auth.middleware', () => ({
  verifyJWT: jest.fn(
    async (
      request: { user: unknown; headers: { authorization?: string } },
      reply: { status: (code: number) => { send: (data: unknown) => void }; sent: boolean }
    ) => {
      if (request.headers.authorization?.startsWith('Bearer ')) {
        request.user = { id: 'test-user-id', email: 'test@example.com' };
      } else {
        reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired authentication token',
          },
        });
      }
    }
  ),
}));

// Mock rate limit middleware
jest.mock('../../src/middleware/rate-limit.middleware', () => ({
  createRateLimiter: jest.fn(() => (_request: unknown, _reply: unknown, done: () => void) => {
    done();
  }),
}));

// Mock Redis
jest.mock('../../src/services/redis.service', () => {
  const mockRedis = {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    hset: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue(null),
    hgetall: jest.fn().mockResolvedValue({}),
    hincrby: jest.fn().mockResolvedValue(1),
    hincrbyfloat: jest.fn().mockResolvedValue('1.0'),
    sadd: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    lpush: jest.fn().mockResolvedValue(1),
    lrange: jest.fn().mockResolvedValue([]),
  };

  return {
    createRedisClient: jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    })),
    connectRedis: jest.fn().mockResolvedValue(undefined),
    disconnectRedis: jest.fn().mockResolvedValue(undefined),
    getRedisClient: jest.fn(() => mockRedis),
    isRedisConnected: jest.fn(() => true),
    healthCheck: jest.fn().mockResolvedValue({ healthy: true, latency: 1 }),
  };
});

import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';

import {
  executeSelfCritique,
  getCritiqueResult,
  getCritiqueIterations,
  getCritiqueMetrics,
} from '../../src/services/self-critique.service.js';
import {
  executeDiscussion,
  getDiscussionResult,
  getDiscussionRounds,
  getDiscussionMetrics,
} from '../../src/services/discussion.service.js';
import {
  orchestrateSelfCritique,
  orchestrateDiscussion,
} from '../../src/services/orchestration.service.js';
// Note: getCritiqueMetrics and getDiscussionMetrics are imported from the service mocks above

describe('Agent Collaboration Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    await app.register(fastifyJwt, {
      secret: 'test-secret-key',
    });

    if (!app.hasRequestDecorator('user')) {
      app.decorateRequest('user', null);
    }

    const { registerAgentRoutes } = await import('../../src/routes/agent.routes.js');
    registerAgentRoutes(app);

    await app.ready();

    authToken = 'test-token';
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // Self-Critique Endpoints
  // ============================================

  describe('POST /api/v1/agents/orchestrate/self-critique', () => {
    it('should execute a self-critique workflow', async () => {
      const mockResult = {
        id: 'critique_123',
        status: 'completed' as const,
        agentId: 'claude',
        originalOutput: 'Initial response',
        finalOutput: 'Improved response after self-critique',
        iterations: [
          {
            iteration: 1,
            input: 'Test prompt',
            output: 'Initial response',
            evaluation: {
              scores: { clarity: 0.7, accuracy: 0.8 },
              overallScore: 0.75,
              feedback: 'Needs improvement in clarity',
              meetsThreshold: false,
            },
            timestamp: new Date().toISOString(),
          },
          {
            iteration: 2,
            input: 'Improved prompt with feedback',
            output: 'Improved response after self-critique',
            evaluation: {
              scores: { clarity: 0.9, accuracy: 0.9 },
              overallScore: 0.9,
              feedback: 'Good quality',
              meetsThreshold: true,
            },
            timestamp: new Date().toISOString(),
          },
        ],
        totalIterations: 2,
        converged: true,
        finalScore: 0.9,
        durationMs: 5000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (orchestrateSelfCritique as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          agentId: 'claude',
          agentType: 'claude',
          prompt: 'Write a technical explanation of recursion',
          config: {
            maxIterations: 5,
            qualityThreshold: 0.8,
            criteria: [
              { name: 'clarity', weight: 0.5, description: 'Clear and understandable' },
              { name: 'accuracy', weight: 0.5, description: 'Technically accurate' },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('critique_123');
      expect(body.data.converged).toBe(true);
      expect(body.data.finalScore).toBe(0.9);
      expect(body.data.totalIterations).toBe(2);
    });

    it('should handle critique that fails to converge', async () => {
      const mockResult = {
        id: 'critique_456',
        status: 'completed' as const,
        agentId: 'claude',
        originalOutput: 'Initial response',
        finalOutput: 'Best attempt after max iterations',
        iterations: Array(5).fill(null).map((_, i) => ({
          iteration: i + 1,
          input: `Prompt iteration ${i + 1}`,
          output: `Output iteration ${i + 1}`,
          evaluation: {
            scores: { quality: 0.6 + i * 0.02 },
            overallScore: 0.6 + i * 0.02,
            feedback: 'Still needs work',
            meetsThreshold: false,
          },
          timestamp: new Date().toISOString(),
        })),
        totalIterations: 5,
        converged: false,
        finalScore: 0.68,
        durationMs: 15000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (orchestrateSelfCritique as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          agentId: 'claude',
          agentType: 'claude',
          prompt: 'Difficult task',
          config: {
            maxIterations: 5,
            qualityThreshold: 0.9,
            criteria: [
              { name: 'quality', weight: 1.0, description: 'Overall quality' },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.converged).toBe(false);
      expect(body.data.totalIterations).toBe(5);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        payload: {
          agentId: 'claude',
          agentType: 'claude',
          prompt: 'Test prompt',
          config: {
            maxIterations: 3,
            qualityThreshold: 0.8,
            criteria: [
              { name: 'quality', description: 'Overall quality', weight: 1.0 },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          // Missing required fields
          prompt: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle errors from the service', async () => {
      (orchestrateSelfCritique as jest.Mock).mockRejectedValue(
        new Error('Agent not available')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          agentId: 'claude',
          agentType: 'claude',
          prompt: 'Test',
          config: {
            maxIterations: 3,
            qualityThreshold: 0.8,
            criteria: [
              { name: 'quality', weight: 1.0, description: 'Quality' },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/v1/agents/critique/:id', () => {
    it('should return a critique result by ID', async () => {
      (getCritiqueResult as jest.Mock).mockResolvedValue({
        id: 'critique_123',
        status: 'completed',
        agentId: 'claude',
        originalOutput: 'Initial',
        finalOutput: 'Improved',
        totalIterations: 2,
        converged: true,
        finalScore: 0.85,
        durationMs: 3000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/critique/critique_123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('critique_123');
      expect(body.data.converged).toBe(true);
    });

    it('should return 404 for non-existent critique', async () => {
      (getCritiqueResult as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/critique/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/agents/critique/metrics', () => {
    it('should return self-critique metrics', async () => {
      (getCritiqueMetrics as jest.Mock).mockResolvedValue({
        totalCritiques: 100,
        completedCritiques: 95,
        failedCritiques: 5,
        avgIterations: 2.5,
        avgFinalScore: 0.82,
        convergenceRate: 0.85,
        avgDurationMs: 4500,
        byAgent: {
          claude: {
            total: 80,
            avgScore: 0.85,
            convergenceRate: 0.88,
          },
          custom: {
            total: 20,
            avgScore: 0.75,
            convergenceRate: 0.75,
          },
        },
        timestamp: new Date().toISOString(),
        periodSeconds: 3600,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/critique/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.totalCritiques).toBe(100);
      expect(body.data.convergenceRate).toBe(0.85);
    });
  });

  // ============================================
  // Discussion Endpoints
  // ============================================

  describe('POST /api/v1/agents/orchestrate/discussion', () => {
    it('should execute a discussion workflow', async () => {
      const mockResult = {
        id: 'discussion_123',
        status: 'completed' as const,
        topic: 'Best practices for API design',
        participants: [
          { id: 'p1', agentId: 'claude', role: 'expert', weight: 1.0 },
          { id: 'p2', agentId: 'claude', role: 'critic', weight: 1.0 },
          { id: 'p3', agentId: 'claude', role: 'synthesizer', weight: 1.5 },
        ],
        rounds: [
          {
            roundNumber: 1,
            contributions: [
              { participantId: 'p1', content: 'REST is great', agreementScore: 0.8, timestamp: new Date().toISOString() },
              { participantId: 'p2', content: 'GraphQL is better', agreementScore: 0.6, timestamp: new Date().toISOString() },
              { participantId: 'p3', content: 'Both have merits', agreementScore: 0.9, timestamp: new Date().toISOString() },
            ],
            synthesis: 'Initial perspectives gathered',
            consensusScore: 0.7,
            timestamp: new Date().toISOString(),
          },
          {
            roundNumber: 2,
            contributions: [
              { participantId: 'p1', content: 'I agree with nuanced view', agreementScore: 0.9, timestamp: new Date().toISOString() },
              { participantId: 'p2', content: 'Fair points made', agreementScore: 0.85, timestamp: new Date().toISOString() },
              { participantId: 'p3', content: 'Consensus forming', agreementScore: 0.95, timestamp: new Date().toISOString() },
            ],
            synthesis: 'Consensus reached on hybrid approach',
            consensusScore: 0.9,
            timestamp: new Date().toISOString(),
          },
        ],
        totalRounds: 2,
        converged: true,
        finalConsensus: 'Use REST for simple CRUD, GraphQL for complex queries',
        consensusScore: 0.9,
        durationMs: 8000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (orchestrateDiscussion as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          topic: 'Best practices for API design',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'expert', weight: 0.8 },
            { id: 'p2', agentId: 'claude', role: 'critic', weight: 0.8 },
            { id: 'p3', agentId: 'claude', role: 'synthesizer', weight: 1.0 },
          ],
          config: {
            maxRounds: 5,
            consensusThreshold: 0.85,
            consensusStrategy: 'weighted',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('discussion_123');
      expect(body.data.converged).toBe(true);
      expect(body.data.consensusScore).toBe(0.9);
      expect(body.data.totalRounds).toBe(2);
    });

    it('should handle discussion with different consensus strategies', async () => {
      const mockResult = {
        id: 'discussion_789',
        status: 'completed' as const,
        topic: 'Framework choice',
        participants: [
          { id: 'p1', agentId: 'claude', role: 'facilitator', weight: 2.0 },
          { id: 'p2', agentId: 'claude', role: 'participant', weight: 1.0 },
        ],
        rounds: [],
        totalRounds: 3,
        converged: true,
        finalConsensus: 'Facilitator recommendation: React',
        consensusScore: 0.95,
        durationMs: 6000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (orchestrateDiscussion as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          topic: 'Framework choice',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'facilitator', weight: 1.0 },
            { id: 'p2', agentId: 'claude', role: 'participant', weight: 0.8 },
          ],
          config: {
            maxRounds: 5,
            consensusThreshold: 0.8,
            consensusStrategy: 'facilitator',
            facilitatorAgentId: 'claude',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.consensusScore).toBe(0.95);
    });

    it('should handle discussion that fails to reach consensus', async () => {
      const mockResult = {
        id: 'discussion_no_consensus',
        status: 'completed' as const,
        topic: 'Controversial topic',
        participants: [
          { id: 'p1', agentId: 'claude', role: 'participant', weight: 1.0 },
          { id: 'p2', agentId: 'claude', role: 'participant', weight: 1.0 },
        ],
        rounds: Array(5).fill(null).map((_, i) => ({
          roundNumber: i + 1,
          contributions: [],
          synthesis: `Round ${i + 1} synthesis`,
          consensusScore: 0.5 + i * 0.05,
          timestamp: new Date().toISOString(),
        })),
        totalRounds: 5,
        converged: false,
        finalConsensus: 'No consensus reached - positions remain divided',
        consensusScore: 0.7,
        durationMs: 25000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (orchestrateDiscussion as jest.Mock).mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          topic: 'Controversial topic',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'participant', weight: 1.0 },
            { id: 'p2', agentId: 'claude', role: 'participant', weight: 1.0 },
          ],
          config: {
            maxRounds: 5,
            consensusThreshold: 0.9,
            consensusStrategy: 'unanimous',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.converged).toBe(false);
      expect(body.data.totalRounds).toBe(5);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        payload: {
          topic: 'Test topic',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'participant', weight: 1.0 },
          ],
          config: {
            maxRounds: 3,
            consensusThreshold: 0.8,
            consensusStrategy: 'majority',
          },
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          // Missing required fields
          topic: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle errors from the service', async () => {
      (orchestrateDiscussion as jest.Mock).mockRejectedValue(
        new Error('Participant limit exceeded')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          topic: 'Test topic',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'participant', weight: 1.0 },
            { id: 'p2', agentId: 'claude', role: 'participant', weight: 1.0 },
          ],
          config: {
            maxRounds: 3,
            consensusThreshold: 0.8,
            consensusStrategy: 'majority',
          },
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/v1/agents/discussion/:id', () => {
    it('should return a discussion result by ID', async () => {
      (getDiscussionResult as jest.Mock).mockResolvedValue({
        id: 'discussion_123',
        status: 'completed',
        topic: 'API Design',
        participants: [
          { id: 'p1', agentId: 'claude', role: 'expert', weight: 1.0 },
        ],
        totalRounds: 3,
        converged: true,
        finalConsensus: 'Use REST with versioning',
        consensusScore: 0.88,
        durationMs: 5000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/discussion/discussion_123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('discussion_123');
      expect(body.data.converged).toBe(true);
    });

    it('should return 404 for non-existent discussion', async () => {
      (getDiscussionResult as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/discussion/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/agents/discussion/metrics', () => {
    it('should return discussion metrics', async () => {
      (getDiscussionMetrics as jest.Mock).mockResolvedValue({
        totalDiscussions: 50,
        completedDiscussions: 45,
        failedDiscussions: 5,
        avgRounds: 3.2,
        avgParticipants: 3.5,
        avgConsensusScore: 0.78,
        convergenceRate: 0.8,
        avgDurationMs: 12000,
        byStrategy: {
          unanimous: { total: 10, convergenceRate: 0.6 },
          majority: { total: 20, convergenceRate: 0.85 },
          weighted: { total: 15, convergenceRate: 0.9 },
          facilitator: { total: 5, convergenceRate: 1.0 },
        },
        timestamp: new Date().toISOString(),
        periodSeconds: 3600,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/discussion/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.totalDiscussions).toBe(50);
      expect(body.data.convergenceRate).toBe(0.8);
    });
  });

  // ============================================
  // Combined Workflow Tests
  // ============================================

  describe('Combined Workflows', () => {
    it('should handle discussion followed by self-critique workflow', async () => {
      // First execute discussion
      const discussionResult = {
        id: 'discussion_combined',
        status: 'completed' as const,
        topic: 'Design proposal',
        participants: [
          { id: 'p1', agentId: 'claude', role: 'expert', weight: 1.0 },
          { id: 'p2', agentId: 'claude', role: 'critic', weight: 1.0 },
        ],
        rounds: [],
        totalRounds: 2,
        converged: true,
        finalConsensus: 'Agreed on microservices architecture',
        consensusScore: 0.9,
        durationMs: 5000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (orchestrateDiscussion as jest.Mock).mockResolvedValue(discussionResult);

      const discussionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          topic: 'Design proposal',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'expert', weight: 1.0 },
            { id: 'p2', agentId: 'claude', role: 'critic', weight: 1.0 },
          ],
          config: {
            maxRounds: 5,
            consensusThreshold: 0.85,
            consensusStrategy: 'majority',
          },
        },
      });

      expect(discussionResponse.statusCode).toBe(200);
      const discussionBody = JSON.parse(discussionResponse.body);
      expect(discussionBody.data.finalConsensus).toBe('Agreed on microservices architecture');

      // Then use discussion output in self-critique
      const critiqueResult = {
        id: 'critique_combined',
        status: 'completed' as const,
        agentId: 'claude',
        originalOutput: discussionBody.data.finalConsensus,
        finalOutput: 'Refined microservices architecture with clear boundaries',
        iterations: [],
        totalIterations: 2,
        converged: true,
        finalScore: 0.92,
        durationMs: 4000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (orchestrateSelfCritique as jest.Mock).mockResolvedValue(critiqueResult);

      const critiqueResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          agentId: 'claude',
          agentType: 'claude',
          prompt: `Refine and improve: ${discussionBody.data.finalConsensus}`,
          config: {
            maxIterations: 3,
            qualityThreshold: 0.85,
            criteria: [
              { name: 'completeness', weight: 0.5, description: 'Complete coverage' },
              { name: 'clarity', weight: 0.5, description: 'Clear explanation' },
            ],
          },
        },
      });

      expect(critiqueResponse.statusCode).toBe(200);
      const critiqueBody = JSON.parse(critiqueResponse.body);
      expect(critiqueBody.data.converged).toBe(true);
      expect(critiqueBody.data.finalScore).toBe(0.92);
    });
  });

  // ============================================
  // Error Handling and Edge Cases
  // ============================================

  describe('Error Handling', () => {
    it('should handle timeout errors in self-critique', async () => {
      (orchestrateSelfCritique as jest.Mock).mockRejectedValue(
        new Error('Critique execution timed out after 600000ms')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          agentId: 'claude',
          agentType: 'claude',
          prompt: 'Long running task',
          config: {
            maxIterations: 10,
            qualityThreshold: 0.99,
            criteria: [
              { name: 'perfection', weight: 1.0, description: 'Perfect output' },
            ],
          },
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('timed out');
    });

    it('should handle timeout errors in discussion', async () => {
      (orchestrateDiscussion as jest.Mock).mockRejectedValue(
        new Error('Discussion execution timed out after 900000ms')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          topic: 'Endless debate',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'participant', weight: 1.0 },
            { id: 'p2', agentId: 'claude', role: 'participant', weight: 1.0 },
          ],
          config: {
            maxRounds: 10,
            consensusThreshold: 1.0,
            consensusStrategy: 'unanimous',
          },
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('timed out');
    });

    it('should return 400 for invalid quality criteria weights', async () => {
      // Schema validation catches negative weights before service is called
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/self-critique',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          agentId: 'claude',
          agentType: 'claude',
          prompt: 'Test',
          config: {
            maxIterations: 3,
            qualityThreshold: 0.8,
            criteria: [
              { name: 'negative', weight: -0.5, description: 'Invalid weight' },
            ],
          },
        },
      });

      // Schema validation returns 400 for negative weights (minimum: 0)
      expect(response.statusCode).toBe(400);
    });

    it('should handle participant validation errors', async () => {
      (orchestrateDiscussion as jest.Mock).mockRejectedValue(
        new Error('Discussion requires at least 2 participants')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/discussion',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          topic: 'Solo discussion',
          participants: [
            { id: 'p1', agentId: 'claude', role: 'participant', weight: 1.0 },
          ],
          config: {
            maxRounds: 3,
            consensusThreshold: 0.8,
            consensusStrategy: 'majority',
          },
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });
});
