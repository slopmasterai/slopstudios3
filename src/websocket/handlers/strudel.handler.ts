/**
 * Strudel WebSocket Handler
 * Handles real-time Strudel pattern validation and audio rendering via WebSocket events
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable no-case-declarations */

import { getRedisClient, isRedisConnected } from '../../services/redis.service.js';
import {
  validateStrudelPattern,
  streamStrudelResponse,
  cancelStrudelProcess,
  getStrudelProcessStatus,
  getStrudelProcessState,
  getStrudelQueueSize,
  subscribeToProgress,
} from '../../services/strudel.service.js';
import { generateRequestId } from '../../utils/index.js';
import { logger } from '../../utils/logger.js';

import type {
  StrudelExecutePayload,
  StrudelProgressPayload,
  StrudelCompletePayload,
  StrudelErrorPayload,
  StrudelQueuedPayload,
  StrudelValidatedPayload,
  StrudelProcessConfig,
} from '../../types/strudel.types.js';
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
const RATE_LIMIT_PREFIX = 'ws:strudel:ratelimit:';
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

/**
 * Checks WebSocket-specific rate limit for Strudel operations
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
  payload?: StrudelExecutePayload;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  const payload = data as Record<string, unknown>;

  if (!payload['code'] || typeof payload['code'] !== 'string') {
    return { valid: false, error: 'Invalid payload: code is required and must be a string' };
  }

  if (payload['code'].length === 0) {
    return { valid: false, error: 'Invalid payload: code cannot be empty' };
  }

  if (payload['code'].length > 100000) {
    return {
      valid: false,
      error: 'Invalid payload: code exceeds maximum length (100000 characters)',
    };
  }

  // Validate options if provided
  if (payload['options'] && typeof payload['options'] !== 'object') {
    return { valid: false, error: 'Invalid payload: options must be an object' };
  }

  const options = payload['options'] as Record<string, unknown> | undefined;

  if (options) {
    if (options['duration'] !== undefined && typeof options['duration'] !== 'number') {
      return { valid: false, error: 'Invalid payload: options.duration must be a number' };
    }

    if (options['sampleRate'] !== undefined && typeof options['sampleRate'] !== 'number') {
      return { valid: false, error: 'Invalid payload: options.sampleRate must be a number' };
    }

    if (options['channels'] !== undefined && typeof options['channels'] !== 'number') {
      return { valid: false, error: 'Invalid payload: options.channels must be a number' };
    }

    if (options['format'] !== undefined) {
      if (options['format'] !== 'wav') {
        return {
          valid: false,
          error: 'Invalid payload: only wav format is currently supported',
        };
      }
    }
  }

  return {
    valid: true,
    payload: {
      code: payload['code'],
      options: options as StrudelExecutePayload['options'],
      priority: payload['priority'] as number | undefined,
      requestId: payload['requestId'] as string | undefined,
    },
  };
}

/**
 * Validates validate payload
 */
function validateValidatePayload(data: unknown): {
  valid: boolean;
  error?: string;
  code?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  const payload = data as Record<string, unknown>;

  if (!payload['code'] || typeof payload['code'] !== 'string') {
    return { valid: false, error: 'Invalid payload: code is required and must be a string' };
  }

  if (payload['code'].length === 0) {
    return { valid: false, error: 'Invalid payload: code cannot be empty' };
  }

  if (payload['code'].length > 100000) {
    return {
      valid: false,
      error: 'Invalid payload: code exceeds maximum length (100000 characters)',
    };
  }

  return {
    valid: true,
    code: payload['code'],
  };
}

/**
 * Registers Strudel WebSocket handlers
 */
export function registerStrudelHandler(socket: TypedSocket): void {
  const requestId = socket.data.requestId || 'unknown';

  logger.debug({ socketId: socket.id, requestId }, 'Registering Strudel handler');

  /**
   * Handle Strudel validate request
   */
  socket.on('strudel:validate', async (data, callback) => {
    const userId = socket.data.userId;

    // Check authentication
    if (!socket.data.authenticated || !userId) {
      const errorPayload: StrudelErrorPayload = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required to validate Strudel patterns',
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Validate payload
    const validation = validateValidatePayload(data);
    if (!validation.valid || !validation.code) {
      const errorPayload: StrudelErrorPayload = {
        code: 'VALIDATION_ERROR',
        message: validation.error || 'Invalid request payload',
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errorPayload.message },
        });
      }
      return;
    }

    // Check rate limit
    const rateLimitResult = await checkWsRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const errorPayload: StrudelErrorPayload = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please wait before making more requests.',
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    logger.info(
      { socketId: socket.id, userId, codeLength: validation.code.length },
      'Strudel validate request received'
    );

    try {
      const result = await validateStrudelPattern(validation.code);

      if (typeof callback === 'function') {
        callback({
          success: true,
          isValid: result.isValid,
          errors: result.errors,
          warnings: result.warnings,
          validationTimeMs: result.validationTimeMs,
        });
      }

      // Also emit validated event
      const validatedPayload: StrudelValidatedPayload = {
        processId: '', // No process ID for validation-only
        validation: result,
      };

      socket.emit('strudel:validated', validatedPayload);

      logger.info(
        { socketId: socket.id, userId, isValid: result.isValid },
        'Strudel validation completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const errorPayload: StrudelErrorPayload = {
        code: 'VALIDATION_ERROR',
        message: errorMessage,
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, error: errorMessage },
        'Strudel validation failed'
      );
    }
  });

  /**
   * Handle Strudel execute request
   */
  socket.on('strudel:execute', async (data, callback) => {
    const userId = socket.data.userId;

    // Check authentication
    if (!socket.data.authenticated || !userId) {
      const errorPayload: StrudelErrorPayload = {
        code: 'UNAUTHORIZED',
        message: 'Authentication required to execute Strudel patterns',
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    // Validate payload
    const validation = validateExecutePayload(data);
    if (!validation.valid || !validation.payload) {
      const errorPayload: StrudelErrorPayload = {
        code: 'VALIDATION_ERROR',
        message: validation.error || 'Invalid request payload',
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: errorPayload.message },
        });
      }
      return;
    }

    // Check rate limit
    const rateLimitResult = await checkWsRateLimit(userId);
    if (!rateLimitResult.allowed) {
      const errorPayload: StrudelErrorPayload = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please wait before making more requests.',
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({ success: false, error: errorPayload.message });
      }
      return;
    }

    const processId = generateRequestId().replace('req_', 'strudel_');

    logger.info(
      { socketId: socket.id, userId, processId, codeLength: validation.payload.code.length },
      'Strudel execute request received'
    );

    // Join process-specific room for targeted updates
    const processRoom = `strudel:${processId}`;
    socket.join(processRoom);

    // Build process config
    const config: StrudelProcessConfig = {
      processId,
      userId,
      code: validation.payload.code,
      options: validation.payload.options || {},
      priority: validation.payload.priority || 0,
      requestId: validation.payload.requestId,
      socketId: socket.id,
      createdAt: new Date(),
    };

    try {
      // Execute with streaming
      const result = await streamStrudelResponse(config, (event) => {
        handleProgressEvent(socket, processId, processRoom, event);
      });

      // Check if the result is queued
      if (result.status === 'queued') {
        const state = await getStrudelProcessState(processId);
        const queueLength = await getStrudelQueueSize();

        const queuedPayload: StrudelQueuedPayload = {
          processId,
          position: state?.queuePosition || 0,
          queueLength,
        };

        socket.emit('strudel:queued', queuedPayload);
        socket.to(processRoom).emit('strudel:queued', queuedPayload);

        logger.info(
          { socketId: socket.id, userId, processId, queuePosition: state?.queuePosition },
          'Strudel request queued'
        );

        // Wait for queued process to complete
        await waitForQueuedProcessCompletion(socket, processId, processRoom);
        return;
      }

      // Send completion event for non-queued results
      // Use the full exported WAV base64 data from the service
      const completePayload: StrudelCompletePayload = {
        processId,
        success: result.success,
        audioData: result.audioData,
        format: result.audioMetadata?.format,
        duration: result.audioMetadata?.duration,
        sampleRate: result.audioMetadata?.sampleRate,
        channels: result.audioMetadata?.channels,
        fileSize: result.audioMetadata?.fileSize,
        renderTimeMs: result.timing.renderTimeMs,
        totalTimeMs: result.timing.totalTimeMs,
      };

      socket.emit('strudel:complete', completePayload);
      socket.to(processRoom).emit('strudel:complete', completePayload);

      // Send callback with complete result
      if (typeof callback === 'function') {
        callback({
          success: result.success,
          processId,
          status: result.status,
          audioMetadata: result.audioMetadata,
          timing: result.timing,
        });
      }

      logger.info(
        { socketId: socket.id, userId, processId, success: result.success },
        'Strudel execution completed'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const errorPayload: StrudelErrorPayload = {
        processId,
        code: 'EXECUTION_ERROR',
        message: errorMessage,
      };

      socket.emit('strudel:error', errorPayload);

      if (typeof callback === 'function') {
        callback({
          success: false,
          processId,
          status: 'failed',
          error: { code: 'EXECUTION_ERROR', message: errorMessage },
        });
      }

      logger.error(
        { socketId: socket.id, userId, processId, error: errorMessage },
        'Strudel execution failed'
      );
    } finally {
      socket.leave(processRoom);
    }
  });

  /**
   * Handle Strudel cancel request
   */
  socket.on('strudel:cancel', async (data, callback) => {
    const userId = socket.data.userId;
    // Handle both string and object with processId
    const processId = typeof data === 'string' ? data : data?.processId;

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

    logger.info({ socketId: socket.id, userId, processId }, 'Strudel cancel request received');

    try {
      // Get process status to verify it exists
      const status = await getStrudelProcessStatus(processId);

      if (!status) {
        if (typeof callback === 'function') {
          callback({ success: true, cancelled: false });
        }
        return;
      }

      // Verify process belongs to requesting user
      const state = await getStrudelProcessState(processId);
      if (state?.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: true, cancelled: false });
        }
        return;
      }

      // Cancel the process
      const cancelled = await cancelStrudelProcess(processId);

      if (typeof callback === 'function') {
        callback({ success: true, cancelled });
      }

      if (cancelled) {
        // Emit cancellation event
        const errorPayload: StrudelErrorPayload = {
          processId,
          code: 'CANCELLED',
          message: 'Process was cancelled by user',
        };

        socket.emit('strudel:error', errorPayload);

        logger.info({ socketId: socket.id, userId, processId }, 'Strudel process cancelled');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (typeof callback === 'function') {
        callback({ success: false, error: errorMessage });
      }

      logger.error(
        { socketId: socket.id, userId, processId, error: errorMessage },
        'Failed to cancel Strudel process'
      );
    }
  });

  /**
   * Handle Strudel status request
   */
  socket.on('strudel:status', async (data, callback) => {
    const userId = socket.data.userId;
    // Handle both string and object with processId
    const processId = typeof data === 'string' ? data : data?.processId;

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
      const status = await getStrudelProcessStatus(processId);

      if (!status) {
        if (typeof callback === 'function') {
          callback({ success: true, status: null });
        }
        return;
      }

      // Verify process belongs to requesting user
      const state = await getStrudelProcessState(processId);
      if (state?.userId !== userId) {
        if (typeof callback === 'function') {
          callback({ success: true, status: null });
        }
        return;
      }

      if (typeof callback === 'function') {
        callback({
          success: true,
          status: {
            status: status.status,
            progress: status.progress,
            queuePosition: status.queuePosition,
          },
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
  logger.debug({ socketId: socket.id, requestId }, 'Strudel handler registered');
}

/**
 * Handles progress events and emits WebSocket events
 */
function handleProgressEvent(
  socket: TypedSocket,
  _processId: string,
  processRoom: string,
  event: StrudelProgressPayload | StrudelQueuedPayload
): void {
  if ('position' in event) {
    // Queued event
    socket.emit('strudel:queued', event);
    socket.to(processRoom).emit('strudel:queued', event);
  } else {
    // Progress event
    socket.emit('strudel:progress', event);
    socket.to(processRoom).emit('strudel:progress', event);
  }
}

/**
 * Waits for a queued process to complete and emits appropriate events
 */
async function waitForQueuedProcessCompletion(
  socket: TypedSocket,
  processId: string,
  processRoom: string
): Promise<void> {
  const maxWaitMs = 600000; // 10 minutes max wait
  const pollIntervalMs = 5000; // Poll every 5 seconds
  const startTime = Date.now();
  let processCompleted = false;

  // Subscribe to progress events
  const unsubscribe = subscribeToProgress(processId, (event) => {
    handleProgressEvent(socket, processId, processRoom, event);

    // Check if this indicates completion
    if ('status' in event && ['complete', 'failed', 'cancelled'].includes(event.status)) {
      processCompleted = true;
    }
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (Date.now() - startTime < maxWaitMs && !processCompleted) {
      // Check if socket is still connected
      if (!socket.connected) {
        logger.info(
          { socketId: socket.id, processId },
          'Socket disconnected while waiting for queued Strudel process'
        );
        break;
      }

      // Poll for process status
      const status = await getStrudelProcessStatus(processId);

      if (!status) {
        logger.warn({ processId }, 'Strudel process state not found while waiting');
        const errorPayload: StrudelErrorPayload = {
          processId,
          code: 'PROCESS_NOT_FOUND',
          message: 'Process state was lost while queued',
        };
        socket.emit('strudel:error', errorPayload);
        break;
      }

      // Check if process has completed
      if (['complete', 'failed', 'cancelled'].includes(status.status)) {
        const state = await getStrudelProcessState(processId);

        if (status.status === 'complete') {
          // Use the stored result from state which includes the full audio data
          const result = state?.result;
          const completePayload: StrudelCompletePayload = {
            processId,
            success: true,
            audioData: result?.audioData,
            duration: result?.audioMetadata?.duration,
            sampleRate: result?.audioMetadata?.sampleRate,
            channels: result?.audioMetadata?.channels,
            format: result?.audioMetadata?.format,
            fileSize: result?.audioMetadata?.fileSize,
            renderTimeMs: result?.timing?.renderTimeMs,
            totalTimeMs: result?.timing?.totalTimeMs,
          };

          socket.emit('strudel:complete', completePayload);
          socket.to(processRoom).emit('strudel:complete', completePayload);

          logger.info(
            { socketId: socket.id, processId, status: status.status },
            'Queued Strudel process completed'
          );
        } else {
          const errorPayload: StrudelErrorPayload = {
            processId,
            code: 'EXECUTION_ERROR',
            message: state?.error?.message || `Process ended with status ${status.status}`,
          };
          socket.emit('strudel:error', errorPayload);
        }
        break;
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Check if we timed out
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (Date.now() - startTime >= maxWaitMs && !processCompleted) {
      logger.warn({ processId }, 'Timed out waiting for queued Strudel process');
      const errorPayload: StrudelErrorPayload = {
        processId,
        code: 'QUEUE_TIMEOUT',
        message: 'Timed out waiting for queued process to complete',
      };
      socket.emit('strudel:error', errorPayload);
    }
  } finally {
    // Clean up subscription
    unsubscribe();

    // Leave the process room
    socket.leave(processRoom);
  }
}

export default registerStrudelHandler;
