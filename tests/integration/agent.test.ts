/**
 * Agent Orchestration Integration Tests
 * End-to-end tests for Agent HTTP endpoints
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Mock the services before importing anything else
// createTemplate returns PromptTemplate directly and throws on error
jest.mock('../../src/services/prompt-template.service.js', () => ({
  createTemplate: jest.fn(),
  getTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  listTemplates: jest.fn(),
  interpolateTemplate: jest.fn(),
}));

// registerAgent takes positional params and returns AgentRegistration directly
jest.mock('../../src/services/agent-registry.service.js', () => ({
  registerAgent: jest.fn(),
  unregisterAgent: jest.fn(),
  getAgent: jest.fn(),
  listAgents: jest.fn(),
  executeAgent: jest.fn(),
  updateAgentStatus: jest.fn(),
  getDefaultAgent: jest.fn(),
  getRegistryStats: jest.fn(),
}));

jest.mock('../../src/services/workflow-engine.service.js', () => ({
  executeWorkflow: jest.fn(),
  cancelWorkflow: jest.fn(),
  pauseWorkflow: jest.fn(),
  resumeWorkflow: jest.fn(),
  getWorkflowStatus: jest.fn(),
  listWorkflows: jest.fn(),
  validateWorkflowDefinition: jest.fn(),
  getEngineStats: jest.fn(),
}));

jest.mock('../../src/services/orchestration.service.js', () => ({
  orchestrate: jest.fn(),
  orchestrateSequential: jest.fn(),
  orchestrateParallel: jest.fn(),
  getOrchestrationResult: jest.fn(),
  getOrchestrationMetrics: jest.fn(),
}));

// Metrics service uses getOrchestrationMetrics which returns AgentServiceMetrics
jest.mock('../../src/services/agent-metrics.service.js', () => ({
  initializeAgentMetricsService: jest.fn(),
  shutdownAgentMetricsService: jest.fn(() => Promise.resolve()),
  getOrchestrationMetrics: jest.fn(),
  getWorkflowMetrics: jest.fn(),
  getStepMetrics: jest.fn(),
  getTemplateMetrics: jest.fn(),
  getAgentPerformanceMetrics: jest.fn(),
}));

// Mock auth middleware to simulate JWT verification
jest.mock('../../src/middleware/auth.middleware.js', () => ({
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
jest.mock('../../src/middleware/rate-limit.middleware.js', () => ({
  createRateLimiter: jest.fn(() => (_request: unknown, _reply: unknown, done: () => void) => {
    done();
  }),
}));

// Mock Redis
jest.mock('../../src/services/redis.service.js', () => {
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
    sadd: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
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
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  listTemplates,
  interpolateTemplate,
} from '../../src/services/prompt-template.service.js';
import {
  registerAgent,
  unregisterAgent,
  getAgent,
  listAgents,
  executeAgent,
} from '../../src/services/agent-registry.service.js';
import {
  executeWorkflow,
  cancelWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  listWorkflows,
  validateWorkflowDefinition,
  getEngineStats,
} from '../../src/services/workflow-engine.service.js';
import {
  orchestrate,
  orchestrateSequential,
  orchestrateParallel,
  getOrchestrationMetrics as getOrchMetrics,
} from '../../src/services/orchestration.service.js';
import { getOrchestrationMetrics } from '../../src/services/agent-metrics.service.js';
import { getRegistryStats } from '../../src/services/agent-registry.service.js';

describe('Agent Orchestration Integration Tests', () => {
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
  // Template Endpoints
  // ============================================

  describe('POST /api/v1/agents/templates', () => {
    it('should create a new template', async () => {
      // createTemplate returns PromptTemplate directly
      (createTemplate as jest.Mock).mockResolvedValue({
        id: 'tpl_template-123',
        name: 'Test Template',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', type: 'string', required: true }],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/templates',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Test Template',
          content: 'Hello {{name}}!',
          variables: [{ name: 'name', type: 'string', required: true }],
          category: 'user',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('tpl_template-123');
    });

    it('should return 400 for invalid template', async () => {
      // createTemplate throws on invalid input
      (createTemplate as jest.Mock).mockRejectedValue(new Error('Template name is required'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/templates',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: '',
          content: 'Hello!',
          variables: [],
          category: 'user',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/templates',
        payload: {
          name: 'Test',
          content: 'Hello!',
          variables: [],
          category: 'user',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/agents/templates/:id', () => {
    it('should return a template by ID', async () => {
      (getTemplate as jest.Mock).mockResolvedValue({
        id: 'tpl_template-123',
        name: 'Test Template',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', type: 'string', required: true }],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/templates/tpl_template-123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('tpl_template-123');
    });

    it('should return 404 for non-existent template', async () => {
      (getTemplate as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/templates/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/agents/templates/:id', () => {
    it('should update an existing template', async () => {
      // updateTemplate returns PromptTemplate directly
      (updateTemplate as jest.Mock).mockResolvedValue({
        id: 'tpl_template-123',
        name: 'Test Template',
        content: 'Updated content {{name}}!',
        variables: [{ name: 'name', type: 'string', required: true }],
        category: 'user',
        version: 2,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/agents/templates/tpl_template-123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          content: 'Updated content {{name}}!',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.version).toBe(2);
    });
  });

  describe('DELETE /api/v1/agents/templates/:id', () => {
    it('should delete a template', async () => {
      (deleteTemplate as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agents/templates/tpl_template-123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent template', async () => {
      (deleteTemplate as jest.Mock).mockResolvedValue(false);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agents/templates/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/agents/templates', () => {
    it('should list all templates', async () => {
      // listTemplates returns { templates, total, page, pageSize, totalPages }
      (listTemplates as jest.Mock).mockResolvedValue({
        templates: [
          { id: 'tpl_1', name: 'Template 1', content: 'Content 1', variables: [], category: 'user', version: 1 },
          { id: 'tpl_2', name: 'Template 2', content: 'Content 2', variables: [], category: 'user', version: 1 },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/templates',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.templates).toHaveLength(2);
    });

    it('should support filtering by tags', async () => {
      (listTemplates as jest.Mock).mockResolvedValue({
        templates: [
          { id: 'tpl_1', name: 'Template 1', content: 'Content 1', variables: [], tags: ['greeting'], category: 'user', version: 1 },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/templates?tags=greeting',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(listTemplates).toHaveBeenCalledWith(expect.objectContaining({ tags: ['greeting'] }));
    });
  });

  describe('POST /api/v1/agents/templates/:id/interpolate', () => {
    it('should interpolate a template', async () => {
      // interpolateTemplate takes templateId and variables, returns { success, content }
      (interpolateTemplate as jest.Mock).mockResolvedValue({
        success: true,
        content: 'Hello Alice!',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/templates/tpl_template-123/interpolate',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          variables: { name: 'Alice' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.content).toBe('Hello Alice!');
    });
  });

  // ============================================
  // Agent Registry Endpoints
  // ============================================

  describe('POST /api/v1/agents/registry', () => {
    it('should register a new agent', async () => {
      // registerAgent returns AgentRegistration directly
      (registerAgent as jest.Mock).mockResolvedValue({
        id: 'agent-123',
        name: 'Custom Agent',
        type: 'custom',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/registry',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Custom Agent',
          type: 'custom',
          capabilities: [
            { name: 'process', description: 'Can process data' },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('agent-123');
    });
  });

  describe('GET /api/v1/agents/registry', () => {
    it('should list all registered agents', async () => {
      // listAgents returns an array directly
      (listAgents as jest.Mock).mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'claude', status: 'idle' },
        { id: 'agent-2', name: 'Agent 2', type: 'strudel', status: 'idle' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/registry',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      // Route returns array directly as data, not wrapped in { agents }
      expect(body.data).toHaveLength(2);
    });

    it('should filter by type', async () => {
      (listAgents as jest.Mock).mockResolvedValue([
        { id: 'agent-1', name: 'Agent 1', type: 'claude', status: 'idle' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/registry?type=claude',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/agents/registry/:id', () => {
    it('should return an agent by ID', async () => {
      (getAgent as jest.Mock).mockResolvedValue({
        id: 'agent-123',
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
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/registry/agent-123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('agent-123');
    });

    it('should return 404 for non-existent agent', async () => {
      (getAgent as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/registry/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/agents/registry/:id', () => {
    it('should unregister an agent', async () => {
      (unregisterAgent as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agents/registry/agent-123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/v1/agents/registry/:id/execute', () => {
    it('should execute an agent', async () => {
      (getAgent as jest.Mock).mockResolvedValue({
        id: 'agent-123',
        name: 'Test Agent',
        type: 'custom',
        status: 'idle',
      });

      (executeAgent as jest.Mock).mockResolvedValue({
        success: true,
        result: { response: 'executed' },
        durationMs: 100,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/registry/agent-123/execute',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          prompt: 'test',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.result).toEqual({ response: 'executed' });
    });
  });

  // ============================================
  // Workflow Endpoints
  // ============================================

  describe('POST /api/v1/agents/workflows', () => {
    it('should execute a workflow', async () => {
      (validateWorkflowDefinition as jest.Mock).mockReturnValue({ valid: true, errors: [] });
      (executeWorkflow as jest.Mock).mockResolvedValue({
        id: 'wf_exec-123',
        workflowId: 'workflow-123',
        userId: 'test-user-id',
        status: 'queued',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
        progress: 0,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/workflows',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          workflow: {
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
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 1,
            },
          },
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.workflowId).toBe('workflow-123');
    });

    it('should return 400 for invalid workflow', async () => {
      // executeWorkflow throws error for invalid workflow
      (executeWorkflow as jest.Mock).mockRejectedValue(new Error('Invalid step dependency: non-existent'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/workflows',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          workflow: {
            id: 'invalid-workflow',
            name: 'Invalid Workflow',
            steps: [
              {
                id: 'step-1',
                name: 'Step 1',
                agentType: 'claude',
                prompt: 'Test',
                inputs: [],
                outputs: [],
                dependencies: ['non-existent'],
              },
            ],
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              version: 1,
            },
          },
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/agents/workflows/:id', () => {
    it('should return workflow status', async () => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'wf_exec-123',
        workflowId: 'workflow-123',
        userId: 'test-user-id',
        status: 'running',
        steps: {},
        currentSteps: ['step-1'],
        createdAt: new Date().toISOString(),
        progress: 50,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/workflows/workflow-123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('running');
      expect(body.data.progress).toBe(50);
    });

    it('should return 404 for non-existent workflow', async () => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/workflows/non-existent',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/agents/workflows/:id', () => {
    it('should cancel a running workflow', async () => {
      // Mock workflow status first - required by route to verify existence
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'workflow-123',
        workflowId: 'workflow-def-123',
        userId: 'test-user-id',
        status: 'running',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
      });
      (cancelWorkflow as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/agents/workflows/workflow-123',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/v1/agents/workflows/:id/pause', () => {
    it('should pause a running workflow', async () => {
      // Mock workflow status first - required by route to verify existence
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'workflow-123',
        workflowId: 'workflow-def-123',
        userId: 'test-user-id',
        status: 'running',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
      });
      (pauseWorkflow as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/workflows/workflow-123/pause',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/v1/agents/workflows/:id/resume', () => {
    it('should resume a paused workflow', async () => {
      // Mock workflow status first - required by route to verify existence
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'workflow-123',
        workflowId: 'workflow-def-123',
        userId: 'test-user-id',
        status: 'paused',
        steps: {},
        currentSteps: [],
        createdAt: new Date().toISOString(),
      });
      (resumeWorkflow as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/workflows/workflow-123/resume',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/v1/agents/workflows', () => {
    it('should list all workflows', async () => {
      // listWorkflows returns { workflows, total }
      (listWorkflows as jest.Mock).mockResolvedValue({
        workflows: [
          { id: 'wf_exec-1', workflowId: 'wf-1', status: 'completed' },
          { id: 'wf_exec-2', workflowId: 'wf-2', status: 'running' },
        ],
        total: 2,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/workflows',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.workflows).toHaveLength(2);
    });
  });

  // ============================================
  // Orchestration Endpoints
  // ============================================

  describe('POST /api/v1/agents/orchestrate', () => {
    it('should orchestrate with a pattern', async () => {
      // orchestrate uses tasks with agentType not steps with agentId
      (orchestrate as jest.Mock).mockResolvedValue({
        id: 'orch_123',
        status: 'completed',
        pattern: 'sequential',
        taskResults: [{ taskId: 'task-1', success: true, result: {}, durationMs: 100 }],
        durationMs: 100,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          pattern: 'sequential',
          tasks: [
            { id: 'task-1', agentType: 'claude', prompt: 'test' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/v1/agents/orchestrate/sequential', () => {
    it('should execute tasks sequentially', async () => {
      // Route uses orchestrate function, not orchestrateSequential
      (orchestrate as jest.Mock).mockResolvedValue({
        id: 'orch_123',
        status: 'completed',
        pattern: 'sequential',
        taskResults: [
          { taskId: 'task-1', status: 'completed', result: { step: 1 }, durationMs: 50 },
          { taskId: 'task-2', status: 'completed', result: { step: 2 }, durationMs: 50 },
        ],
        durationMs: 100,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/sequential',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          pattern: 'sequential',
          tasks: [
            { id: 'task-1', agentType: 'claude', prompt: 'step 1' },
            { id: 'task-2', agentType: 'claude', prompt: 'step 2' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/v1/agents/orchestrate/parallel', () => {
    it('should execute tasks in parallel', async () => {
      // Route uses orchestrate function, not orchestrateParallel
      (orchestrate as jest.Mock).mockResolvedValue({
        id: 'orch_123',
        status: 'completed',
        pattern: 'parallel',
        taskResults: [
          { taskId: 'task-a', status: 'completed', result: { task: 'a' }, durationMs: 50 },
          { taskId: 'task-b', status: 'completed', result: { task: 'b' }, durationMs: 50 },
        ],
        durationMs: 50,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/agents/orchestrate/parallel',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          pattern: 'parallel',
          tasks: [
            { id: 'task-a', agentType: 'claude', prompt: 'task a' },
            { id: 'task-b', agentType: 'claude', prompt: 'task b' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  // ============================================
  // Metrics Endpoints
  // ============================================

  describe('GET /api/v1/agents/metrics', () => {
    it('should return orchestration metrics', async () => {
      // getOrchestrationMetrics from agent-metrics.service returns AgentServiceMetrics
      (getOrchestrationMetrics as jest.Mock).mockResolvedValue({
        workflows: {
          totalWorkflows: 100,
          successfulWorkflows: 90,
          failedWorkflows: 10,
          cancelledWorkflows: 0,
          activeWorkflows: 5,
          queuedWorkflows: 2,
          avgDurationMs: 1000,
          p50DurationMs: 800,
          p95DurationMs: 2000,
          p99DurationMs: 3000,
          successRate: 0.9,
          timestamp: new Date().toISOString(),
          periodSeconds: 3600,
        },
        stepsByAgent: {
          claude: { agentType: 'claude', totalSteps: 400, successfulSteps: 380, failedSteps: 20, retriedSteps: 10, avgDurationMs: 500, successRate: 0.95 },
          strudel: { agentType: 'strudel', totalSteps: 100, successfulSteps: 95, failedSteps: 5, retriedSteps: 2, avgDurationMs: 200, successRate: 0.95 },
          custom: { agentType: 'custom', totalSteps: 0, successfulSteps: 0, failedSteps: 0, retriedSteps: 0, avgDurationMs: 0, successRate: 0 },
        },
        templates: [
          { templateId: 'tpl-1', usageCount: 50, successfulInterpolations: 48, failedInterpolations: 2, avgVariablesUsed: 3 },
        ],
        agents: [
          { agentId: 'agent-1', agentType: 'claude', totalExecutions: 200, successfulExecutions: 190, failedExecutions: 10, avgResponseTimeMs: 600, currentStatus: 'idle', uptimePercentage: 0.95, errorCount: 10 },
        ],
        timestamp: new Date().toISOString(),
        periodSeconds: 3600,
      });

      // getOrchMetrics from orchestration.service returns different metrics
      (getOrchMetrics as jest.Mock).mockResolvedValue({
        total: 100,
        byPattern: { sequential: 50, parallel: 30, conditional: 10, 'map-reduce': 10 },
        byStatus: { completed: 80, failed: 15, cancelled: 5 },
        avgDurationMs: 1500,
        successRate: 0.8,
        recentMetrics: [],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/metrics',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.workflows).toBeDefined();
      expect(body.data.stepsByAgent).toBeDefined();
    });
  });

  // ============================================
  // Health Endpoints
  // ============================================

  describe('GET /api/v1/agents/health', () => {
    it('should return healthy status', async () => {
      // Health endpoint uses getRegistryStats and getEngineStats
      (getRegistryStats as jest.Mock).mockResolvedValue({
        totalAgents: 2,
        byType: { claude: 1, strudel: 1, custom: 0 },
        byStatus: { idle: 2, busy: 0, error: 0, offline: 0 },
      });
      (getEngineStats as jest.Mock).mockResolvedValue({
        activeWorkflows: 1,
        queuedWorkflows: 0,
        maxConcurrent: 5,
        totalExecuted: 100,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.healthy).toBe(true);
    });

    it('should not require authentication', async () => {
      // Health endpoint uses getRegistryStats and getEngineStats
      (getRegistryStats as jest.Mock).mockResolvedValue({
        totalAgents: 0,
        byType: { claude: 0, strudel: 0, custom: 0 },
        byStatus: { idle: 0, busy: 0, error: 0, offline: 0 },
      });
      (getEngineStats as jest.Mock).mockResolvedValue({
        activeWorkflows: 0,
        queuedWorkflows: 0,
        maxConcurrent: 5,
        totalExecuted: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/agents/health',
        // No authorization header
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
