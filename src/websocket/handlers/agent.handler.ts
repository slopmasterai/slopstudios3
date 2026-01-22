/**
 * Agent WebSocket Handler
 * Handles real-time workflow execution and orchestration via WebSocket events
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable no-case-declarations */

import { orchestrate } from '../../services/orchestration.service.js';
import { getRedisClient, isRedisConnected } from '../../services/redis.service.js';
import {
  executeWorkflow,
  cancelWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  getWorkflowEmitter,
} from '../../services/workflow-engine.service.js';
import {
  executeSelfCritique,
  critiqueEvents,
} from '../../services/self-critique.service.js';
import {
  executeDiscussion,
  discussionEvents,
} from '../../services/discussion.service.js';
import { generateRequestId } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';

import type {
  WorkflowDefinition,
  WorkflowStepState,
  AgentWorkflowExecutePayload,
  AgentOrchestratePayload,
  AgentWorkflowQueuedPayload,
  AgentWorkflowStartedPayload,
  AgentWorkflowStepStartedPayload,
  AgentWorkflowStepProgressPayload,
  AgentWorkflowStepCompletedPayload,
  AgentWorkflowStepFailedPayload,
  AgentWorkflowCompletedPayload,
  AgentWorkflowFailedPayload,
  AgentWorkflowCancelledPayload,
  AgentErrorPayload,
  OrchestrationRequest,
  AgentCritiqueIterationPayload,
  AgentCritiqueConvergedPayload,
  AgentCritiqueCompletedPayload,
  AgentDiscussionRoundStartedPayload,
  AgentDiscussionContributionPayload,
  AgentDiscussionRoundCompletedPayload,
  AgentDiscussionConvergedPayload,
  AgentDiscussionCompletedPayload,
  SelfCritiqueConfig,
  DiscussionConfig,
} from '../../types/agent.types.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/websocket.types.js';
import type { Socket } from 'socket.io';

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Rate limit tracking per user
const RATE_LIMIT_PREFIX = 'ws:agent:ratelimit:';
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5; // More restrictive for workflows

// Active workflow subscriptions per socket
const socketWorkflowSubscriptions = new Map<string, Set<string>>();

/**
 * Checks WebSocket-specific rate limit for agent operations
 */
async function checkWsRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!isRedisConnected()) {
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW };
  }

  try {
    const redis = getRedisClient();
    const key = `${RATE_LIMIT_PREFIX}${userId}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - count);
    return { allowed: count <= MAX_REQUESTS_PER_WINDOW, remaining };
  } catch {
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW };
  }
}

/**
 * Validates workflow execute payload
 */
function validateWorkflowExecutePayload(data: unknown): {
  valid: boolean;
  error?: string;
  payload?: AgentWorkflowExecutePayload;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  const payload = data as Record<string, unknown>;

  // Workflow definition is required
  if (!payload['workflow']) {
    return { valid: false, error: 'Invalid payload: workflow definition is required' };
  }

  // Validate workflow structure
  const workflow = payload['workflow'] as Record<string, unknown>;

  if (!workflow['id'] || typeof workflow['id'] !== 'string') {
    return { valid: false, error: 'Invalid payload: workflow.id is required' };
  }

  if (!workflow['name'] || typeof workflow['name'] !== 'string') {
    return { valid: false, error: 'Invalid payload: workflow.name is required' };
  }

  if (!Array.isArray(workflow['steps']) || workflow['steps'].length === 0) {
    return { valid: false, error: 'Invalid payload: workflow.steps must be a non-empty array' };
  }

  return {
    valid: true,
    payload: {
      workflow: payload['workflow'] as WorkflowDefinition,
      context: payload['context'] as Record<string, unknown> | undefined,
      priority: payload['priority'] as number | undefined,
    },
  };
}

/**
 * Validates orchestrate payload
 */
function validateOrchestratePayload(data: unknown): {
  valid: boolean;
  error?: string;
  payload?: AgentOrchestratePayload;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  const payload = data as Record<string, unknown>;

  if (!payload['request'] || typeof payload['request'] !== 'object') {
    return { valid: false, error: 'Invalid payload: request object is required' };
  }

  const request = payload['request'] as Record<string, unknown>;

  if (!['sequential', 'parallel', 'conditional', 'map-reduce', 'self-critique', 'discussion'].includes(request['pattern'] as string)) {
    return { valid: false, error: 'Invalid payload: pattern must be one of sequential, parallel, conditional, map-reduce, self-critique, discussion' };
  }

  if (!Array.isArray(request['tasks']) || request['tasks'].length === 0) {
    return { valid: false, error: 'Invalid payload: tasks must be a non-empty array' };
  }

  return {
    valid: true,
    payload: {
      request: request as unknown as OrchestrationRequest,
    },
  };
}

/**
 * Subscribes a socket to workflow events
 */
function subscribeToWorkflowEvents(
  socket: TypedSocket,
  executionId: string
): () => void {
  const workflowEmitter = getWorkflowEmitter();

  // Track subscription
  if (!socketWorkflowSubscriptions.has(socket.id)) {
    socketWorkflowSubscriptions.set(socket.id, new Set());
  }
  socketWorkflowSubscriptions.get(socket.id)!.add(executionId);

  // Join workflow room
  const workflowRoom = `workflow:${executionId}`;
  socket.join(workflowRoom);

  // Event handler
  const eventHandler = (event: Record<string, unknown>) => {
    if (event['executionId'] !== executionId) {
      return;
    }

    const eventType = event['type'] as string;

    switch (eventType) {
      case 'queued':
        const queuedPayload: AgentWorkflowQueuedPayload = {
          executionId: event['executionId'],
          queuePosition: event['queuePosition'] as number,
          estimatedWaitSeconds: event['estimatedWaitSeconds'] as number | undefined,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:queued', queuedPayload);
        break;

      case 'started':
        const startedPayload: AgentWorkflowStartedPayload = {
          executionId: event['executionId'],
          workflowId: event['workflowId'] as string,
          totalSteps: event['totalSteps'] as number,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:started', startedPayload);
        break;

      case 'step:started':
        const stepStartedPayload: AgentWorkflowStepStartedPayload = {
          executionId: event['executionId'],
          stepId: event['stepId'] as string,
          stepName: event['stepName'] as string,
          agentType: event['agentType'] as 'claude' | 'strudel' | 'custom',
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:step:started', stepStartedPayload);
        break;

      case 'step:progress':
        const stepProgressPayload: AgentWorkflowStepProgressPayload = {
          executionId: event['executionId'],
          stepId: event['stepId'] as string,
          progress: event['progress'] as number,
          message: event['message'] as string | undefined,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:step:progress', stepProgressPayload);
        break;

      case 'step:completed':
        const stepCompletedPayload: AgentWorkflowStepCompletedPayload = {
          executionId: event['executionId'],
          stepId: event['stepId'] as string,
          result: event['result'],
          durationMs: event['durationMs'] as number,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:step:completed', stepCompletedPayload);
        break;

      case 'step:failed':
        const stepFailedPayload: AgentWorkflowStepFailedPayload = {
          executionId: event['executionId'],
          stepId: event['stepId'] as string,
          error: event['error'] as string,
          willContinue: event['willContinue'] as boolean,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:step:failed', stepFailedPayload);
        break;

      case 'completed':
        const completedPayload: AgentWorkflowCompletedPayload = {
          executionId: event['executionId'],
          results: event['results'] as Record<string, unknown>,
          durationMs: event['durationMs'] as number,
          stepResults: event['stepResults'] as Record<string, WorkflowStepState>,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:completed', completedPayload);
        // Cleanup subscription on completion
        cleanup();
        break;

      case 'failed':
        const failedPayload: AgentWorkflowFailedPayload = {
          executionId: event['executionId'],
          error: event['error'] as string,
          failedStepId: event['failedStepId'] as string | undefined,
          completedSteps: event['completedSteps'] as number,
          totalSteps: event['totalSteps'] as number,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:failed', failedPayload);
        // Cleanup subscription on failure
        cleanup();
        break;

      case 'cancelled':
        const cancelledPayload: AgentWorkflowCancelledPayload = {
          executionId: event['executionId'],
          completedSteps: event['completedSteps'] as number,
          timestamp: event['timestamp'] as string,
        };
        socket.emit('agent:workflow:cancelled', cancelledPayload);
        // Cleanup subscription on cancellation
        cleanup();
        break;
    }
  };

  // Subscribe to events
  workflowEmitter.on('workflow', eventHandler);

  // Cleanup function
  const cleanup = () => {
    workflowEmitter.off('workflow', eventHandler);
    socket.leave(workflowRoom);
    socketWorkflowSubscriptions.get(socket.id)?.delete(executionId);
  };

  return cleanup;
}

/**
 * Registers Agent WebSocket handlers
 */
export function registerAgentHandler(socket: TypedSocket): void {
  const requestId = socket.data.requestId || 'unknown';

  logger.debug({ socketId: socket.id, requestId }, 'Registering Agent handler');

  /**
   * Handle workflow execute request
   */
  socket.on('agent:workflow:execute', async (data, callback) => {
    const userId = socket.data.userId;

    // Check authentication
    if (!socket.data.authenticated || !userId) {
      const errorPayload: AgentErrorPayload = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required to execute workflows',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Validate payload
    const validation = validateWorkflowExecutePayload(data);
    if (!validation.valid || !validation.payload) {
      const errorPayload: AgentErrorPayload = {
        code: 'INVALID_PAYLOAD',
        message: validation.error || 'Invalid request payload',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Check rate limit
    const rateLimitResult = await checkWsRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const errorPayload: AgentErrorPayload = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please wait before making more requests.',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    logger.info(
      { socketId: socket.id, userId, workflowId: validation.payload.workflow.id },
      'Workflow execute request received'
    );

    try {
      // Execute workflow
      const state = await executeWorkflow(
        validation.payload.workflow,
        userId,
        validation.payload.context,
        validation.payload.priority
      );

      // Subscribe to workflow events
      subscribeToWorkflowEvents(socket, state.id);

      // Send immediate acknowledgment
      if (typeof callback === 'function') {
        callback({
          success: true,
          executionId: state.id,
          status: state.status,
          queuePosition: state.queuePosition,
        });
      }

      logger.info(
        { socketId: socket.id, userId, executionId: state.id, status: state.status },
        'Workflow execution started'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const errorPayload: AgentErrorPayload = {
        code: 'WORKFLOW_EXECUTION_FAILED',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, error: errorMessage },
        'Workflow execution failed'
      );
    }
  });

  /**
   * Handle workflow status request
   */
  socket.on('agent:workflow:status', async (data, callback) => {
    const userId = socket.data.userId;

    if (!socket.data.authenticated || !userId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Authentication required' });
      }
      return;
    }

    if (!data?.executionId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Execution ID is required' });
      }
      return;
    }

    try {
      const state = await getWorkflowStatus(data.executionId);

      if (!state) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Workflow not found' });
        }
        return;
      }

      // Verify ownership
      if (state.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Access denied' });
        }
        return;
      }

      if (typeof callback === 'function') {
        callback({ success: true, status: state });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }
    }
  });

  /**
   * Handle workflow cancel request
   */
  socket.on('agent:workflow:cancel', async (data, callback) => {
    const userId = socket.data.userId;

    if (!socket.data.authenticated || !userId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Authentication required' });
      }
      return;
    }

    if (!data?.executionId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Execution ID is required' });
      }
      return;
    }

    logger.info(
      { socketId: socket.id, userId, executionId: data.executionId },
      'Workflow cancel request received'
    );

    try {
      const state = await getWorkflowStatus(data.executionId);

      if (!state) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Workflow not found' });
        }
        return;
      }

      if (state.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Access denied' });
        }
        return;
      }

      const cancelled = await cancelWorkflow(data.executionId);

      if (typeof callback === 'function') {
        callback({ success: cancelled, cancelled });
      }

      if (cancelled) {
        logger.info(
          { socketId: socket.id, userId, executionId: data.executionId },
          'Workflow cancelled'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, executionId: data.executionId, error: errorMessage },
        'Failed to cancel workflow'
      );
    }
  });

  /**
   * Handle workflow pause request
   */
  socket.on('agent:workflow:pause', async (data, callback) => {
    const userId = socket.data.userId;

    if (!socket.data.authenticated || !userId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Authentication required' });
      }
      return;
    }

    if (!data?.executionId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Execution ID is required' });
      }
      return;
    }

    try {
      const state = await getWorkflowStatus(data.executionId);

      if (!state) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Workflow not found' });
        }
        return;
      }

      if (state.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Access denied' });
        }
        return;
      }

      const paused = await pauseWorkflow(data.executionId);

      if (typeof callback === 'function') {
        callback({ success: paused });
      }

      if (paused) {
        logger.info(
          { socketId: socket.id, userId, executionId: data.executionId },
          'Workflow paused'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }
    }
  });

  /**
   * Handle workflow resume request
   */
  socket.on('agent:workflow:resume', async (data, callback) => {
    const userId = socket.data.userId;

    if (!socket.data.authenticated || !userId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Authentication required' });
      }
      return;
    }

    if (!data?.executionId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Execution ID is required' });
      }
      return;
    }

    try {
      const state = await getWorkflowStatus(data.executionId);

      if (!state) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Workflow not found' });
        }
        return;
      }

      if (state.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Access denied' });
        }
        return;
      }

      const resumed = await resumeWorkflow(data.executionId);

      if (typeof callback === 'function') {
        callback({ success: resumed });
      }

      if (resumed) {
        logger.info(
          { socketId: socket.id, userId, executionId: data.executionId },
          'Workflow resumed'
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }
    }
  });

  /**
   * Handle orchestration request
   */
  socket.on('agent:orchestrate', async (data, callback) => {
    const userId = socket.data.userId;

    if (!socket.data.authenticated || !userId) {
      const errorPayload: AgentErrorPayload = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required for orchestration',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Validate payload
    const validation = validateOrchestratePayload(data);
    if (!validation.valid || !validation.payload) {
      const errorPayload: AgentErrorPayload = {
        code: 'INVALID_PAYLOAD',
        message: validation.error || 'Invalid request payload',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Check rate limit
    const rateLimitResult = await checkWsRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const errorPayload: AgentErrorPayload = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please wait before making more requests.',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    logger.info(
      { socketId: socket.id, userId, pattern: validation.payload.request.pattern },
      'Orchestration request received'
    );

    try {
      const result = await orchestrate({
        ...validation.payload.request,
        userId,
      });

      if (typeof callback === 'function') {
        callback({
          success: result.status === 'completed',
          result,
          error: result.error,
        });
      }

      logger.info(
        { socketId: socket.id, userId, orchestrationId: result.id, status: result.status },
        'Orchestration completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const errorPayload: AgentErrorPayload = {
        code: 'ORCHESTRATION_FAILED',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, error: errorMessage },
        'Orchestration failed'
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Self-Critique Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle self-critique execute request
   */
  socket.on('agent:critique:execute', async (data, callback) => {
    const userId = socket.data.userId;

    if (!socket.data.authenticated || !userId) {
      const errorPayload: AgentErrorPayload = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required for self-critique',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Validate payload
    if (!data?.task || !data?.config?.qualityCriteria?.length) {
      const errorPayload: AgentErrorPayload = {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload: task and quality criteria are required',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Check rate limit
    const rateLimitResult = await checkWsRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const errorPayload: AgentErrorPayload = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please wait before making more requests.',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Use client-provided ID if available, otherwise generate one
    const critiqueExecutionId = data.task?.id || generateRequestId().replace('req_', 'critique_');

    logger.info(
      { socketId: socket.id, userId, executionId: critiqueExecutionId, maxIterations: data.config.maxIterations },
      'Self-critique execute request received'
    );

    // Subscribe to critique events
    const critiqueRoom = `critique:${critiqueExecutionId}`;
    socket.join(critiqueRoom);

    const iterationHandler = (event: AgentCritiqueIterationPayload) => {
      if (event.executionId !== critiqueExecutionId) {
        return;
      }
      socket.emit('agent:critique:iteration', event);
    };

    const convergedHandler = (event: AgentCritiqueConvergedPayload) => {
      if (event.executionId !== critiqueExecutionId) {
        return;
      }
      socket.emit('agent:critique:converged', event);
    };

    const completedHandler = (event: AgentCritiqueCompletedPayload) => {
      if (event.executionId !== critiqueExecutionId) {
        return;
      }
      socket.emit('agent:critique:completed', event);
      // Cleanup handlers
      critiqueEvents.off('agent:critique:iteration', iterationHandler);
      critiqueEvents.off('agent:critique:converged', convergedHandler);
      critiqueEvents.off('agent:critique:completed', completedHandler);
      socket.leave(critiqueRoom);
    };

    critiqueEvents.on('agent:critique:iteration', iterationHandler);
    critiqueEvents.on('agent:critique:converged', convergedHandler);
    critiqueEvents.on('agent:critique:completed', completedHandler);

    try {
      // Execute self-critique with the pre-generated execution ID
      const result = await executeSelfCritique(
        {
          id: critiqueExecutionId,
          userId,
          pattern: 'self-critique',
          tasks: [data.task],
          context: data.context,
          timeoutMs: data.timeoutMs,
        },
        data.config as SelfCritiqueConfig
      );

      // If the result status is not 'completed', clean up listeners and room
      // since completedHandler won't fire for failed results without event emission
      if (result.status !== 'completed') {
        critiqueEvents.off('agent:critique:iteration', iterationHandler);
        critiqueEvents.off('agent:critique:converged', convergedHandler);
        critiqueEvents.off('agent:critique:completed', completedHandler);
        socket.leave(critiqueRoom);

        const errorMessage = result.error ?? 'Self-critique failed';
        const timestamp = new Date().toISOString();

        // Emit pattern-specific error event
        socket.emit('agent:critique:error', {
          executionId: critiqueExecutionId,
          error: errorMessage,
          timestamp,
        });

        // Emit generic error payload for backwards compatibility
        const errorPayload: AgentErrorPayload = {
          code: 'SELF_CRITIQUE_FAILED',
          message: errorMessage,
          timestamp,
        };
        socket.emit('agent:error', errorPayload);
      }

      if (typeof callback === 'function') {
        callback({
          success: result.status === 'completed',
          executionId: result.id,
          error: result.status !== 'completed' ? result.error : undefined,
        });
      }

      logger.info(
        { socketId: socket.id, userId, executionId: result.id, converged: result.converged, status: result.status },
        'Self-critique completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const timestamp = new Date().toISOString();

      // Cleanup handlers on error
      critiqueEvents.off('agent:critique:iteration', iterationHandler);
      critiqueEvents.off('agent:critique:converged', convergedHandler);
      critiqueEvents.off('agent:critique:completed', completedHandler);
      socket.leave(critiqueRoom);

      // Emit pattern-specific error event
      socket.emit('agent:critique:error', {
        executionId: critiqueExecutionId,
        error: errorMessage,
        timestamp,
      });

      // Emit generic error payload for backwards compatibility
      const errorPayload: AgentErrorPayload = {
        code: 'SELF_CRITIQUE_FAILED',
        message: errorMessage,
        timestamp,
      };
      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, executionId: critiqueExecutionId, error: errorMessage },
        'Self-critique execution failed'
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Discussion Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle discussion execute request
   */
  socket.on('agent:discussion:execute', async (data, callback) => {
    const userId = socket.data.userId;

    if (!socket.data.authenticated || !userId) {
      const errorPayload: AgentErrorPayload = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required for discussion',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Validate payload
    if (!data?.topic || !data?.config?.participants?.length) {
      const errorPayload: AgentErrorPayload = {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload: topic and participants are required',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Check rate limit
    const rateLimitResult = await checkWsRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const errorPayload: AgentErrorPayload = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please wait before making more requests.',
        timestamp: new Date().toISOString(),
      };

      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Use client-provided ID if available, otherwise generate one
    const discussionExecutionId = data.id || generateRequestId().replace('req_', 'discussion_');

    logger.info(
      {
        socketId: socket.id,
        userId,
        executionId: discussionExecutionId,
        maxRounds: data.config.maxRounds,
        participantCount: data.config.participants.length,
      },
      'Discussion execute request received'
    );

    // Subscribe to discussion events
    const discussionRoom = `discussion:${discussionExecutionId}`;
    socket.join(discussionRoom);

    const roundStartedHandler = (event: AgentDiscussionRoundStartedPayload) => {
      if (event.executionId !== discussionExecutionId) {
        return;
      }
      socket.emit('agent:discussion:round-started', event);
    };

    const contributionHandler = (event: AgentDiscussionContributionPayload) => {
      if (event.executionId !== discussionExecutionId) {
        return;
      }
      socket.emit('agent:discussion:contribution', event);
    };

    const roundCompletedHandler = (event: AgentDiscussionRoundCompletedPayload) => {
      if (event.executionId !== discussionExecutionId) {
        return;
      }
      socket.emit('agent:discussion:round-completed', event);
    };

    const convergedHandler = (event: AgentDiscussionConvergedPayload) => {
      if (event.executionId !== discussionExecutionId) {
        return;
      }
      socket.emit('agent:discussion:converged', event);
    };

    const completedHandler = (event: AgentDiscussionCompletedPayload) => {
      if (event.executionId !== discussionExecutionId) {
        return;
      }
      socket.emit('agent:discussion:completed', event);
      // Cleanup handlers
      discussionEvents.off('agent:discussion:round-started', roundStartedHandler);
      discussionEvents.off('agent:discussion:contribution', contributionHandler);
      discussionEvents.off('agent:discussion:round-completed', roundCompletedHandler);
      discussionEvents.off('agent:discussion:converged', convergedHandler);
      discussionEvents.off('agent:discussion:completed', completedHandler);
      socket.leave(discussionRoom);
    };

    discussionEvents.on('agent:discussion:round-started', roundStartedHandler);
    discussionEvents.on('agent:discussion:contribution', contributionHandler);
    discussionEvents.on('agent:discussion:round-completed', roundCompletedHandler);
    discussionEvents.on('agent:discussion:converged', convergedHandler);
    discussionEvents.on('agent:discussion:completed', completedHandler);

    try {
      // Execute discussion with the pre-generated execution ID
      const result = await executeDiscussion(
        {
          id: discussionExecutionId,
          userId,
          pattern: 'discussion',
          tasks: [{ id: 'discussion-topic', agentType: 'claude', prompt: data.topic }],
          context: data.context,
          timeoutMs: data.timeoutMs,
        },
        data.config as DiscussionConfig
      );

      // If the result status is not 'completed', clean up listeners and room
      // since completedHandler won't fire for failed results without event emission
      if (result.status !== 'completed') {
        discussionEvents.off('agent:discussion:round-started', roundStartedHandler);
        discussionEvents.off('agent:discussion:contribution', contributionHandler);
        discussionEvents.off('agent:discussion:round-completed', roundCompletedHandler);
        discussionEvents.off('agent:discussion:converged', convergedHandler);
        discussionEvents.off('agent:discussion:completed', completedHandler);
        socket.leave(discussionRoom);

        const errorMessage = result.error ?? 'Discussion failed';
        const timestamp = new Date().toISOString();

        // Emit pattern-specific error event
        socket.emit('agent:discussion:error', {
          executionId: discussionExecutionId,
          error: errorMessage,
          timestamp,
        });

        // Emit generic error payload for backwards compatibility
        const errorPayload: AgentErrorPayload = {
          code: 'DISCUSSION_FAILED',
          message: errorMessage,
          timestamp,
        };
        socket.emit('agent:error', errorPayload);
      }

      if (typeof callback === 'function') {
        callback({
          success: result.status === 'completed',
          executionId: result.id,
          error: result.status !== 'completed' ? result.error : undefined,
        });
      }

      logger.info(
        {
          socketId: socket.id,
          userId,
          executionId: result.id,
          converged: result.converged,
          rounds: result.rounds.length,
          status: result.status,
        },
        'Discussion completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const timestamp = new Date().toISOString();

      // Cleanup handlers on error
      discussionEvents.off('agent:discussion:round-started', roundStartedHandler);
      discussionEvents.off('agent:discussion:contribution', contributionHandler);
      discussionEvents.off('agent:discussion:round-completed', roundCompletedHandler);
      discussionEvents.off('agent:discussion:converged', convergedHandler);
      discussionEvents.off('agent:discussion:completed', completedHandler);
      socket.leave(discussionRoom);

      // Emit pattern-specific error event
      socket.emit('agent:discussion:error', {
        executionId: discussionExecutionId,
        error: errorMessage,
        timestamp,
      });

      // Emit generic error payload for backwards compatibility
      const errorPayload: AgentErrorPayload = {
        code: 'DISCUSSION_FAILED',
        message: errorMessage,
        timestamp,
      };
      socket.emit('agent:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, executionId: discussionExecutionId, error: errorMessage },
        'Discussion execution failed'
      );
    }
  });

  /**
   * Cleanup on disconnect
   */
  socket.on('disconnect', () => {
    // Clear workflow subscriptions for this socket
    socketWorkflowSubscriptions.delete(socket.id);

    logger.debug({ socketId: socket.id, requestId }, 'Agent handler cleanup on disconnect');
  });

  logger.debug({ socketId: socket.id, requestId }, 'Agent handler registered');
}

export default registerAgentHandler;
