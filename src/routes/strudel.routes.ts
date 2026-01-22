/**
 * Strudel API Routes
 * REST endpoints for Strudel pattern validation and audio rendering
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { Type, type Static } from '@sinclair/typebox';

import { verifyJWT } from '../middleware/auth.middleware.js';
import { createRateLimiter } from '../middleware/rate-limit.middleware.js';
import { getServiceMetrics, getRecentMetrics } from '../services/strudel-metrics.service.js';
import {
  validateStrudelPattern,
  executeStrudelPattern,
  enqueueStrudelPattern,
  cancelStrudelProcess,
  getStrudelProcessStatus,
  getStrudelProcessState,
  getStrudelServiceHealth,
  listUserStrudelProcesses,
} from '../services/strudel.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import type { ApiResponse } from '../types/index.js';
import type {
  StrudelValidationResult,
  StrudelProcessResult,
  StrudelHealthResponse,
  StrudelServiceMetrics,
  StrudelProcessStatus,
} from '../types/strudel.types.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Request/Response schemas using Typebox
const ValidateRequestSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 100000 }),
});

type ValidateRequestBody = Static<typeof ValidateRequestSchema>;

const ExecuteRequestSchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 100000 }),
  options: Type.Optional(
    Type.Object({
      duration: Type.Optional(Type.Number({ minimum: 1, maximum: 300 })),
      sampleRate: Type.Optional(Type.Number({ minimum: 8000, maximum: 96000 })),
      channels: Type.Optional(Type.Number({ minimum: 1, maximum: 2 })),
      format: Type.Optional(Type.Literal('wav')),
      tempo: Type.Optional(Type.Number({ minimum: 20, maximum: 300 })),
    })
  ),
  priority: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  requestId: Type.Optional(Type.String()),
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
      Type.Literal('validating'),
      Type.Literal('rendering'),
      Type.Literal('complete'),
      Type.Literal('failed'),
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

// Strudel-specific rate limiter (stricter than default)
const strudelRateLimiter = createRateLimiter('heavy');

// Response type for process status
interface StrudelProcessStatusResponse {
  processId: string;
  status: StrudelProcessStatus;
  progress?: number;
  queuePosition?: number;
  code?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  result?: StrudelProcessResult;
}

// Response type for process list
interface StrudelProcessListResponse {
  processes: StrudelProcessStatusResponse[];
  total: number;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// Response type for async execute
interface StrudelAsyncExecuteResponse {
  processId: string;
  status: StrudelProcessStatus;
  queuePosition?: number;
  message: string;
}

/**
 * Registers Strudel API routes
 */
export function registerStrudelRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/strudel/validate - Validate pattern code (no rendering)
   */
  app.post<{ Body: ValidateRequestBody }>(
    '/api/v1/strudel/validate',
    {
      schema: {
        body: ValidateRequestSchema,
      },
      preHandler: [verifyJWT, strudelRateLimiter],
    },
    async (request: FastifyRequest<{ Body: ValidateRequestBody }>, reply: FastifyReply) => {
      const userId = request.user?.id;

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

      const { code } = request.body;

      logger.info(
        { userId, codeLength: code.length, requestId: request.id },
        'Strudel validate request'
      );

      try {
        const result = await validateStrudelPattern(code);

        const response: ApiResponse<StrudelValidationResult> = {
          success: result.isValid,
          data: result,
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { userId, error: errorMessage, requestId: request.id },
          'Strudel validation failed'
        );

        const response: ApiResponse<null> = {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
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
   * POST /api/v1/strudel/execute - Validate and render pattern synchronously
   */
  app.post<{ Body: ExecuteRequestBody }>(
    '/api/v1/strudel/execute',
    {
      schema: {
        body: ExecuteRequestSchema,
      },
      preHandler: [verifyJWT, strudelRateLimiter],
    },
    async (request: FastifyRequest<{ Body: ExecuteRequestBody }>, reply: FastifyReply) => {
      const userId = request.user?.id;

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

      const { code, options, priority, requestId: clientRequestId } = request.body;
      const processId = generateRequestId().replace('req_', 'strudel_');

      logger.info(
        { userId, processId, codeLength: code.length, requestId: request.id },
        'Strudel execute request'
      );

      try {
        const result = await executeStrudelPattern({
          processId,
          userId,
          code,
          options: options ?? {},
          priority: priority ?? 0,
          requestId: clientRequestId,
          createdAt: new Date(),
        });

        // Check for queue status
        if (result.status === 'queued') {
          const state = await getStrudelProcessState(processId);
          const response: ApiResponse<StrudelAsyncExecuteResponse> = {
            success: true,
            data: {
              processId,
              status: result.status,
              queuePosition: state?.queuePosition,
              message: 'Request queued due to high load. Use async endpoint or poll for status.',
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(202).send(response);
        }

        // Check for rate-limit failure
        const errorMessage = result.status === 'failed' ? result.error?.message : undefined;
        const isRateLimitError = errorMessage?.toLowerCase().includes('rate limit') === true;
        if (isRateLimitError && errorMessage) {
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: errorMessage,
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(429).send(response);
        }

        // Handle failed status with proper error codes
        if (!result.success && result.status === 'failed') {
          const errorCode = result.error?.code ?? 'EXECUTION_FAILED';
          const errorMessage = result.error?.message ?? 'Pattern execution failed';

          // Determine if this is a validation/user error (4xx) or server error (5xx)
          // Validation errors are user errors and should return 400
          const isValidationError =
            errorCode === 'VALIDATION_ERROR' ||
            errorCode === 'VALIDATION_FAILED' ||
            errorCode === 'INVALID_PATTERN' ||
            errorCode === 'SYNTAX_ERROR' ||
            errorCode === 'PARSE_ERROR' ||
            (result.validation && !result.validation.isValid);

          if (isValidationError) {
            const response: ApiResponse<null> = {
              success: false,
              error: {
                code: 'VALIDATION_FAILED',
                message: errorMessage,
              },
              meta: {
                timestamp: timestamp(),
                requestId: request.id,
              },
            };
            return await reply.status(400).send(response);
          }

          // Server/rendering errors remain 500
          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: errorCode,
              message: errorMessage,
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(500).send(response);
        }

        const response: ApiResponse<StrudelProcessResult> = {
          success: result.success,
          data: result,
          meta: {
            timestamp: timestamp(),
            requestId: request.id,
          },
        };

        return await reply.status(200).send(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(
          { userId, processId, error: errorMessage, requestId: request.id },
          'Strudel execute failed'
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
   * POST /api/v1/strudel/execute/async - Validate and render asynchronously (fire-and-forget)
   */
  app.post<{ Body: ExecuteRequestBody }>(
    '/api/v1/strudel/execute/async',
    {
      schema: {
        body: ExecuteRequestSchema,
      },
      preHandler: [verifyJWT, strudelRateLimiter],
    },
    async (request: FastifyRequest<{ Body: ExecuteRequestBody }>, reply: FastifyReply) => {
      const userId = request.user?.id;

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

      const { code, options, priority, requestId: clientRequestId } = request.body;
      const processId = generateRequestId().replace('req_', 'strudel_');

      logger.info(
        { userId, processId, codeLength: code.length, requestId: request.id },
        'Async Strudel execute request'
      );

      try {
        // Fire-and-forget: enqueue and return immediately
        const result = await enqueueStrudelPattern(
          {
            processId,
            userId,
            code,
            options: options ?? {},
            priority: priority ?? 0,
            requestId: clientRequestId,
            createdAt: new Date(),
          },
          processId
        );

        // Handle error during enqueue
        if (!result.success && result.error) {
          const isRateLimitError = result.error.message.toLowerCase().includes('rate limit');
          const statusCode = isRateLimitError ? 429 : 500;
          const errorCode = isRateLimitError ? 'RATE_LIMIT_EXCEEDED' : 'EXECUTION_FAILED';

          const response: ApiResponse<null> = {
            success: false,
            error: {
              code: errorCode,
              message: result.error.message,
            },
            meta: {
              timestamp: timestamp(),
              requestId: request.id,
            },
          };
          return await reply.status(statusCode).send(response);
        }

        // Get state to include queue position in response
        const state = await getStrudelProcessState(processId);

        // Return 202 Accepted with process ID and initial status
        const response: ApiResponse<StrudelAsyncExecuteResponse> = {
          success: true,
          data: {
            processId,
            status: result.status,
            queuePosition: state?.queuePosition,
            message:
              result.status === 'queued'
                ? 'Request queued. Poll /api/v1/strudel/processes/:id for status.'
                : 'Process started. Poll /api/v1/strudel/processes/:id for status.',
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
          'Async Strudel execution failed'
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
   * GET /api/v1/strudel/processes/:id - Get process status and result
   */
  app.get<{ Params: ProcessIdParams }>(
    '/api/v1/strudel/processes/:id',
    {
      schema: {
        params: ProcessIdParamsSchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: ProcessIdParams }>, reply: FastifyReply) => {
      const userId = request.user?.id;
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
        const status = await getStrudelProcessStatus(processId);

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
        const state = await getStrudelProcessState(processId);

        // Verify process belongs to requesting user
        if (state?.userId !== userId) {
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

        const statusResponse: StrudelProcessStatusResponse = {
          processId,
          status: status.status,
          progress: status.progress,
          queuePosition: status.queuePosition,
          code: state.code,
          createdAt: state.createdAt,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
          result: status.result,
        };

        const response: ApiResponse<StrudelProcessStatusResponse> = {
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
        logger.error({ processId, error: errorMessage }, 'Failed to get Strudel process status');

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
   * DELETE /api/v1/strudel/processes/:id - Cancel running process
   */
  app.delete<{ Params: ProcessIdParams }>(
    '/api/v1/strudel/processes/:id',
    {
      schema: {
        params: ProcessIdParamsSchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Params: ProcessIdParams }>, reply: FastifyReply) => {
      const userId = request.user?.id;
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
        const status = await getStrudelProcessStatus(processId);

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
        const state = await getStrudelProcessState(processId);
        if (state?.userId !== userId) {
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
        if (['complete', 'failed', 'cancelled'].includes(status.status)) {
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

        const cancelled = await cancelStrudelProcess(processId);

        if (cancelled) {
          logger.info({ userId, processId }, 'Strudel process cancelled');

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
        logger.error({ processId, error: errorMessage }, 'Failed to cancel Strudel process');

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
   * GET /api/v1/strudel/processes - List user's processes with pagination
   */
  app.get<{ Querystring: ListProcessesQuery }>(
    '/api/v1/strudel/processes',
    {
      schema: {
        querystring: ListProcessesQuerySchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Querystring: ListProcessesQuery }>, reply: FastifyReply) => {
      const userId = request.user?.id;
      const page = request.query.page ?? 1;
      const pageSize = request.query.pageSize ?? 20;
      const statusFilter = request.query.status as StrudelProcessStatus | undefined;

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
        const result = await listUserStrudelProcesses(userId, {
          page,
          pageSize,
          status: statusFilter,
        });

        // Map process states to response format
        const processes: StrudelProcessStatusResponse[] = result.processes.map((state) => ({
          processId: state.processId,
          status: state.status,
          progress: state.progress,
          queuePosition: state.queuePosition,
          createdAt: state.createdAt,
          startedAt: state.startedAt,
          completedAt: state.completedAt,
        }));

        const listResponse: StrudelProcessListResponse = {
          processes,
          total: result.total,
          pagination: {
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
          },
        };

        const response: ApiResponse<StrudelProcessListResponse> = {
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
        logger.error({ userId, error: errorMessage }, 'Failed to list Strudel processes');

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
   * GET /api/v1/strudel/metrics - Get service metrics (authenticated)
   */
  app.get<{ Querystring: MetricsQuery }>(
    '/api/v1/strudel/metrics',
    {
      schema: {
        querystring: MetricsQuerySchema,
      },
      preHandler: [verifyJWT],
    },
    async (request: FastifyRequest<{ Querystring: MetricsQuery }>, reply: FastifyReply) => {
      const userId = request.user?.id;

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

        let recentMetrics;
        if (includeRecent) {
          recentMetrics = await getRecentMetrics(recentLimit);
        }

        const responseData: StrudelServiceMetrics & { recentMetrics?: unknown[] } = {
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
        logger.error({ error: errorMessage }, 'Failed to get Strudel metrics');

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
   * GET /api/v1/strudel/presets - Get preset patterns (public)
   */
  app.get('/api/v1/strudel/presets', async (request: FastifyRequest, reply: FastifyReply) => {
    const presets = [
      {
        name: 'Basic Beat',
        code: 's("bd sd bd sd")',
        description: 'Simple four-on-the-floor kick and snare pattern',
      },
      {
        name: 'House Groove',
        code: 'stack(\n  s("bd*4"),\n  s("~ cp ~ cp"),\n  s("hh*8")\n).slow(2)',
        description: 'Classic house music drum pattern with kick, clap, and hi-hats',
      },
      {
        name: 'Ambient Pad',
        code: 's("pad").note("<c3 eb3 g3 bb3>").room(0.8).delay(0.5).slow(4)',
        description: 'Atmospheric pad with chord progression and effects',
      },
      {
        name: 'Arpeggiated Synth',
        code: 's("arpy*4").note("c4 e4 g4 b4").fast(2).room(0.3)',
        description: 'Fast arpeggiated synth pattern',
      },
      {
        name: 'Bass Line',
        code: 's("bass").note("<c2 c2 eb2 f2>").lpf(800).slow(2)',
        description: 'Simple bass line with low-pass filter',
      },
      {
        name: 'Full Track',
        code: 'stack(\n  s("bd*4"),\n  s("~ sd ~ sd"),\n  s("hh*8").gain(0.6),\n  s("bass").note("<c2 c2 eb2 f2>").slow(2),\n  s("piano").note("<c4 eb4 g4>").slow(4).room(0.5)\n).slow(2)',
        description: 'Complete track with drums, bass, and piano',
      },
    ];

    const response: ApiResponse<typeof presets> = {
      success: true,
      data: presets,
      meta: {
        timestamp: timestamp(),
        requestId: request.id,
      },
    };

    return await reply.status(200).send(response);
  });

  /**
   * GET /api/v1/strudel/health - Health check (public)
   */
  app.get('/api/v1/strudel/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await getStrudelServiceHealth();

      const response: ApiResponse<StrudelHealthResponse> = {
        success: health.status === 'healthy',
        data: health,
        meta: {
          timestamp: timestamp(),
          requestId: request.id,
        },
      };

      const statusCode =
        health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
      return await reply.status(statusCode).send(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Strudel health check failed');

      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Failed to check Strudel service health',
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id,
        },
      };
      return await reply.status(500).send(response);
    }
  });

  logger.info('Strudel routes registered');
}

export default registerStrudelRoutes;
