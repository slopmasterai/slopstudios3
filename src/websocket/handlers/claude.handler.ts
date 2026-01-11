/**
 * Claude WebSocket Handler
 * Handles real-time Claude CLI execution via WebSocket events
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable no-case-declarations */

import {
  streamClaudeResponse,
  cancelClaudeProcess,
  getClaudeProcessStatus,
  unsubscribeQueuedStream,
} from '../../services/claude.service.js';
import { getProcessState, onProcessEvent } from '../../services/process-manager.service.js';
import { getRedisClient, isRedisConnected } from '../../services/redis.service.js';
import { generateRequestId } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';

import type { ProcessEventData } from '../../services/process-manager.service.js';
import type {
  ClaudeExecutePayload,
  ClaudeProgressPayload,
  ClaudeCompletePayload,
  ClaudeErrorPayload,
  ClaudeQueuedPayload,
  ClaudeExecuteCallback,
  ClaudeCancelCallback,
  ClaudeStreamEvent,
  ClaudeProcessConfig,
} from '../../types/claude.types.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/websocket.types.js';
import type { Socket } from 'socket.io';

// Extend the event interfaces for Claude
declare module '../../types/websocket.types.js' {
  interface ServerToClientEvents {
    'claude:progress': (data: ClaudeProgressPayload) => void;
    'claude:complete': (data: ClaudeCompletePayload) => void;
    'claude:error': (data: ClaudeErrorPayload) => void;
    'claude:queued': (data: ClaudeQueuedPayload) => void;
  }

  interface ClientToServerEvents {
    'claude:execute': (data: ClaudeExecutePayload, callback?: ClaudeExecuteCallback) => void;
    'claude:cancel': (processId: string, callback?: ClaudeCancelCallback) => void;
    'claude:status': (
      processId: string,
      callback?: (response: {
        success: boolean;
        status?: string;
        queuePosition?: number;
        error?: string;
      }) => void
    ) => void;
  }
}

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Rate limit tracking per user
const RATE_LIMIT_PREFIX = 'ws:claude:ratelimit:';
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

/**
 * Checks WebSocket-specific rate limit for Claude operations
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
 * Validates execute payload
 */
function validateExecutePayload(data: unknown): {
  valid: boolean;
  error?: string;
  payload?: ClaudeExecutePayload;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  const payload = data as Record<string, unknown>;

  if (!payload['prompt'] || typeof payload['prompt'] !== 'string') {
    return { valid: false, error: 'Invalid payload: prompt is required and must be a string' };
  }

  if (payload['prompt'].length === 0) {
    return { valid: false, error: 'Invalid payload: prompt cannot be empty' };
  }

  if (payload['prompt'].length > 100000) {
    return {
      valid: false,
      error: 'Invalid payload: prompt exceeds maximum length (100000 characters)',
    };
  }

  if (payload['systemPrompt'] && typeof payload['systemPrompt'] !== 'string') {
    return { valid: false, error: 'Invalid payload: systemPrompt must be a string' };
  }

  if (payload['model'] && typeof payload['model'] !== 'string') {
    return { valid: false, error: 'Invalid payload: model must be a string' };
  }

  if (payload['maxTokens'] && typeof payload['maxTokens'] !== 'number') {
    return { valid: false, error: 'Invalid payload: maxTokens must be a number' };
  }

  if (payload['timeoutMs'] && typeof payload['timeoutMs'] !== 'number') {
    return { valid: false, error: 'Invalid payload: timeoutMs must be a number' };
  }

  return {
    valid: true,
    payload: {
      prompt: payload['prompt'],
      systemPrompt: payload['systemPrompt'] as string | undefined,
      model: payload['model'] as string | undefined,
      maxTokens: payload['maxTokens'] as number | undefined,
      workingDirectory: payload['workingDirectory'] as string | undefined,
      timeoutMs: payload['timeoutMs'] as number | undefined,
    },
  };
}

/**
 * Registers Claude WebSocket handlers
 */
export function registerClaudeHandler(socket: TypedSocket): void {
  const requestId = socket.data.requestId || 'unknown';

  logger.debug({ socketId: socket.id, requestId }, 'Registering Claude handler');

  /**
   * Handle Claude execute request
   */
  socket.on('claude:execute', async (data, callback) => {
    const userId = socket.data.userId;

    // Check authentication
    if (!socket.data.authenticated || !userId) {
      const errorPayload: ClaudeErrorPayload = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required to execute Claude commands',
        timestamp: new Date().toISOString(),
      };

      socket.emit('claude:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Validate payload
    const validation = validateExecutePayload(data);
    if (!validation.valid || !validation.payload) {
      const errorPayload: ClaudeErrorPayload = {
        code: 'INVALID_PAYLOAD',
        message: validation.error || 'Invalid request payload',
        timestamp: new Date().toISOString(),
      };

      socket.emit('claude:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Check rate limit
    const rateLimitResult = await checkWsRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const errorPayload: ClaudeErrorPayload = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please wait before making more requests.',
        timestamp: new Date().toISOString(),
      };

      socket.emit('claude:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    const processId = generateRequestId().replace('req_', 'claude_');

    logger.info(
      { socketId: socket.id, userId, processId, promptLength: validation.payload.prompt.length },
      'Claude execute request received'
    );

    // Send immediate acknowledgment
    if (typeof callback === 'function') {
      callback({ success: true, processId });
    }

    // Join process-specific room for targeted updates
    const processRoom = `claude:${processId}`;
    socket.join(processRoom);

    // Build process config
    const config: ClaudeProcessConfig = {
      id: processId,
      userId,
      prompt: validation.payload.prompt,
      systemPrompt: validation.payload.systemPrompt,
      model: validation.payload.model,
      maxTokens: validation.payload.maxTokens,
      workingDirectory: validation.payload.workingDirectory,
      timeoutMs: validation.payload.timeoutMs,
      stream: true,
    };

    // Note: streamClaudeResponse() internally calls subscribeToStream(), so we
    // don't need to subscribe separately here. Doing so would cause duplicate
    // event emissions.

    try {
      // Execute with streaming - streamClaudeResponse handles subscription internally
      const result = await streamClaudeResponse(config, (event) => {
        handleStreamEvent(socket, processId, event);
      });

      // Check if the result is queued - if so, emit queued event instead of complete
      // and do NOT unsubscribe yet; instruct client to poll for status
      if (result.status === 'queued') {
        // Get the process state to retrieve queue position and ETA
        const state = await getProcessState(processId);

        // Emit queued event to inform client to poll for status
        const queuedPayload: ClaudeQueuedPayload = {
          processId,
          queuePosition: state?.queuePosition ?? 0,
          estimatedWaitSeconds: state?.estimatedWaitSeconds,
          message: 'Request queued due to high load. Use claude:status to poll for completion.',
          timestamp: new Date().toISOString(),
        };

        socket.emit('claude:queued', queuedPayload);

        // Also broadcast to process room
        socket.to(processRoom).emit('claude:queued', queuedPayload);

        logger.info(
          {
            socketId: socket.id,
            userId,
            processId,
            queuePosition: state?.queuePosition,
            estimatedWaitSeconds: state?.estimatedWaitSeconds,
          },
          'Claude request queued, waiting for process events'
        );

        // Wait for the queued process to complete
        // Pass the result so waitForQueuedProcessCompletion can:
        // 1. Subscribe to process events for real-time stream forwarding
        // 2. Clean up the stream subscription when done
        await waitForQueuedProcessCompletion(
          socket,
          processId,
          processRoom,
          result as { status: string; _unsubscribe?: () => void }
        );
        return;
      }

      // Send completion event for non-queued results
      const completePayload: ClaudeCompletePayload = {
        processId,
        result,
        timestamp: new Date().toISOString(),
      };

      socket.emit('claude:complete', completePayload);

      // Also broadcast to process room (for any other listeners)
      socket.to(processRoom).emit('claude:complete', completePayload);

      logger.info(
        { socketId: socket.id, userId, processId, status: result.status },
        'Claude execution completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const errorPayload: ClaudeErrorPayload = {
        processId,
        code: 'EXECUTION_ERROR',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      };

      socket.emit('claude:error', errorPayload);

      logger.error(
        { socketId: socket.id, userId, processId, error: errorMessage },
        'Claude execution failed'
      );
    } finally {
      // Note: streamClaudeResponse handles its own subscription cleanup internally
      socket.leave(processRoom);
    }
  });

  /**
   * Handle Claude cancel request
   */
  socket.on('claude:cancel', async (processId, callback) => {
    const userId = socket.data.userId;

    // Check authentication
    if (!socket.data.authenticated || !userId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Authentication required' });
      }
      return;
    }

    if (!processId || typeof processId !== 'string') {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Process ID is required' });
      }
      return;
    }

    logger.info({ socketId: socket.id, userId, processId }, 'Claude cancel request received');

    try {
      // Get process status to verify it exists
      const status = await getClaudeProcessStatus(processId);

      if (!status) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Process not found' });
        }
        return;
      }

      // Verify process belongs to requesting user
      const state = await getProcessState(processId);
      if (state?.config.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Access denied to this process' });
        }
        return;
      }

      // Cancel the process
      const cancelled = await cancelClaudeProcess(processId);

      if (cancelled) {
        if (typeof callback === 'function') {
          callback({ success: true, message: 'Process cancelled successfully' });
        }

        // Emit cancellation event
        const errorPayload: ClaudeErrorPayload = {
          processId,
          code: 'CANCELLED',
          message: 'Process was cancelled by user',
          timestamp: new Date().toISOString(),
        };

        socket.emit('claude:error', errorPayload);

        logger.info({ socketId: socket.id, userId, processId }, 'Process cancelled');
      } else {
        if (typeof callback === 'function') {
          callback({
            success: false,
            error: 'Could not cancel process (may already be completed)',
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, processId, error: errorMessage },
        'Failed to cancel process'
      );
    }
  });

  /**
   * Handle Claude status request
   */
  socket.on('claude:status', async (processId, callback) => {
    const userId = socket.data.userId;

    // Check authentication
    if (!socket.data.authenticated || !userId) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Authentication required' });
      }
      return;
    }

    if (!processId || typeof processId !== 'string') {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Process ID is required' });
      }
      return;
    }

    try {
      const status = await getClaudeProcessStatus(processId);

      if (!status) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Process not found' });
        }
        return;
      }

      // Verify process belongs to requesting user
      const state = await getProcessState(processId);
      if (state?.config.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Access denied to this process' });
        }
        return;
      }

      if (typeof callback === 'function') {
        callback({
          success: true,
          status: status.status,
          queuePosition: status.queuePosition,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }
    }
  });

  // Log handler registration
  logger.debug({ socketId: socket.id, requestId }, 'Claude handler registered');
}

/**
 * Waits for a queued process to complete and emits appropriate events
 * Subscribes to process events for real-time stream forwarding and polls as fallback
 * @param queuedResult - The queued result from streamClaudeResponse (contains _unsubscribe)
 */
async function waitForQueuedProcessCompletion(
  socket: TypedSocket,
  processId: string,
  processRoom: string,
  queuedResult: { status: string; _unsubscribe?: () => void }
): Promise<void> {
  const maxWaitMs = 600000; // 10 minutes max wait
  const pollIntervalMs = 5000; // Poll every 5 seconds (less frequent since we have event subscription)
  const startTime = Date.now();
  let processCompleted = false;
  let lastStatus: string | null = null;

  // IMPORTANT: Unsubscribe from the stream listener set up by streamClaudeResponse() BEFORE
  // registering the onProcessEvent subscription below. This prevents duplicate event emissions
  // since both listeners would otherwise forward the same process events to WebSocket clients.
  if (queuedResult._unsubscribe) {
    queuedResult._unsubscribe();
    delete queuedResult._unsubscribe;
  }
  // Also try the exported function in case it was attached differently
  unsubscribeQueuedStream(queuedResult as Parameters<typeof unsubscribeQueuedStream>[0]);

  // Subscribe to process events to forward real-time stream data to WebSocket
  const unsubscribeProcessEvents = onProcessEvent((event: ProcessEventData) => {
    if (event.processId !== processId) {
      return;
    }

    // Forward process events to WebSocket in real-time
    switch (event.type) {
      case 'start':
        const startProgress: ClaudeProgressPayload = {
          processId,
          status: 'running',
          message: 'Process started executing',
          timestamp: event.timestamp,
        };
        socket.emit('claude:progress', startProgress);
        socket.to(processRoom).emit('claude:progress', startProgress);
        break;

      case 'stdout':
      case 'stderr':
        const dataProgress: ClaudeProgressPayload = {
          processId,
          status: 'running',
          data: event.data,
          timestamp: event.timestamp,
        };
        socket.emit('claude:progress', dataProgress);
        socket.to(processRoom).emit('claude:progress', dataProgress);
        break;

      case 'error':
        const errorPayload: ClaudeErrorPayload = {
          processId,
          code: 'STREAM_ERROR',
          message: event.error || 'Stream error occurred',
          timestamp: event.timestamp,
        };
        socket.emit('claude:error', errorPayload);
        socket.to(processRoom).emit('claude:error', errorPayload);
        break;

      case 'exit':
      case 'timeout':
        // Mark as completed - the polling loop will handle the final result emission
        processCompleted = true;
        break;
    }
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- processCompleted is modified in event callback
    while (Date.now() - startTime < maxWaitMs && !processCompleted) {
      // Check if socket is still connected
      if (!socket.connected) {
        logger.info(
          { socketId: socket.id, processId },
          'Socket disconnected while waiting for queued process'
        );
        break;
      }

      // Poll for process status (less frequent now since we have event subscription)
      const status = await getClaudeProcessStatus(processId);

      if (!status) {
        logger.warn({ processId }, 'Process state not found while waiting');
        const errorPayload: ClaudeErrorPayload = {
          processId,
          code: 'PROCESS_NOT_FOUND',
          message: 'Process state was lost while queued',
          timestamp: new Date().toISOString(),
        };
        socket.emit('claude:error', errorPayload);
        break;
      }

      // Check if process has completed (no longer queued or running)
      if (['completed', 'failed', 'timeout', 'cancelled'].includes(status.status)) {
        if (status.result) {
          // Emit completion event with the actual result
          const completePayload: ClaudeCompletePayload = {
            processId,
            result: status.result,
            timestamp: new Date().toISOString(),
          };

          socket.emit('claude:complete', completePayload);
          socket.to(processRoom).emit('claude:complete', completePayload);

          logger.info(
            { socketId: socket.id, processId, status: status.status },
            'Queued Claude process completed'
          );
        } else {
          // Process ended but no result - emit error
          const errorPayload: ClaudeErrorPayload = {
            processId,
            code: 'EXECUTION_ERROR',
            message: `Process ended with status ${status.status} but no result`,
            timestamp: new Date().toISOString(),
          };
          socket.emit('claude:error', errorPayload);
        }
        break;
      }

      // Emit status updates only when status changes (avoid duplicate emissions)
      if (status.status !== lastStatus) {
        lastStatus = status.status;

        if (status.status === 'running') {
          // Running status is emitted via the 'start' event subscription above
          // Only emit here if we missed the event (e.g., status changed before subscription)
          const progressPayload: ClaudeProgressPayload = {
            processId,
            status: 'running',
            message: 'Process started executing',
            timestamp: new Date().toISOString(),
          };
          socket.emit('claude:progress', progressPayload);
        } else if (status.status === 'queued' && status.queuePosition !== undefined) {
          // Get process state to retrieve ETA
          const state = await getProcessState(processId);

          // Emit queue position update with ETA
          const queuedPayload: ClaudeQueuedPayload = {
            processId,
            queuePosition: status.queuePosition,
            estimatedWaitSeconds: state?.estimatedWaitSeconds,
            message: `Queue position: ${status.queuePosition}`,
            timestamp: new Date().toISOString(),
          };
          socket.emit('claude:queued', queuedPayload);
        }
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Check if we timed out
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- processCompleted is modified in event callback
    if (Date.now() - startTime >= maxWaitMs && !processCompleted) {
      logger.warn({ processId }, 'Timed out waiting for queued process');
      const errorPayload: ClaudeErrorPayload = {
        processId,
        code: 'QUEUE_TIMEOUT',
        message: 'Timed out waiting for queued process to complete',
        timestamp: new Date().toISOString(),
      };
      socket.emit('claude:error', errorPayload);
    }
  } finally {
    // Clean up process event subscription
    unsubscribeProcessEvents();

    // Note: Stream subscription from queuedResult was already cleaned up at the start
    // of this function to prevent duplicate event emissions.

    // Leave the process room
    socket.leave(processRoom);
  }
}

/**
 * Handles stream events and emits WebSocket events
 */
function handleStreamEvent(socket: TypedSocket, processId: string, event: ClaudeStreamEvent): void {
  switch (event.type) {
    case 'start':
      const startProgress: ClaudeProgressPayload = {
        processId,
        status: 'running',
        message: 'Process started',
        timestamp: event.timestamp,
      };
      socket.emit('claude:progress', startProgress);
      break;

    case 'data':
      const dataProgress: ClaudeProgressPayload = {
        processId,
        status: 'running',
        data: event.data,
        timestamp: event.timestamp,
      };
      socket.emit('claude:progress', dataProgress);
      break;

    case 'error':
      const errorPayload: ClaudeErrorPayload = {
        processId,
        code: 'STREAM_ERROR',
        message: event.error || 'Stream error occurred',
        timestamp: event.timestamp,
      };
      socket.emit('claude:error', errorPayload);
      break;

    case 'end':
      // End is handled separately via claude:complete
      break;
  }
}

export default registerClaudeHandler;
