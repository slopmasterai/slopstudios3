/**
 * Agent API Routes
 * REST endpoints for agent orchestration, workflows, and prompt templates
 */

import { Type, type Static } from '@sinclair/typebox';

import { verifyJWT } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rate-limit.middleware.js';
import { getOrchestrationMetrics } from '../services/agent-metrics.service.js';
import {
  listAgents,
  getAgent,
  getAgentStatus,
  getRegistryStats,
  registerAgent,
  unregisterAgent,
  executeAgent,
} from '../services/agent-registry.service.js';
import {
  orchestrate,
  getOrchestrationMetrics as getOrchMetrics,
  orchestrateSelfCritique,
  orchestrateDiscussion,
} from '../services/orchestration.service.js';
import {
  getCritiqueResult,
  getCritiqueMetrics,
  getServiceConfig as getSelfCritiqueServiceConfig,
} from '../services/self-critique.service.js';
import {
  getDiscussionResult,
  getDiscussionMetrics,
  getServiceConfig as getDiscussionServiceConfig,
} from '../services/discussion.service.js';
import {
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  listTemplates,
  getTemplateVersions,
  interpolateTemplate,
} from '../services/prompt-template.service.js';
import {
  executeWorkflow,
  cancelWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  listWorkflows,
  getEngineStats,
} from '../services/workflow-engine.service.js';
import { timestamp } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type {
  PromptTemplate,
  PromptTemplateCategory,
  WorkflowDefinition,
  WorkflowState,
  AgentRegistration,
  OrchestrationRequest,
  OrchestrationResult,
  AgentSystemHealthResponse,
  SelfCritiqueConfig,
  SelfCritiqueResult,
  DiscussionConfig,
  DiscussionResult,
} from '../types/agent.types.js';
import type { ApiResponse } from '../types/index.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// =============================================================================
// Schema Definitions
// =============================================================================

const PromptVariableSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  type: Type.Union([
    Type.Literal('string'),
    Type.Literal('number'),
    Type.Literal('boolean'),
    Type.Literal('array'),
    Type.Literal('object'),
  ]),
  required: Type.Boolean(),
  default: Type.Optional(Type.Unknown()),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  validation: Type.Optional(Type.String({ maxLength: 500 })),
});

const CreateTemplateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  content: Type.String({ minLength: 1, maxLength: 100000 }),
  variables: Type.Array(PromptVariableSchema, { maxItems: 50 }),
  category: Type.Union([
    Type.Literal('system'),
    Type.Literal('user'),
    Type.Literal('workflow'),
    Type.Literal('helper'),
  ]),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })),
});

type CreateTemplateBody = Static<typeof CreateTemplateSchema>;

const UpdateTemplateSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  content: Type.Optional(Type.String({ minLength: 1, maxLength: 100000 })),
  variables: Type.Optional(Type.Array(PromptVariableSchema, { maxItems: 50 })),
  category: Type.Optional(
    Type.Union([
      Type.Literal('system'),
      Type.Literal('user'),
      Type.Literal('workflow'),
      Type.Literal('helper'),
    ])
  ),
  tags: Type.Optional(Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })),
  changeDescription: Type.Optional(Type.String({ maxLength: 500 })),
});

type UpdateTemplateBody = Static<typeof UpdateTemplateSchema>;

const InterpolateTemplateSchema = Type.Object({
  variables: Type.Record(Type.String(), Type.Unknown()),
});

type InterpolateTemplateBody = Static<typeof InterpolateTemplateSchema>;

const TemplateIdParamsSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
});

type TemplateIdParams = Static<typeof TemplateIdParamsSchema>;

const ListTemplatesQuerySchema = Type.Object({
  category: Type.Optional(
    Type.Union([
      Type.Literal('system'),
      Type.Literal('user'),
      Type.Literal('workflow'),
      Type.Literal('helper'),
    ])
  ),
  tags: Type.Optional(Type.String()),
  search: Type.Optional(Type.String({ maxLength: 100 })),
  page: Type.Optional(Type.Number({ minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
});

type ListTemplatesQuery = Static<typeof ListTemplatesQuerySchema>;

const WorkflowStepSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  agentType: Type.Union([
    Type.Literal('claude'),
    Type.Literal('strudel'),
    Type.Literal('custom'),
  ]),
  agentId: Type.Optional(Type.String()),
  promptTemplateId: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.String({ maxLength: 100000 })),
  inputs: Type.Array(
    Type.Object({
      variable: Type.String(),
      source: Type.Union([
        Type.Literal('context'),
        Type.Literal('step'),
        Type.Literal('literal'),
      ]),
      value: Type.Unknown(),
      stepId: Type.Optional(Type.String()),
    })
  ),
  outputs: Type.Array(
    Type.Object({
      field: Type.String(),
      contextPath: Type.String(),
    })
  ),
  dependencies: Type.Array(Type.String()),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 3600000 })),
  retryPolicy: Type.Optional(
    Type.Object({
      maxRetries: Type.Number({ minimum: 0, maximum: 10 }),
      initialDelayMs: Type.Number({ minimum: 100, maximum: 60000 }),
      backoffMultiplier: Type.Number({ minimum: 1, maximum: 5 }),
      maxDelayMs: Type.Number({ minimum: 1000, maximum: 300000 }),
    })
  ),
  condition: Type.Optional(Type.String({ maxLength: 1000 })),
  continueOnError: Type.Optional(Type.Boolean()),
});

const WorkflowDefinitionSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 100 }),
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  steps: Type.Array(WorkflowStepSchema, { minItems: 1, maxItems: 50 }),
  initialContext: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 3600000 })),
  maxParallelSteps: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
  defaultRetryPolicy: Type.Optional(
    Type.Object({
      maxRetries: Type.Number({ minimum: 0, maximum: 10 }),
      initialDelayMs: Type.Number({ minimum: 100, maximum: 60000 }),
      backoffMultiplier: Type.Number({ minimum: 1, maximum: 5 }),
      maxDelayMs: Type.Number({ minimum: 1000, maximum: 300000 }),
    })
  ),
  metadata: Type.Object({
    createdAt: Type.String(),
    createdBy: Type.Optional(Type.String()),
    updatedAt: Type.String(),
    updatedBy: Type.Optional(Type.String()),
    version: Type.Number({ minimum: 1 }),
    tags: Type.Optional(Type.Array(Type.String())),
  }),
});

const ExecuteWorkflowSchema = Type.Object({
  workflow: Type.Optional(WorkflowDefinitionSchema),
  workflowId: Type.Optional(Type.String()),
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  priority: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

type ExecuteWorkflowBody = Static<typeof ExecuteWorkflowSchema>;

const WorkflowIdParamsSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
});

type WorkflowIdParams = Static<typeof WorkflowIdParamsSchema>;

const ListWorkflowsQuerySchema = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal('pending'),
      Type.Literal('queued'),
      Type.Literal('running'),
      Type.Literal('paused'),
      Type.Literal('completed'),
      Type.Literal('failed'),
      Type.Literal('cancelled'),
    ])
  ),
  page: Type.Optional(Type.Number({ minimum: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
});

type ListWorkflowsQuery = Static<typeof ListWorkflowsQuerySchema>;

const OrchestrationTaskSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  agentType: Type.Union([
    Type.Literal('claude'),
    Type.Literal('strudel'),
    Type.Literal('custom'),
  ]),
  agentId: Type.Optional(Type.String()),
  promptTemplateId: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.String({ maxLength: 100000 })),
  variables: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 600000 })),
  condition: Type.Optional(Type.String({ maxLength: 1000 })),
  input: Type.Optional(Type.Unknown()),
});

const OrchestrateSchema = Type.Object({
  pattern: Type.Union([
    Type.Literal('sequential'),
    Type.Literal('parallel'),
    Type.Literal('conditional'),
    Type.Literal('map-reduce'),
    Type.Literal('self-critique'),
    Type.Literal('discussion'),
  ]),
  tasks: Type.Array(OrchestrationTaskSchema, { minItems: 1, maxItems: 100 }),
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 600000 })),
  options: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

type OrchestrateBody = Static<typeof OrchestrateSchema>;

// Self-Critique schemas
const QualityCriterionSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.String({ maxLength: 500 }),
  evaluationPrompt: Type.Optional(Type.String({ maxLength: 2000 })),
  weight: Type.Number({ minimum: 0, maximum: 1 }),
  threshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  rubric: Type.Optional(Type.String({ maxLength: 1000 })),
});

const SelfCritiqueConfigSchema = Type.Object({
  maxIterations: Type.Number({ minimum: 1, maximum: 10 }),
  // Accept both new field name (qualityCriteria) and legacy field name (criteria)
  qualityCriteria: Type.Optional(Type.Array(QualityCriterionSchema, { minItems: 1, maxItems: 10 })),
  criteria: Type.Optional(Type.Array(QualityCriterionSchema, { minItems: 1, maxItems: 10 })),
  improvementPromptTemplate: Type.Optional(Type.String({ maxLength: 5000 })),
  evaluationPromptTemplate: Type.Optional(Type.String({ maxLength: 5000 })),
  // Accept both new field name (stopOnQualityThreshold) and legacy field name (qualityThreshold)
  stopOnQualityThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  qualityThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 900000 })),
});

const SelfCritiqueRequestSchema = Type.Object({
  // Accept either nested task object (canonical) or top-level agentId/agentType/prompt (documented/legacy)
  task: Type.Optional(OrchestrationTaskSchema),
  agentId: Type.Optional(Type.String({ minLength: 1 })),
  agentType: Type.Optional(Type.Union([
    Type.Literal('claude'),
    Type.Literal('strudel'),
    Type.Literal('custom'),
  ])),
  prompt: Type.Optional(Type.String({ minLength: 1, maxLength: 100000 })),
  config: SelfCritiqueConfigSchema,
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 900000 })),
});

type SelfCritiqueRequestBody = Static<typeof SelfCritiqueRequestSchema>;

// Discussion schemas
const DiscussionParticipantSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  agentId: Type.String({ minLength: 1 }),
  role: Type.String({ minLength: 1, maxLength: 100 }),
  weight: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  perspective: Type.Optional(Type.String({ maxLength: 500 })),
  systemPrompt: Type.Optional(Type.String({ maxLength: 10000 })),
});

const DiscussionConfigSchema = Type.Object({
  maxRounds: Type.Number({ minimum: 1, maximum: 10 }),
  // participants can be in config or at top level of request
  participants: Type.Optional(Type.Array(DiscussionParticipantSchema, { minItems: 1, maxItems: 10 })),
  // Make discussionPromptTemplate optional with default
  discussionPromptTemplate: Type.Optional(Type.String({ maxLength: 5000 })),
  synthesisPromptTemplate: Type.Optional(Type.String({ maxLength: 5000 })),
  contributionPromptTemplate: Type.Optional(Type.String({ maxLength: 5000 })),
  consensusStrategy: Type.Optional(Type.Union([
    Type.Literal('unanimous'),
    Type.Literal('majority'),
    Type.Literal('weighted'),
    Type.Literal('facilitator'),
  ])),
  facilitatorAgentId: Type.Optional(Type.String()),
  convergenceThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  // Legacy field name alias
  consensusThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 1800000 })),
});

const DiscussionRequestSchema = Type.Object({
  topic: Type.String({ minLength: 1, maxLength: 10000 }),
  // Allow participants at top level (legacy/documented format) or nested in config
  participants: Type.Optional(Type.Array(DiscussionParticipantSchema, { minItems: 1, maxItems: 10 })),
  config: DiscussionConfigSchema,
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 1800000 })),
});

type DiscussionRequestBody = Static<typeof DiscussionRequestSchema>;

const CollaborationIdParamsSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
});

type CollaborationIdParams = Static<typeof CollaborationIdParamsSchema>;

const AgentIdParamsSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
});

type AgentIdParams = Static<typeof AgentIdParamsSchema>;

const AgentCapabilitySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.String({ maxLength: 500 }),
  inputTypes: Type.Optional(Type.Array(Type.String({ maxLength: 50 }))),
  outputTypes: Type.Optional(Type.Array(Type.String({ maxLength: 50 }))),
});

const RegisterAgentSchema = Type.Object({
  type: Type.Union([
    Type.Literal('claude'),
    Type.Literal('strudel'),
    Type.Literal('custom'),
  ]),
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  capabilities: Type.Array(AgentCapabilitySchema, { minItems: 1, maxItems: 20 }),
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

type RegisterAgentBody = Static<typeof RegisterAgentSchema>;

const ExecuteAgentSchema = Type.Object({
  prompt: Type.String({ minLength: 1, maxLength: 100000 }),
  context: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  config: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 600000 })),
});

type ExecuteAgentBody = Static<typeof ExecuteAgentSchema>;

const MetricsQuerySchema = Type.Object({
  includeRecent: Type.Optional(Type.Boolean()),
  periodSeconds: Type.Optional(Type.Number({ minimum: 60, maximum: 86400 })),
});

type MetricsQuery = Static<typeof MetricsQuerySchema>;

// Rate limiters
const standardRateLimiter = createRateLimiter('standard');
const heavyRateLimiter = createRateLimiter('heavy');

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Registers Agent API routes
 */
export function registerAgentRoutes(app: FastifyInstance): void {
  // ---------------------------------------------------------------------------
  // Prompt Template Endpoints
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/agents/templates - Create prompt template
   */
  app.post<{ Body: CreateTemplateBody }>(
    '/api/v1/agents/templates',
    {
      schema: { body: CreateTemplateSchema },
      preHandler: [verifyJWT, standardRateLimiter],
    },
    async (request: FastifyRequest<{ Body: CreateTemplateBody }>, reply: FastifyReply) => {
      const userId = request.user.id;

      try {
        const template = await createTemplate(request.body, userId);

        const response: ApiResponse<PromptTemplate> = {
          success: true,
          data: template,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(201).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to create template');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'TEMPLATE_CREATE_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(400).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/templates/:id - Get template by ID
   */
  app.get<{ Params: TemplateIdParams }>(
    '/api/v1/agents/templates/:id',
    {
      schema: { params: TemplateIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: TemplateIdParams }>, reply: FastifyReply) => {
      try {
        const template = await getTemplate(request.params.id);

        if (!template) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Template not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<PromptTemplate> = {
          success: true,
          data: template,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * PUT /api/v1/agents/templates/:id - Update template
   */
  app.put<{ Params: TemplateIdParams; Body: UpdateTemplateBody }>(
    '/api/v1/agents/templates/:id',
    {
      schema: { params: TemplateIdParamsSchema, body: UpdateTemplateSchema },
      preHandler: [verifyJWT, standardRateLimiter],
    },
    async (
      request: FastifyRequest<{ Params: TemplateIdParams; Body: UpdateTemplateBody }>,
      reply: FastifyReply
    ) => {
      const userId = request.user.id;

      try {
        const template = await updateTemplate(request.params.id, request.body, userId);

        const response: ApiResponse<PromptTemplate> = {
          success: true,
          data: template,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('not found')) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: errorMessage },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'TEMPLATE_UPDATE_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(400).send(response);
      }
    }
  );

  /**
   * DELETE /api/v1/agents/templates/:id - Delete template
   */
  app.delete<{ Params: TemplateIdParams }>(
    '/api/v1/agents/templates/:id',
    {
      schema: { params: TemplateIdParamsSchema },
      preHandler: [verifyJWT, standardRateLimiter],
    },
    async (request: FastifyRequest<{ Params: TemplateIdParams }>, reply: FastifyReply) => {
      try {
        const deleted = await deleteTemplate(request.params.id);

        if (!deleted) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Template not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'Template deleted successfully' },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/templates - List templates
   */
  app.get<{ Querystring: ListTemplatesQuery }>(
    '/api/v1/agents/templates',
    {
      schema: { querystring: ListTemplatesQuerySchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Querystring: ListTemplatesQuery }>, reply: FastifyReply) => {
      try {
        const tags = request.query.tags?.split(',').map((t) => t.trim());

        const result = await listTemplates({
          category: request.query.category as PromptTemplateCategory | undefined,
          tags,
          search: request.query.search,
          page: request.query.page ?? 1,
          pageSize: request.query.pageSize ?? 20,
        });

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/agents/templates/:id/interpolate - Test template interpolation
   */
  app.post<{ Params: TemplateIdParams; Body: InterpolateTemplateBody }>(
    '/api/v1/agents/templates/:id/interpolate',
    {
      schema: { params: TemplateIdParamsSchema, body: InterpolateTemplateSchema },
      preHandler: [verifyJWT, standardRateLimiter],
    },
    async (
      request: FastifyRequest<{ Params: TemplateIdParams; Body: InterpolateTemplateBody }>,
      reply: FastifyReply
    ) => {
      try {
        const result = await interpolateTemplate(request.params.id, request.body.variables);

        if (!result.success) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'INTERPOLATION_FAILED', message: result.error! },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/templates/:id/versions - Get template versions
   */
  app.get<{ Params: TemplateIdParams }>(
    '/api/v1/agents/templates/:id/versions',
    {
      schema: { params: TemplateIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: TemplateIdParams }>, reply: FastifyReply) => {
      try {
        const versions = await getTemplateVersions(request.params.id);

        const response: ApiResponse<typeof versions> = {
          success: true,
          data: versions,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Agent Registry Endpoints
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/agents/registry - List registered agents
   */
  app.get(
    '/api/v1/agents/registry',
    { preHandler: [verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agents = await listAgents();

        const response: ApiResponse<AgentRegistration[]> = {
          success: true,
          data: agents,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/registry/:id - Get agent details
   */
  app.get<{ Params: AgentIdParams }>(
    '/api/v1/agents/registry/:id',
    {
      schema: { params: AgentIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: AgentIdParams }>, reply: FastifyReply) => {
      try {
        const agent = await getAgent(request.params.id);

        if (!agent) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Agent not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<AgentRegistration> = {
          success: true,
          data: agent,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/registry/:id/health - Check agent health
   */
  app.get<{ Params: AgentIdParams }>(
    '/api/v1/agents/registry/:id/health',
    {
      schema: { params: AgentIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: AgentIdParams }>, reply: FastifyReply) => {
      try {
        const health = await getAgentStatus(request.params.id);

        if (!health) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Agent not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<typeof health> = {
          success: health.healthy,
          data: health,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(health.healthy ? 200 : 503).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/agents/registry - Register a new agent
   */
  app.post<{ Body: RegisterAgentBody }>(
    '/api/v1/agents/registry',
    {
      schema: { body: RegisterAgentSchema },
      preHandler: [verifyJWT, standardRateLimiter],
    },
    async (request: FastifyRequest<{ Body: RegisterAgentBody }>, reply: FastifyReply) => {
      try {
        // Create a simple executor for custom agents (no-op for REST registration)
        const executor = {
          execute(): Promise<{ success: boolean; error: string; durationMs: number }> {
            return Promise.resolve({
              success: false,
              error: 'Custom agent executor not configured',
              durationMs: 0,
            });
          },
          healthCheck(): Promise<{ agentId: string; healthy: boolean; status: 'idle'; message: string; lastCheck: string }> {
            return Promise.resolve({
              agentId: '',
              healthy: true,
              status: 'idle' as const,
              message: 'Custom agent registered via REST API',
              lastCheck: new Date().toISOString(),
            });
          },
        };

        const agent = await registerAgent(
          request.body.type,
          request.body.name,
          request.body.capabilities,
          executor,
          request.body.config
        );

        const response: ApiResponse<AgentRegistration> = {
          success: true,
          data: agent,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(201).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to register agent');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'AGENT_REGISTER_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(400).send(response);
      }
    }
  );

  /**
   * DELETE /api/v1/agents/registry/:id - Unregister an agent
   */
  app.delete<{ Params: AgentIdParams }>(
    '/api/v1/agents/registry/:id',
    {
      schema: { params: AgentIdParamsSchema },
      preHandler: [verifyJWT, standardRateLimiter],
    },
    async (request: FastifyRequest<{ Params: AgentIdParams }>, reply: FastifyReply) => {
      try {
        const deleted = await unregisterAgent(request.params.id);

        if (!deleted) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Agent not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'Agent unregistered successfully' },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Check for built-in agent error
        if (errorMessage.includes('built-in')) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'FORBIDDEN', message: errorMessage },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(403).send(response);
        }

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/agents/registry/:id/execute - Execute an agent
   */
  app.post<{ Params: AgentIdParams; Body: ExecuteAgentBody }>(
    '/api/v1/agents/registry/:id/execute',
    {
      schema: { params: AgentIdParamsSchema, body: ExecuteAgentSchema },
      preHandler: [verifyJWT, heavyRateLimiter],
    },
    async (
      request: FastifyRequest<{ Params: AgentIdParams; Body: ExecuteAgentBody }>,
      reply: FastifyReply
    ) => {
      try {
        const agent = await getAgent(request.params.id);

        if (!agent) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Agent not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const result = await executeAgent(request.params.id, {
          prompt: request.body.prompt,
          context: { userId: request.user.id, ...request.body.context },
          config: request.body.config,
          timeoutMs: request.body.timeoutMs,
        });

        const response: ApiResponse<typeof result> = {
          success: result.success,
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(result.success ? 200 : 500).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to execute agent');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'AGENT_EXECUTION_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Workflow Endpoints
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/agents/workflows - Create and execute workflow
   */
  app.post<{ Body: ExecuteWorkflowBody }>(
    '/api/v1/agents/workflows',
    {
      schema: { body: ExecuteWorkflowSchema },
      preHandler: [verifyJWT, heavyRateLimiter],
    },
    async (request: FastifyRequest<{ Body: ExecuteWorkflowBody }>, reply: FastifyReply) => {
      const userId = request.user.id;

      try {
        if (!request.body.workflow && !request.body.workflowId) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Either workflow or workflowId must be provided',
            },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        const workflow = request.body.workflow as WorkflowDefinition;

        const state = await executeWorkflow(
          workflow,
          userId,
          request.body.context,
          request.body.priority
        );

        const statusCode = state.status === 'queued' ? 202 : 201;

        const response: ApiResponse<WorkflowState> = {
          success: true,
          data: state,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(statusCode).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to execute workflow');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'WORKFLOW_EXECUTION_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(400).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/workflows/:id - Get workflow status
   */
  app.get<{ Params: WorkflowIdParams }>(
    '/api/v1/agents/workflows/:id',
    {
      schema: { params: WorkflowIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: WorkflowIdParams }>, reply: FastifyReply) => {
      try {
        const state = await getWorkflowStatus(request.params.id);

        if (!state) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Workflow not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        // Verify user owns this workflow
        if (state.userId !== request.user.id) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(403).send(response);
        }

        const response: ApiResponse<WorkflowState> = {
          success: true,
          data: state,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * DELETE /api/v1/agents/workflows/:id - Cancel workflow
   */
  app.delete<{ Params: WorkflowIdParams }>(
    '/api/v1/agents/workflows/:id',
    {
      schema: { params: WorkflowIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: WorkflowIdParams }>, reply: FastifyReply) => {
      try {
        const state = await getWorkflowStatus(request.params.id);

        if (!state) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Workflow not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        if (state.userId !== request.user.id) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(403).send(response);
        }

        const cancelled = await cancelWorkflow(request.params.id);

        if (!cancelled) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'CANCEL_FAILED', message: 'Workflow could not be cancelled' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        const response: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'Workflow cancelled successfully' },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/workflows - List user workflows
   */
  app.get<{ Querystring: ListWorkflowsQuery }>(
    '/api/v1/agents/workflows',
    {
      schema: { querystring: ListWorkflowsQuerySchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Querystring: ListWorkflowsQuery }>, reply: FastifyReply) => {
      const userId = request.user.id;

      try {
        const result = await listWorkflows(userId, {
          status: request.query.status as WorkflowState['status'] | undefined,
          page: request.query.page ?? 1,
          pageSize: request.query.pageSize ?? 20,
        });

        const response: ApiResponse<typeof result> = {
          success: true,
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/agents/workflows/:id/pause - Pause workflow
   */
  app.post<{ Params: WorkflowIdParams }>(
    '/api/v1/agents/workflows/:id/pause',
    {
      schema: { params: WorkflowIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: WorkflowIdParams }>, reply: FastifyReply) => {
      try {
        const state = await getWorkflowStatus(request.params.id);

        if (!state) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Workflow not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        if (state.userId !== request.user.id) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(403).send(response);
        }

        const paused = await pauseWorkflow(request.params.id);

        if (!paused) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'PAUSE_FAILED', message: 'Workflow could not be paused' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        const response: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'Workflow paused successfully' },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/agents/workflows/:id/resume - Resume workflow
   */
  app.post<{ Params: WorkflowIdParams }>(
    '/api/v1/agents/workflows/:id/resume',
    {
      schema: { params: WorkflowIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: WorkflowIdParams }>, reply: FastifyReply) => {
      try {
        const state = await getWorkflowStatus(request.params.id);

        if (!state) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Workflow not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        if (state.userId !== request.user.id) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(403).send(response);
        }

        const resumed = await resumeWorkflow(request.params.id);

        if (!resumed) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'RESUME_FAILED', message: 'Workflow could not be resumed' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        const response: ApiResponse<{ message: string }> = {
          success: true,
          data: { message: 'Workflow resumed successfully' },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Orchestration Endpoints
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/agents/orchestrate - Execute orchestration with any pattern
   */
  app.post<{ Body: OrchestrateBody }>(
    '/api/v1/agents/orchestrate',
    {
      schema: { body: OrchestrateSchema },
      preHandler: [verifyJWT, heavyRateLimiter],
    },
    async (request: FastifyRequest<{ Body: OrchestrateBody }>, reply: FastifyReply) => {
      try {
        const result = await orchestrate({
          ...request.body,
          userId: request.user.id,
        } as OrchestrationRequest);

        const response: ApiResponse<OrchestrationResult> = {
          success: result.status === 'completed',
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(result.status === 'completed' ? 200 : 500).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to orchestrate');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'ORCHESTRATION_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/agents/orchestrate/sequential - Execute sequential chain
   */
  app.post<{ Body: OrchestrateBody }>(
    '/api/v1/agents/orchestrate/sequential',
    {
      schema: { body: OrchestrateSchema },
      preHandler: [verifyJWT, heavyRateLimiter],
    },
    async (request: FastifyRequest<{ Body: OrchestrateBody }>, reply: FastifyReply) => {
      try {
        const result = await orchestrate({
          ...request.body,
          pattern: 'sequential',
          userId: request.user.id,
        } as OrchestrationRequest);

        const response: ApiResponse<OrchestrationResult> = {
          success: result.status === 'completed',
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(result.status === 'completed' ? 200 : 500).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'ORCHESTRATION_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/agents/orchestrate/parallel - Execute parallel agents
   */
  app.post<{ Body: OrchestrateBody }>(
    '/api/v1/agents/orchestrate/parallel',
    {
      schema: { body: OrchestrateSchema },
      preHandler: [verifyJWT, heavyRateLimiter],
    },
    async (request: FastifyRequest<{ Body: OrchestrateBody }>, reply: FastifyReply) => {
      try {
        const result = await orchestrate({
          ...request.body,
          pattern: 'parallel',
          userId: request.user.id,
        } as OrchestrationRequest);

        const response: ApiResponse<OrchestrationResult> = {
          success: result.status === 'completed',
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(result.status === 'completed' ? 200 : 500).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'ORCHESTRATION_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/orchestrate/metrics - Get orchestration metrics
   */
  app.get(
    '/api/v1/agents/orchestrate/metrics',
    { preHandler: [verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await getOrchMetrics();

        const response: ApiResponse<typeof metrics> = {
          success: true,
          data: metrics,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Self-Critique Endpoints
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/agents/orchestrate/self-critique - Execute self-critique pattern
   */
  app.post<{ Body: SelfCritiqueRequestBody }>(
    '/api/v1/agents/orchestrate/self-critique',
    {
      schema: { body: SelfCritiqueRequestSchema },
      preHandler: [verifyJWT, heavyRateLimiter],
    },
    async (request: FastifyRequest<{ Body: SelfCritiqueRequestBody }>, reply: FastifyReply) => {
      try {
        // Transform incoming aliases to canonical service config shape
        const inputConfig = request.body.config as Record<string, unknown>;
        const selfCritiqueServiceConfig = getSelfCritiqueServiceConfig();

        // Resolve maxIterations with validation
        let maxIterations = inputConfig['maxIterations'] as number | undefined;
        if (maxIterations === undefined || maxIterations === null || maxIterations < 1) {
          if (maxIterations !== undefined && maxIterations !== null && maxIterations < 1) {
            // Explicit zero or negative value - return 400
            const response: ApiResponse<null> = {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'maxIterations must be a positive integer' },
              meta: { timestamp: timestamp(), requestId: request.id },
            };
            return await reply.status(400).send(response);
          }
          // Missing - default to service config
          maxIterations = selfCritiqueServiceConfig.defaultMaxIterations;
        }

        // Resolve stopOnQualityThreshold with default
        const stopOnQualityThreshold = (inputConfig['stopOnQualityThreshold'] ?? inputConfig['qualityThreshold'] ?? selfCritiqueServiceConfig.defaultQualityThreshold) as number;

        // Resolve qualityCriteria from either field name (canonical or legacy)
        const qualityCriteria = (inputConfig['qualityCriteria'] ?? inputConfig['criteria']) as SelfCritiqueConfig['qualityCriteria'];

        // Validate that at least one quality criterion is provided
        if (!qualityCriteria || qualityCriteria.length === 0) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'At least one quality criterion must be provided in qualityCriteria or criteria',
            },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        const normalizedConfig: SelfCritiqueConfig = {
          maxIterations,
          // Map 'criteria' (legacy) to 'qualityCriteria' (canonical)
          qualityCriteria,
          // Map 'qualityThreshold' (legacy) to 'stopOnQualityThreshold' (canonical)
          stopOnQualityThreshold,
          improvementPromptTemplate: inputConfig['improvementPromptTemplate'] as string | undefined,
          evaluationPromptTemplate: inputConfig['evaluationPromptTemplate'] as string | undefined,
        };

        // Build task from either nested task object or top-level agentId/prompt (documented/legacy format)
        const reqBody = request.body as Record<string, unknown>;
        let task = request.body.task;

        if (!task) {
          // Resolve agentType: use provided agentType, or look up from agentId, or default to 'claude'
          let agentType: 'claude' | 'strudel' | 'custom' = 'claude';
          const providedAgentType = reqBody['agentType'] as 'claude' | 'strudel' | 'custom' | undefined;
          const providedAgentId = reqBody['agentId'] as string | undefined;

          if (providedAgentType) {
            agentType = providedAgentType;
          } else if (providedAgentId) {
            // Resolve type from agentId
            const agent = await getAgent(providedAgentId);
            if (!agent) {
              const response: ApiResponse<null> = {
                success: false,
                error: {
                  code: 'INVALID_REQUEST',
                  message: `Cannot resolve agent type: agent with id '${providedAgentId}' not found`,
                },
                meta: { timestamp: timestamp(), requestId: request.id },
              };
              return await reply.status(400).send(response);
            }
            agentType = agent.type;
          }

          task = {
            id: 'self-critique-task',
            agentType,
            agentId: providedAgentId,
            prompt: reqBody['prompt'] as string,
          };
        }

        const result = await orchestrateSelfCritique(
          {
            userId: request.user.id,
            pattern: 'self-critique',
            tasks: [task as Parameters<typeof orchestrateSelfCritique>[0]['tasks'][0]],
            context: request.body.context,
            timeoutMs: request.body.timeoutMs,
            options: normalizedConfig as unknown as Record<string, unknown>,
          },
          normalizedConfig
        );

        const isCompleted = result.status === 'completed';

        if (isCompleted) {
          const response: ApiResponse<SelfCritiqueResult> = {
            success: true,
            data: result,
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(200).send(response);
        } else {
          const response: ApiResponse<SelfCritiqueResult> = {
            success: false,
            data: result,
            error: { code: 'SELF_CRITIQUE_FAILED', message: result.error ?? 'Self-critique execution did not complete successfully' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(500).send(response);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Self-critique execution failed');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'SELF_CRITIQUE_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/critique/:id - Get self-critique result by ID
   */
  app.get<{ Params: CollaborationIdParams }>(
    '/api/v1/agents/critique/:id',
    {
      schema: { params: CollaborationIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: CollaborationIdParams }>, reply: FastifyReply) => {
      try {
        const result = await getCritiqueResult(request.params.id);

        if (!result) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Critique result not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<SelfCritiqueResult> = {
          success: true,
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/critique/metrics - Get self-critique metrics
   */
  app.get(
    '/api/v1/agents/critique/metrics',
    { preHandler: [verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await getCritiqueMetrics();

        const response: ApiResponse<typeof metrics> = {
          success: true,
          data: metrics,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Discussion Endpoints
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/agents/orchestrate/discussion - Execute discussion pattern
   */
  app.post<{ Body: DiscussionRequestBody }>(
    '/api/v1/agents/orchestrate/discussion',
    {
      schema: { body: DiscussionRequestSchema },
      preHandler: [verifyJWT, heavyRateLimiter],
    },
    async (request: FastifyRequest<{ Body: DiscussionRequestBody }>, reply: FastifyReply) => {
      try {
        // Transform incoming request to canonical service config shape
        const inputConfig = request.body.config as Record<string, unknown>;
        const discussionServiceConfig = getDiscussionServiceConfig();

        // Resolve maxRounds with validation
        let maxRounds = inputConfig['maxRounds'] as number | undefined;
        if (maxRounds === undefined || maxRounds === null || maxRounds < 1) {
          if (maxRounds !== undefined && maxRounds !== null && maxRounds < 1) {
            // Explicit zero or negative value - return 400
            const response: ApiResponse<null> = {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'maxRounds must be a positive integer' },
              meta: { timestamp: timestamp(), requestId: request.id },
            };
            return await reply.status(400).send(response);
          }
          // Missing - default to service config
          maxRounds = discussionServiceConfig.defaultMaxRounds;
        }

        // Resolve participants from top-level (legacy/documented) or nested in config
        const participants = (request.body.participants ?? inputConfig['participants']) as DiscussionConfig['participants'];

        // Validate that participants is provided and has at least one entry
        if (!participants || participants.length === 0) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'At least one participant must be provided in participants array',
            },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        // Resolve convergenceThreshold with default
        const convergenceThreshold = (inputConfig['convergenceThreshold'] ?? inputConfig['consensusThreshold'] ?? discussionServiceConfig.defaultConvergenceThreshold) as number;

        // Default consensusStrategy to 'majority' if not provided (safe default that doesn't require facilitatorAgentId)
        const consensusStrategy = (inputConfig['consensusStrategy'] as DiscussionConfig['consensusStrategy']) ?? discussionServiceConfig.defaultConsensusStrategy ?? 'majority';

        const normalizedConfig: DiscussionConfig = {
          maxRounds,
          participants,
          discussionPromptTemplate: inputConfig['discussionPromptTemplate'] as string | undefined,
          // Plumb caller-provided contribution and synthesis templates
          contributionPromptTemplate: inputConfig['contributionPromptTemplate'] as string | undefined,
          synthesisPromptTemplate: inputConfig['synthesisPromptTemplate'] as string | undefined,
          consensusStrategy,
          facilitatorAgentId: inputConfig['facilitatorAgentId'] as string | undefined,
          // Map 'consensusThreshold' (legacy) to 'convergenceThreshold' (canonical)
          convergenceThreshold,
        };

        // Validate facilitatorAgentId is required when consensusStrategy is 'facilitator'
        if (consensusStrategy === 'facilitator' && !normalizedConfig.facilitatorAgentId) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'facilitatorAgentId is required when consensusStrategy is "facilitator"',
            },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(400).send(response);
        }

        const result = await orchestrateDiscussion(
          {
            userId: request.user.id,
            pattern: 'discussion',
            tasks: [{ id: 'discussion-topic', agentType: 'claude', prompt: request.body.topic }],
            context: request.body.context,
            timeoutMs: request.body.timeoutMs,
            options: normalizedConfig as unknown as Record<string, unknown>,
          },
          normalizedConfig
        );

        const response: ApiResponse<DiscussionResult> = {
          success: result.status === 'completed',
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(result.status === 'completed' ? 200 : 500).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Discussion execution failed');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'DISCUSSION_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/discussion/:id - Get discussion result by ID
   */
  app.get<{ Params: CollaborationIdParams }>(
    '/api/v1/agents/discussion/:id',
    {
      schema: { params: CollaborationIdParamsSchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: CollaborationIdParams }>, reply: FastifyReply) => {
      try {
        const result = await getDiscussionResult(request.params.id);

        if (!result) {
          const response: ApiResponse<null> = {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Discussion result not found' },
            meta: { timestamp: timestamp(), requestId: request.id },
          };
          return await reply.status(404).send(response);
        }

        const response: ApiResponse<DiscussionResult> = {
          success: true,
          data: result,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/agents/discussion/metrics - Get discussion metrics
   */
  app.get(
    '/api/v1/agents/discussion/metrics',
    { preHandler: [verifyJWT] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await getDiscussionMetrics();

        const response: ApiResponse<typeof metrics> = {
          success: true,
          data: metrics,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Metrics Endpoint
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/agents/metrics - Get comprehensive agent and orchestration metrics
   */
  app.get<{ Querystring: MetricsQuery }>(
    '/api/v1/agents/metrics',
    {
      schema: { querystring: MetricsQuerySchema },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Querystring: MetricsQuery }>, reply: FastifyReply) => {
      try {
        const periodSeconds = request.query.periodSeconds ?? 3600;
        const metrics = await getOrchestrationMetrics(periodSeconds);

        // Get orchestration-specific metrics if includeRecent is requested
        const orchMetrics = await getOrchMetrics();

        // Build response with both agent service metrics and orchestration metrics
        const responseData = {
          ...metrics,
          orchestration: {
            total: orchMetrics.total,
            byPattern: orchMetrics.byPattern,
            byStatus: orchMetrics.byStatus,
            avgDurationMs: orchMetrics.avgDurationMs,
            successRate: orchMetrics.successRate,
            recentMetrics: request.query.includeRecent !== false ? orchMetrics.recentMetrics : undefined,
          },
        };

        const response: ApiResponse<typeof responseData> = {
          success: true,
          data: responseData,
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to get metrics');

        const response: ApiResponse<null> = {
          success: false,
          error: { code: 'METRICS_FAILED', message: errorMessage },
          meta: { timestamp: timestamp(), requestId: request.id },
        };

        return await reply.status(500).send(response);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Health Endpoint
  // ---------------------------------------------------------------------------

  /**
   * GET /api/v1/agents/health - Overall agent system health
   */
  app.get('/api/v1/agents/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [registryStats, engineStats] = await Promise.all([
        getRegistryStats(),
        getEngineStats(),
      ]);

      const health: AgentSystemHealthResponse = {
        healthy: true,
        services: {
          promptTemplates: true,
          agentRegistry: true,
          workflowEngine: true,
          orchestration: true,
        },
        agents: {
          total: registryStats.totalAgents,
          healthy:
            registryStats.byStatus.idle +
            registryStats.byStatus.busy,
          degraded: registryStats.byStatus.error,
          offline: registryStats.byStatus.offline,
        },
        workflows: {
          active: engineStats.activeWorkflows,
          queued: engineStats.queuedWorkflows,
          maxConcurrent: engineStats.maxConcurrent,
        },
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };

      // Mark unhealthy if too many agents are offline/error
      if (registryStats.byStatus.error + registryStats.byStatus.offline > registryStats.totalAgents / 2) {
        health.healthy = false;
      }

      const response: ApiResponse<AgentSystemHealthResponse> = {
        success: health.healthy,
        data: health,
        meta: { timestamp: timestamp(), requestId: request.id },
      };

      return await reply.status(health.healthy ? 200 : 503).send(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const response: ApiResponse<null> = {
        success: false,
        error: { code: 'HEALTH_CHECK_FAILED', message: errorMessage },
        meta: { timestamp: timestamp(), requestId: request.id },
      };

      return await reply.status(500).send(response);
    }
  });

  logger.info('Agent routes registered');
}

export default registerAgentRoutes;
