/**
 * Claude API Routes
 * REST endpoints for Claude CLI execution and process management
 */

import { Type, type Static } from '@sinclair/typebox';

import { verifyJWT } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rate-limit.middleware.js';
import { getServiceMetrics, getRecentMetrics } from '../services/claude-metrics.service.js';
import {
  executeClaudeCommand,
  enqueueClaudeCommand,
  cancelClaudeProcess,
  getClaudeProcessStatus,
  getClaudeServiceHealth,
} from '../services/claude.service.js';
import { getProcessState, listUserProcesses } from '../services/process-manager.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type {
  ClaudeAsyncExecuteResponse,
  ClaudeProcessStatusResponse,
  ClaudeProcessListResponse,
  ClaudeHealthResponse,
  ClaudeProcessResult,
  ClaudeServiceMetrics,
  ClaudeProcessMetrics,
} from '../types/claude.types.js';
import type { ApiResponse } from '../types/index.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Request/Response schemas using Typebox
const ExecuteRequestSchema = Type.Object({
  prompt: Type.String({ minLength: 1, maxLength: 100000 }),
  systemPrompt: Type.Optional(Type.String({ maxLength: 10000 })),
  model: Type.Optional(Type.String()),
  maxTokens: Type.Optional(Type.Number({ minimum: 1, maximum: 100000 })),
  stream: Type.Optional(Type.Boolean()),
  workingDirectory: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 600000 })),
  priority: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});

type ExecuteRequestBody = Static<typeof ExecuteRequestSchema>;

const ProcessIdParamsSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
});

type ProcessIdParams = Static<typeof ProcessIdParamsSchema>;

const ListProcessesQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(
    Type.Union([
      Type.Literal('pending'),
      Type.Literal('queued'),
      Type.Literal('running'),
      Type.Literal('completed'),
      Type.Literal('failed'),
      Type.Literal('timeout'),
      Type.Literal('cancelled'),
    ])
  ),
});

type ListProcessesQuery = Static<typeof ListProcessesQuerySchema>;

const MetricsQuerySchema = Type.Object({
  periodSeconds: Type.Optional(Type.Number({ minimum: 60, maximum: 86400, default: 3600 })),
  includeRecent: Type.Optional(Type.Boolean({ default: false })),
  recentLimit: Type.Optional(Type.Number({ minimum: 1, maximum: 1000, default: 100 })),
});

type MetricsQuery = Static<typeof MetricsQuerySchema>;

// Claude-specific rate limiter (stricter than default)
const claudeRateLimiter = createRateLimiter('heavy');

/**
 * Registers Claude API routes
 */
export function registerClaudeRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/claude/execute - Execute Claude command synchronously
   * Waits for the command to complete and returns the result
   */
  app.post<{ Body: ExecuteRequestBody }>(
    '/api/v1/claude/execute',
    {
      schema: {
        body: ExecuteRequestSchema,
      },
      preHandler: [verifyJWT, claudeRateLimiter],
    },
    async (request: FastifyRequest<{ Body: ExecuteRequestBody }>, reply: FastifyReply) => {
      const userId = request.user.id;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in token',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(401).send(response);
      }

      const { prompt, systemPrompt, model, maxTokens, workingDirectory, timeoutMs, priority } =
        request.body;

      logger.info(
        { userId, promptLength: prompt.length, requestId: request.id },
        'Sync Claude execute request'
      );

      try {
        const result = await executeClaudeCommand({
          id: generateRequestId().replace('req_', 'claude_'),
          userId,
          prompt,
          systemPrompt,
          model,
          maxTokens,
          workingDirectory,
          timeoutMs,
          priority,
          stream: false,
        });

        // Check for queue status (means we couldn't execute synchronously)
        if (result.status === 'queued') {
          const response: ApiResponse<ClaudeAsyncExecuteResponse> = {
            success: true,
            data: {
              processId: result.id,
              status: result.status,
              queuePosition: result.queuePosition,
              estimatedWaitSeconds: result.estimatedWaitSeconds,
              message: 'Request queued due to high load. Use async endpoint or poll for status.',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(202).send(response);
        }

        // Check for rate-limit failure and respond with appropriate status code
        if (result.status === 'failed' && result.error?.toLowerCase().includes('rate limit')) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: result.error,
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(429).send(response);
        }

        // Check for CLI-unavailable errors and respond with 503
        if (result.status === 'failed' && result.error) {
          const errorLower = result.error.toLowerCase();
          if (errorLower.includes('not available') || errorLower.includes('not found')) {
            const response: ApiResponse<null> = {
              success: false,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: result.error,
              },
              meta: {
                timestamp: timestamp(),
                requestId: request.id,
              },
            };
            return await reply.status(503).send(response);
          }
        }

        const response: ApiResponse<ClaudeProcessResult> = {
          success: result.status === 'completed',
          data: result,
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };

        const statusCode = result.status === 'completed' ? 200 : 500;
        return await reply.status(statusCode).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { userId, error: errorMessage, requestId: request.id },
          'Claude execute failed'
        );

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'EXECUTION_FAILED',
            message: errorMessage,
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * POST /api/v1/claude/execute/async - Execute Claude command asynchronously
   * Returns immediately with process ID and initial status (fire-and-forget)
   */
  app.post<{ Body: ExecuteRequestBody }>(
    '/api/v1/claude/execute/async',
    {
      schema: {
        body: ExecuteRequestSchema,
      },
      preHandler: [verifyJWT, claudeRateLimiter],
    },
    async (request: FastifyRequest<{ Body: ExecuteRequestBody }>, reply: FastifyReply) => {
      const userId = request.user.id;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in token',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(401).send(response);
      }

      const { prompt, systemPrompt, model, maxTokens, workingDirectory, timeoutMs, priority } =
        request.body;

      const processId = generateRequestId().replace('req_', 'claude_');

      logger.info(
        { userId, processId, promptLength: prompt.length, requestId: request.id },
        'Async Claude execute request'
      );

      try {
        // Fire-and-forget: returns immediately without waiting for completion
        const result = await enqueueClaudeCommand({
          id: processId,
          userId,
          prompt,
          systemPrompt,
          model,
          maxTokens,
          workingDirectory,
          timeoutMs,
          priority,
          stream: false,
        });

        // Handle error during enqueue (rate limit, CLI missing, etc.)
        if (result.error) {
          const isRateLimitError = result.error.toLowerCase().includes('rate limit');
          const isCliMissingError =
            result.error.toLowerCase().includes('not available') ||
            result.error.toLowerCase().includes('not found');

          const statusCode = isRateLimitError ? 429 : isCliMissingError ? 503 : 500;
          const errorCode = isRateLimitError
            ? 'RATE_LIMIT_EXCEEDED'
            : isCliMissingError
              ? 'SERVICE_UNAVAILABLE'
              : 'EXECUTION_FAILED';

          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: errorCode,
              message: result.error,
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(statusCode).send(response);
        }

        // Return 202 Accepted with process ID and initial status
        const response: ApiResponse<ClaudeAsyncExecuteResponse> = {
          success: true,
          data: {
            processId: result.processId,
            status: result.status,
            queuePosition: result.queuePosition,
            estimatedWaitSeconds: result.estimatedWaitSeconds,
            message:
              result.status === 'queued'
                ? 'Request queued due to high load. Poll /api/v1/claude/processes/:id for status.'
                : 'Process started. Poll /api/v1/claude/processes/:id for status.',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };

        return await reply.status(202).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { userId, processId, error: errorMessage, requestId: request.id },
          'Async Claude execution failed'
        );

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'EXECUTION_FAILED',
            message: errorMessage,
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/claude/processes/:id - Get process status
   */
  app.get<{ Params: ProcessIdParams }>(
    '/api/v1/claude/processes/:id',
    {
      schema: {
        params: ProcessIdParamsSchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: ProcessIdParams }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const { id: processId } = request.params;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in token',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(401).send(response);
      }

      try {
        const status = await getClaudeProcessStatus(processId);

        if (!status) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Process not found',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(404).send(response);
        }

        // Get additional state info
        const state = await getProcessState(processId);

        // Verify process belongs to requesting user
        if (state?.config.userId !== userId) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied to this process',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(403).send(response);
        }

        const statusResponse: ClaudeProcessStatusResponse = {
          processId,
          status: status.status,
          queuePosition: status.queuePosition,
          createdAt: state.createdAt,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
          durationMs: status.result?.durationMs,
          result: status.result,
        };

        const response: ApiResponse<ClaudeProcessStatusResponse> = {
          success: true,
          data: statusResponse,
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ processId, error: errorMessage }, 'Failed to get process status');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get process status',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * DELETE /api/v1/claude/processes/:id - Cancel running process
   */
  app.delete<{ Params: ProcessIdParams }>(
    '/api/v1/claude/processes/:id',
    {
      schema: {
        params: ProcessIdParamsSchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: ProcessIdParams }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const { id: processId } = request.params;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in token',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(401).send(response);
      }

      try {
        // Verify process exists
        const status = await getClaudeProcessStatus(processId);

        if (!status) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Process not found',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(404).send(response);
        }

        // Verify process belongs to requesting user
        const state = await getProcessState(processId);
        if (state?.config.userId !== userId) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied to this process',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(403).send(response);
        }

        // Check if already completed
        if (['completed', 'failed', 'timeout', 'cancelled'].includes(status.status)) {
          const response: ApiResponse<{ message: string }> = {
            success: false,
            error: {
              code: 'PROCESS_ALREADY_COMPLETED',
              message: `Process already ${status.status}`,
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(400).send(response);
        }

        const cancelled = await cancelClaudeProcess(processId);

        if (cancelled) {
          logger.info({ userId, processId }, 'Process cancelled');

          const response: ApiResponse<{ message: string }> = {
            success: true,
            data: {
              message: 'Process cancelled successfully',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(200).send(response);
        } else {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'CANCEL_FAILED',
              message: 'Failed to cancel process',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(500).send(response);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ processId, error: errorMessage }, 'Failed to cancel process');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to cancel process',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/claude/processes - List user's processes (including queued, completed, failed, etc.)
   */
  app.get<{ Querystring: ListProcessesQuery }>(
    '/api/v1/claude/processes',
    {
      schema: {
        querystring: ListProcessesQuerySchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Querystring: ListProcessesQuery }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const page = request.query.page ?? 1;
      const pageSize = request.query.pageSize ?? 20;
      const statusFilter = request.query.status;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in token',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(401).send(response);
      }

      try {
        // Get all processes for user (including queued, completed, failed, etc.)
        const result = await listUserProcesses({
          userId,
          status: statusFilter,
          page,
          pageSize,
        });

        // Map process states to response format
        const processes: ClaudeProcessStatusResponse[] = result.processes.map((state) => {
          const durationMs =
            state.completedAt && state.startedAt
              ? new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime()
              : undefined;

          // Build result only for completed/failed processes
          let processResult: ClaudeProcessResult | undefined;
          if (
            (state.status === 'completed' ||
              state.status === 'failed' ||
              state.status === 'timeout' ||
              state.status === 'cancelled') &&
            state.startedAt &&
            state.completedAt
          ) {
            processResult = {
              id: state.config.id,
              userId: state.config.userId,
              status: state.status,
              stdout: state.stdout,
              stderr: state.stderr,
              exitCode: state.exitCode ?? null,
              startedAt: state.startedAt,
              completedAt: state.completedAt,
              durationMs: durationMs ?? 0,
              error: state.error,
            };
          }

          return {
            processId: state.config.id,
            status: state.status,
            queuePosition: state.queuePosition,
            createdAt: state.createdAt,
            startedAt: state.startedAt,
            completedAt: state.completedAt,
            durationMs,
            result: processResult,
          };
        });

        const listResponse: ClaudeProcessListResponse = {
          processes,
          total: result.total,
          pagination: {
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
          },
        };

        const response: ApiResponse<ClaudeProcessListResponse> = {
          success: true,
          data: listResponse,
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ userId, error: errorMessage }, 'Failed to list processes');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to list processes',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/claude/metrics - Get service metrics
   */
  app.get<{ Querystring: MetricsQuery }>(
    '/api/v1/claude/metrics',
    {
      schema: {
        querystring: MetricsQuerySchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Querystring: MetricsQuery }>, reply: FastifyReply) => {
      const userId = request.user.id;

      if (!userId) {
        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in token',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(401).send(response);
      }

      try {
        const periodSeconds = request.query.periodSeconds ?? 3600;
        const includeRecent = request.query.includeRecent ?? false;
        const recentLimit = request.query.recentLimit ?? 100;

        const metrics = await getServiceMetrics(periodSeconds);

        let recentMetrics: ClaudeProcessMetrics[] | undefined;
        if (includeRecent) {
          recentMetrics = await getRecentMetrics(recentLimit);
        }

        const responseData: ClaudeServiceMetrics & { recentMetrics?: ClaudeProcessMetrics[] } = {
          ...metrics,
        };

        if (recentMetrics) {
          responseData.recentMetrics = recentMetrics;
        }

        const response: ApiResponse<typeof responseData> = {
          success: true,
          data: responseData,
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: errorMessage }, 'Failed to get metrics');

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get service metrics',
          },
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };
        return await reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/v1/claude/health - Check Claude CLI availability
   */
  app.get('/api/v1/claude/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await getClaudeServiceHealth();

      const response: ApiResponse<ClaudeHealthResponse> = {
        success: health.healthy,
        data: health,
        meta: {
          timestamp: timestamp(),
          requestId: request.id,
        },
      };

      const statusCode = health.healthy ? 200 : 503;
      return await reply.status(statusCode).send(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Claude health check failed');

      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Failed to check Claude service health',
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id,
        },
      };
      return await reply.status(500).send(response);
    }
  });

  logger.info('Claude routes registered');
}

export default registerClaudeRoutes;
