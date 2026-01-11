/**
 * Process Manager Service
 * Generic process lifecycle management with Redis-backed state tracking
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

import { logger } from '../utils/logger.js';

import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  ClaudeProcessConfig,
  ClaudeProcessState,
  ClaudeProcessStatus,
  ClaudeQueueItem,
} from '../types/claude.types.js';

// Redis key prefixes
const PROCESS_PREFIX = 'process:';
const PROCESS_QUEUE_KEY = 'process:queue';
const ACTIVE_PROCESSES_KEY = 'process:active';
const PROCESS_TTL_SECONDS = 86400; // 24 hours

// In-memory process tracking
const activeProcesses = new Map<string, ChildProcess>();
const processEmitter = new EventEmitter();

// In-memory state storage (fallback when Redis is unavailable)
const inMemoryProcessStates = new Map<string, ClaudeProcessState>();
const inMemoryQueue: ClaudeQueueItem[] = [];
const inMemoryActiveIds = new Set<string>();

// Redis key for average duration tracking
const AVG_DURATION_KEY = 'process:avg_duration';

// In-memory average duration tracking (fallback when Redis is unavailable)
const inMemoryAvgDuration: { totalDurationMs: number; count: number } = {
  totalDurationMs: 0,
  count: 0,
};

// Default average duration in ms (used when no historical data exists)
const DEFAULT_AVG_DURATION_MS = 30000; // 30 seconds

/**
 * Process spawn options
 */
export interface SpawnOptions {
  /** Unique process ID */
  id: string;
  /** User ID who initiated the process */
  userId: string;
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to capture output */
  captureOutput?: boolean;
  /** Maximum output buffer size in bytes */
  maxOutputSize?: number;
  /** Content to write to stdin after spawning (then close stdin) */
  stdinContent?: string;
}

/**
 * Process event data
 */
export interface ProcessEventData {
  processId: string;
  userId: string;
  type: 'start' | 'stdout' | 'stderr' | 'exit' | 'error' | 'timeout';
  data?: string;
  exitCode?: number | null;
  signal?: string | null;
  error?: string;
  timestamp: string;
}

/**
 * Gets the Redis key for a process
 */
function getProcessKey(processId: string): string {
  return `${PROCESS_PREFIX}${processId}`;
}

/**
 * Spawns a new process with lifecycle management
 * When Redis is unavailable, maintains process metadata in in-memory maps
 */
export async function spawnProcess(options: SpawnOptions): Promise<string> {
  const {
    id,
    userId,
    command,
    args = [],
    cwd,
    env,
    timeoutMs = 300000,
    captureOutput = true,
    maxOutputSize = 10 * 1024 * 1024, // 10MB default
    stdinContent,
  } = options;

  const redisAvailable = isRedisConnected();
  const processKey = getProcessKey(id);

  // Load any existing process state (e.g., from queue) to preserve metadata
  const existingState = await getProcessState(id);

  // Build process state by merging existing state with runtime fields
  // Preserve: createdAt, queuePosition, and full config (prompt/system/model/priority)
  // Set/overwrite: status, startedAt, pid, stdout, stderr, retryCount (reset for new run)
  const now = new Date().toISOString();
  const initialState: ClaudeProcessState = {
    // Start with existing state if available
    ...(existingState || {}),
    // Preserve config from existing state, or create minimal config
    config: existingState?.config || {
      id,
      userId,
      prompt: '',
    },
    // Preserve createdAt from existing state, or set to now
    createdAt: existingState?.createdAt || now,
    // Preserve queuePosition if it existed
    queuePosition: existingState?.queuePosition,
    // Runtime fields - always set/overwrite these
    status: 'running',
    startedAt: now,
    stdout: '',
    stderr: '',
    retryCount: existingState?.retryCount ?? 0,
    updatedAt: now,
  };

  try {
    // Store initial state in Redis or fallback to in-memory
    if (redisAvailable) {
      const redis = getRedisClient();
      await redis.setex(processKey, PROCESS_TTL_SECONDS, JSON.stringify(initialState));
      await redis.sadd(ACTIVE_PROCESSES_KEY, id);
    } else {
      logger.warn({ processId: id }, 'Redis unavailable, using in-memory state for process');
      inMemoryProcessStates.set(id, { ...initialState });
      inMemoryActiveIds.add(id);
    }

    // Spawn the process
    const childProcess = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write stdin content if provided, then close stdin
    if (stdinContent && childProcess.stdin) {
      childProcess.stdin.write(stdinContent, 'utf-8');
      childProcess.stdin.end();
    }

    // Store in memory for tracking
    activeProcesses.set(id, childProcess);

    // Update state with PID
    initialState.pid = childProcess.pid;
    if (redisAvailable) {
      const redis = getRedisClient();
      await redis.setex(processKey, PROCESS_TTL_SECONDS, JSON.stringify(initialState));
    } else {
      inMemoryProcessStates.set(id, { ...initialState });
    }

    // Emit start event
    emitProcessEvent({
      processId: id,
      userId,
      type: 'start',
      timestamp: new Date().toISOString(),
    });

    logger.info({ processId: id, userId, pid: childProcess.pid, command }, 'Process spawned');

    let stdout = '';
    let stderr = '';
    let timeoutId: NodeJS.Timeout | null = null;

    // Setup timeout
    if (timeoutMs > 0) {
      timeoutId = setTimeout(async () => {
        if (activeProcesses.has(id)) {
          logger.warn({ processId: id, timeoutMs }, 'Process timed out, killing');
          await killProcess(id, 'SIGKILL');
          await updateProcessState(id, {
            status: 'timeout',
            error: `Process timed out after ${timeoutMs}ms`,
          });
          emitProcessEvent({
            processId: id,
            userId,
            type: 'timeout',
            error: `Process timed out after ${timeoutMs}ms`,
            timestamp: new Date().toISOString(),
          });
        }
      }, timeoutMs);
    }

    // Handle stdout
    if (captureOutput && childProcess.stdout) {
      childProcess.stdout.on('data', async (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        // Truncate if exceeds max size
        if (stdout.length > maxOutputSize) {
          stdout = stdout.slice(-maxOutputSize);
        }

        // Update state periodically (debounced in production)
        await updateProcessState(id, { stdout });

        emitProcessEvent({
          processId: id,
          userId,
          type: 'stdout',
          data: chunk,
          timestamp: new Date().toISOString(),
        });
      });
    }

    // Handle stderr
    if (captureOutput && childProcess.stderr) {
      childProcess.stderr.on('data', async (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;

        // Truncate if exceeds max size
        if (stderr.length > maxOutputSize) {
          stderr = stderr.slice(-maxOutputSize);
        }

        // Update state periodically
        await updateProcessState(id, { stderr });

        emitProcessEvent({
          processId: id,
          userId,
          type: 'stderr',
          data: chunk,
          timestamp: new Date().toISOString(),
        });
      });
    }

    // Handle process exit
    childProcess.on('exit', async (exitCode, signal) => {
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Remove from active processes
      activeProcesses.delete(id);
      if (isRedisConnected()) {
        try {
          const redis = getRedisClient();
          await redis.srem(ACTIVE_PROCESSES_KEY, id);
        } catch {
          // Redis operation failed, continue with in-memory cleanup
        }
      }
      inMemoryActiveIds.delete(id);

      // Determine final status
      const currentState = await getProcessState(id);
      let finalStatus: ClaudeProcessStatus = 'completed';

      if (currentState?.status === 'timeout') {
        finalStatus = 'timeout';
      } else if (currentState?.status === 'cancelled') {
        finalStatus = 'cancelled';
      } else if (exitCode !== 0) {
        finalStatus = 'failed';
      }

      // Update final state
      await updateProcessState(id, {
        status: finalStatus,
        exitCode,
        stdout,
        stderr,
        completedAt: new Date().toISOString(),
      });

      logger.info(
        { processId: id, userId, exitCode, signal, status: finalStatus },
        'Process exited'
      );

      emitProcessEvent({
        processId: id,
        userId,
        type: 'exit',
        exitCode,
        signal: signal ?? undefined,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle process errors
    childProcess.on('error', async (error: Error) => {
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Remove from active processes
      activeProcesses.delete(id);
      if (isRedisConnected()) {
        try {
          const redis = getRedisClient();
          await redis.srem(ACTIVE_PROCESSES_KEY, id);
        } catch {
          // Redis operation failed, continue with in-memory cleanup
        }
      }
      inMemoryActiveIds.delete(id);

      // Update state
      await updateProcessState(id, {
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString(),
      });

      logger.error({ processId: id, userId, error: error.message }, 'Process error');

      emitProcessEvent({
        processId: id,
        userId,
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    return id;
  } catch (error) {
    // Cleanup on spawn failure
    activeProcesses.delete(id);
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.srem(ACTIVE_PROCESSES_KEY, id);
      } catch {
        // Redis operation failed, continue with in-memory cleanup
      }
    }
    inMemoryActiveIds.delete(id);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateProcessState(id, {
      status: 'failed',
      error: errorMessage,
      completedAt: new Date().toISOString(),
    });

    logger.error({ processId: id, userId, error: errorMessage }, 'Failed to spawn process');
    throw error;
  }
}

/**
 * Kills a running process
 */
export async function killProcess(
  processId: string,
  signal: NodeJS.Signals = 'SIGTERM'
): Promise<boolean> {
  const childProcess = activeProcesses.get(processId);

  if (!childProcess) {
    logger.warn({ processId }, 'Cannot kill process: not found in active processes');
    return false;
  }

  try {
    // Try graceful kill first
    childProcess.kill(signal);

    // If SIGTERM, set a force kill timeout
    if (signal === 'SIGTERM') {
      setTimeout(() => {
        if (activeProcesses.has(processId)) {
          logger.warn({ processId }, 'Process did not exit gracefully, force killing');
          childProcess.kill('SIGKILL');
        }
      }, 5000);
    }

    logger.info({ processId, signal }, 'Kill signal sent to process');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ processId, signal, error: errorMessage }, 'Failed to kill process');
    return false;
  }
}

/**
 * Cancels a process (marks as cancelled and kills if running)
 */
export async function cancelProcess(processId: string): Promise<boolean> {
  const state = await getProcessState(processId);

  if (!state) {
    logger.warn({ processId }, 'Cannot cancel process: not found');
    return false;
  }

  // If still in queue, just update status
  if (state.status === 'queued' || state.status === 'pending') {
    await updateProcessState(processId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
    await removeFromQueue(processId);
    return true;
  }

  // If running, kill the process
  if (state.status === 'running') {
    await updateProcessState(processId, { status: 'cancelled' });
    return await killProcess(processId);
  }

  // Already completed
  return false;
}

/**
 * Gets process state from Redis or in-memory fallback
 */
export async function getProcessState(processId: string): Promise<ClaudeProcessState | null> {
  // First, check in-memory state storage (always authoritative when Redis is down)
  const inMemoryState = inMemoryProcessStates.get(processId);

  if (!isRedisConnected()) {
    // Fallback: return from in-memory state storage
    if (inMemoryState) {
      return inMemoryState;
    }
    // Legacy fallback for processes that were tracked before state storage was added
    if (activeProcesses.has(processId)) {
      return {
        config: { id: processId, userId: '', prompt: '' },
        status: 'running',
        createdAt: new Date().toISOString(),
        stdout: '',
        stderr: '',
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  }

  try {
    const redis = getRedisClient();
    const data = await redis.get(getProcessKey(processId));

    if (!data) {
      // Fallback to in-memory if Redis doesn't have it but we do
      return inMemoryState || null;
    }

    return JSON.parse(data) as ClaudeProcessState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { processId, error: errorMessage },
      'Failed to get process state from Redis, using in-memory fallback'
    );
    // Fallback to in-memory on Redis error
    return inMemoryState || null;
  }
}

/**
 * Updates process state in Redis or in-memory fallback
 */
export async function updateProcessState(
  processId: string,
  updates: Partial<ClaudeProcessState>
): Promise<boolean> {
  const updatedAt = new Date().toISOString();

  // Always update in-memory state if it exists (for consistency)
  const inMemoryState = inMemoryProcessStates.get(processId);
  if (inMemoryState) {
    const updatedInMemory: ClaudeProcessState = {
      ...inMemoryState,
      ...updates,
      updatedAt,
    };
    inMemoryProcessStates.set(processId, updatedInMemory);
  }

  if (!isRedisConnected()) {
    // If we have in-memory state, update was successful via in-memory
    if (inMemoryState) {
      return true;
    }
    // Create new in-memory state if updates contain config (for new processes)
    if (updates.config) {
      const newState: ClaudeProcessState = {
        config: updates.config,
        status: updates.status || 'pending',
        createdAt: updates.createdAt || updatedAt,
        stdout: updates.stdout || '',
        stderr: updates.stderr || '',
        retryCount: updates.retryCount ?? 0,
        updatedAt,
        ...updates,
      };
      inMemoryProcessStates.set(processId, newState);
      logger.debug({ processId }, 'Created new in-memory state (Redis unavailable)');
      return true;
    }
    logger.warn(
      { processId },
      'Cannot update process state: Redis not connected and no in-memory state'
    );
    return false;
  }

  try {
    const redis = getRedisClient();
    const processKey = getProcessKey(processId);
    const existingData = await redis.get(processKey);

    if (!existingData) {
      // If Redis doesn't have it but we already updated in-memory, that's still a partial success
      if (inMemoryState) {
        return true;
      }
      // Create new state in Redis if updates contain config
      if (updates.config) {
        const newState: ClaudeProcessState = {
          config: updates.config,
          status: updates.status || 'pending',
          createdAt: updates.createdAt || updatedAt,
          stdout: updates.stdout || '',
          stderr: updates.stderr || '',
          retryCount: updates.retryCount ?? 0,
          updatedAt,
          ...updates,
        };
        await redis.setex(processKey, PROCESS_TTL_SECONDS, JSON.stringify(newState));
        return true;
      }
      logger.warn({ processId }, 'Cannot update process state: not found in Redis');
      return false;
    }

    const existingState = JSON.parse(existingData) as ClaudeProcessState;
    const updatedState: ClaudeProcessState = {
      ...existingState,
      ...updates,
      updatedAt,
    };

    await redis.setex(processKey, PROCESS_TTL_SECONDS, JSON.stringify(updatedState));
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ processId, error: errorMessage }, 'Failed to update process state in Redis');
    // If we updated in-memory, consider it a partial success
    return inMemoryState !== undefined;
  }
}

/**
 * Lists all active processes
 */
export async function listActiveProcesses(): Promise<string[]> {
  if (!isRedisConnected()) {
    return Array.from(activeProcesses.keys());
  }

  try {
    const redis = getRedisClient();
    return await redis.smembers(ACTIVE_PROCESSES_KEY);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to list active processes');
    return Array.from(activeProcesses.keys());
  }
}

/**
 * Options for listing user processes
 */
export interface ListUserProcessesOptions {
  userId: string;
  status?: ClaudeProcessStatus;
  page?: number;
  pageSize?: number;
}

/**
 * Result of listing user processes
 */
export interface ListUserProcessesResult {
  processes: ClaudeProcessState[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Lists all processes for a user (including queued, completed, failed, etc.)
 * Scans Redis for all process keys and filters by user
 */
export async function listUserProcesses(
  options: ListUserProcessesOptions
): Promise<ListUserProcessesResult> {
  const { userId, status, page = 1, pageSize = 20 } = options;

  if (!isRedisConnected()) {
    // Fallback: only return in-memory active processes for this user
    const inMemoryProcesses: ClaudeProcessState[] = [];
    for (const processId of activeProcesses.keys()) {
      const state = await getProcessState(processId);
      if (state?.config.userId === userId) {
        if (!status || state.status === status) {
          inMemoryProcesses.push(state);
        }
      }
    }
    return {
      processes: inMemoryProcesses.slice((page - 1) * pageSize, page * pageSize),
      total: inMemoryProcesses.length,
      page,
      pageSize,
      totalPages: Math.ceil(inMemoryProcesses.length / pageSize),
    };
  }

  try {
    const redis = getRedisClient();
    const allProcesses: ClaudeProcessState[] = [];

    // Scan for all process keys
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', `${PROCESS_PREFIX}*`, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];

      for (const key of keys) {
        // Skip non-process keys (like process:active, process:queue)
        if (key === ACTIVE_PROCESSES_KEY || key === PROCESS_QUEUE_KEY) {
          continue;
        }

        const data = await redis.get(key);
        if (data) {
          try {
            const state = JSON.parse(data) as ClaudeProcessState;

            // Filter by user
            if (state.config.userId !== userId) {
              continue;
            }

            // Filter by status if specified
            if (status && state.status !== status) {
              continue;
            }

            allProcesses.push(state);
          } catch {
            // Skip malformed entries
            logger.warn({ key }, 'Skipping malformed process state');
          }
        }
      }
    } while (cursor !== '0');

    // Sort by creation time (newest first)
    allProcesses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate
    const total = allProcesses.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paginatedProcesses = allProcesses.slice(start, start + pageSize);

    return {
      processes: paginatedProcesses,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ userId, error: errorMessage }, 'Failed to list user processes');
    throw error;
  }
}

/**
 * Gets count of active processes
 */
export async function getActiveProcessCount(): Promise<number> {
  if (!isRedisConnected()) {
    return activeProcesses.size;
  }

  try {
    const redis = getRedisClient();
    return await redis.scard(ACTIVE_PROCESSES_KEY);
  } catch (error) {
    return activeProcesses.size;
  }
}

/**
 * Result of enqueueing a process
 */
export interface EnqueueProcessResult {
  /** Queue position (1-indexed) */
  position: number;
  /** Estimated wait time in seconds */
  estimatedWaitSeconds: number;
}

/**
 * Enqueues a process for later execution
 * @param item - The queue item to enqueue
 * @param maxQueueSize - Maximum allowed queue size (0 = unlimited)
 * @param fullConfig - Optional full process config (used if no existing state)
 * @returns EnqueueProcessResult with position and estimated wait time
 * @throws Error if queue is full (not if Redis is unavailable - uses in-memory fallback)
 */
export async function enqueueProcess(
  item: ClaudeQueueItem,
  maxQueueSize: number = 0,
  fullConfig?: ClaudeProcessConfig
): Promise<EnqueueProcessResult> {
  // Build the state object first (used for both Redis and in-memory)
  const existingState = await getProcessState(item.processId);
  let state: ClaudeProcessState;

  if (existingState) {
    state = {
      ...existingState,
      status: 'queued',
      updatedAt: new Date().toISOString(),
    };
  } else if (fullConfig) {
    state = {
      config: fullConfig,
      status: 'queued',
      createdAt: item.enqueuedAt,
      stdout: '',
      stderr: '',
      retryCount: 0,
      updatedAt: new Date().toISOString(),
    };
  } else {
    state = {
      config: {
        id: item.processId,
        userId: item.userId,
        prompt: '',
        priority: item.priority,
      },
      status: 'queued',
      createdAt: item.enqueuedAt,
      stdout: '',
      stderr: '',
      retryCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  // Get average duration for ETA calculation
  const avgDurationMs = await getAverageProcessDuration();

  // Fallback to in-memory queue when Redis is unavailable
  if (!isRedisConnected()) {
    logger.warn({ processId: item.processId }, 'Redis unavailable, using in-memory queue');

    // Check queue size limit
    if (maxQueueSize > 0 && inMemoryQueue.length >= maxQueueSize) {
      throw new Error(`Queue is full (max size: ${maxQueueSize}). Try again later.`);
    }

    // Add to in-memory queue (sorted by priority then timestamp)
    inMemoryQueue.push(item);
    inMemoryQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return Date.parse(a.enqueuedAt) - Date.parse(b.enqueuedAt); // Earlier first
    });

    // Find position in sorted queue
    const positionIndex = inMemoryQueue.findIndex((i) => i.processId === item.processId);
    const position = positionIndex + 1;

    // Compute ETA
    const estimatedWaitSeconds = computeEstimatedWaitSeconds(position, avgDurationMs);

    // Update state with queue position and ETA
    state.queuePosition = position;
    state.estimatedWaitSeconds = estimatedWaitSeconds;

    // Store state in memory
    inMemoryProcessStates.set(item.processId, state);

    logger.info(
      {
        processId: item.processId,
        userId: item.userId,
        position,
        estimatedWaitSeconds,
        inMemory: true,
      },
      'Process enqueued (in-memory)'
    );

    return { position, estimatedWaitSeconds };
  }

  try {
    const redis = getRedisClient();

    // Check queue size limit before adding
    if (maxQueueSize > 0) {
      const currentSize = await redis.zcard(PROCESS_QUEUE_KEY);
      if (currentSize >= maxQueueSize) {
        throw new Error(`Queue is full (max size: ${maxQueueSize}). Try again later.`);
      }
    }

    // Add to queue using sorted set (score = priority * -1 for descending order, then timestamp)
    // Higher priority = processed first, same priority = FIFO
    const score = -item.priority * 1e15 + Date.parse(item.enqueuedAt);
    await redis.zadd(PROCESS_QUEUE_KEY, score, JSON.stringify(item));

    // Get queue position
    const positionRank = await redis.zrank(PROCESS_QUEUE_KEY, JSON.stringify(item));
    const position = positionRank !== null ? positionRank + 1 : 1;

    // Compute ETA
    const estimatedWaitSeconds = computeEstimatedWaitSeconds(position, avgDurationMs);

    // Update state with queue position and ETA
    state.queuePosition = position;
    state.estimatedWaitSeconds = estimatedWaitSeconds;

    // Store state in Redis
    await redis.setex(getProcessKey(item.processId), PROCESS_TTL_SECONDS, JSON.stringify(state));

    logger.info(
      { processId: item.processId, userId: item.userId, position, estimatedWaitSeconds },
      'Process enqueued'
    );

    return { position, estimatedWaitSeconds };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ processId: item.processId, error: errorMessage }, 'Failed to enqueue process');
    throw error;
  }
}

/**
 * Dequeues the next process from the queue (Redis or in-memory)
 */
export async function dequeueProcess(): Promise<ClaudeQueueItem | null> {
  if (!isRedisConnected()) {
    // Use in-memory queue as fallback
    if (inMemoryQueue.length === 0) {
      return null;
    }

    const item = inMemoryQueue.shift()!;

    // Update process state to pending (about to run)
    await updateProcessState(item.processId, {
      status: 'pending',
      queuePosition: undefined,
    });

    logger.info({ processId: item.processId, inMemory: true }, 'Process dequeued (in-memory)');

    return item;
  }

  try {
    const redis = getRedisClient();

    // Pop the first item (highest priority, oldest)
    const result = await redis.zpopmin(PROCESS_QUEUE_KEY);

    if (!result || result.length === 0 || !result[0]) {
      return null;
    }

    const item = JSON.parse(result[0]) as ClaudeQueueItem;

    // Update process state to pending (about to run)
    await updateProcessState(item.processId, {
      status: 'pending',
      queuePosition: undefined,
    });

    logger.info({ processId: item.processId }, 'Process dequeued');

    return item;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to dequeue process');
    return null;
  }
}

/**
 * Removes a process from the queue (Redis or in-memory)
 */
export async function removeFromQueue(processId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    // Remove from in-memory queue
    const index = inMemoryQueue.findIndex((item) => item.processId === processId);
    if (index !== -1) {
      inMemoryQueue.splice(index, 1);
      logger.info({ processId, inMemory: true }, 'Process removed from queue (in-memory)');
      return true;
    }
    return false;
  }

  try {
    const redis = getRedisClient();

    // Get all queue items and find the one with matching processId
    const items = await redis.zrange(PROCESS_QUEUE_KEY, 0, -1);

    for (const itemStr of items) {
      const item = JSON.parse(itemStr) as ClaudeQueueItem;
      if (item.processId === processId) {
        await redis.zrem(PROCESS_QUEUE_KEY, itemStr);
        logger.info({ processId }, 'Process removed from queue');
        return true;
      }
    }

    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ processId, error: errorMessage }, 'Failed to remove process from queue');
    return false;
  }
}

/**
 * Gets queue size (Redis or in-memory)
 */
export async function getQueueSize(): Promise<number> {
  if (!isRedisConnected()) {
    return inMemoryQueue.length;
  }

  try {
    const redis = getRedisClient();
    return await redis.zcard(PROCESS_QUEUE_KEY);
  } catch (error) {
    // Fallback to in-memory on error
    return inMemoryQueue.length;
  }
}

/**
 * Gets queue position for a process (Redis or in-memory)
 */
export async function getQueuePosition(processId: string): Promise<number | null> {
  if (!isRedisConnected()) {
    // Check in-memory queue
    const position = inMemoryQueue.findIndex((item) => item.processId === processId);
    return position !== -1 ? position + 1 : null;
  }

  try {
    const redis = getRedisClient();
    const items = await redis.zrange(PROCESS_QUEUE_KEY, 0, -1);

    for (let i = 0; i < items.length; i++) {
      const itemStr = items[i];
      if (!itemStr) continue;
      const item = JSON.parse(itemStr) as ClaudeQueueItem;
      if (item.processId === processId) {
        return i + 1;
      }
    }

    // Fallback: check in-memory queue
    const inMemoryPosition = inMemoryQueue.findIndex((item) => item.processId === processId);
    return inMemoryPosition !== -1 ? inMemoryPosition + 1 : null;
  } catch (error) {
    // Fallback to in-memory on error
    const position = inMemoryQueue.findIndex((item) => item.processId === processId);
    return position !== -1 ? position + 1 : null;
  }
}

/**
 * Records a process duration for average calculation
 * Uses exponential moving average to weight recent durations more heavily
 */
export async function recordProcessDuration(durationMs: number): Promise<void> {
  if (durationMs <= 0) {
    return;
  }

  if (!isRedisConnected()) {
    // Update in-memory average
    inMemoryAvgDuration.totalDurationMs += durationMs;
    inMemoryAvgDuration.count += 1;
    return;
  }

  try {
    const redis = getRedisClient();
    const data = await redis.get(AVG_DURATION_KEY);

    let avgData: { totalDurationMs: number; count: number };
    if (data) {
      avgData = JSON.parse(data) as { totalDurationMs: number; count: number };
    } else {
      avgData = { totalDurationMs: 0, count: 0 };
    }

    avgData.totalDurationMs += durationMs;
    avgData.count += 1;

    // Store with long TTL (7 days)
    await redis.setex(AVG_DURATION_KEY, 604800, JSON.stringify(avgData));
  } catch (error) {
    // Fallback to in-memory on error
    inMemoryAvgDuration.totalDurationMs += durationMs;
    inMemoryAvgDuration.count += 1;
    logger.warn({ error }, 'Failed to record process duration in Redis, using in-memory fallback');
  }
}

/**
 * Gets the average process duration in milliseconds
 */
export async function getAverageProcessDuration(): Promise<number> {
  if (!isRedisConnected()) {
    // Use in-memory average
    if (inMemoryAvgDuration.count > 0) {
      return Math.round(inMemoryAvgDuration.totalDurationMs / inMemoryAvgDuration.count);
    }
    return DEFAULT_AVG_DURATION_MS;
  }

  try {
    const redis = getRedisClient();
    const data = await redis.get(AVG_DURATION_KEY);

    if (data) {
      const avgData = JSON.parse(data) as { totalDurationMs: number; count: number };
      if (avgData.count > 0) {
        return Math.round(avgData.totalDurationMs / avgData.count);
      }
    }

    // Fallback to in-memory if Redis has no data
    if (inMemoryAvgDuration.count > 0) {
      return Math.round(inMemoryAvgDuration.totalDurationMs / inMemoryAvgDuration.count);
    }

    return DEFAULT_AVG_DURATION_MS;
  } catch (error) {
    // Fallback to in-memory on error
    if (inMemoryAvgDuration.count > 0) {
      return Math.round(inMemoryAvgDuration.totalDurationMs / inMemoryAvgDuration.count);
    }
    return DEFAULT_AVG_DURATION_MS;
  }
}

/**
 * Computes estimated wait time in seconds based on queue position and average duration
 * @param queuePosition - Position in queue (1-indexed)
 * @param avgDurationMs - Average process duration in milliseconds
 * @returns Estimated wait time in seconds
 */
export function computeEstimatedWaitSeconds(queuePosition: number, avgDurationMs: number): number {
  if (queuePosition <= 0) {
    return 0;
  }

  // ETA = queue position * average duration
  // Convert from ms to seconds and round up
  const estimatedWaitMs = queuePosition * avgDurationMs;
  return Math.ceil(estimatedWaitMs / 1000);
}

/**
 * Cleans up zombie processes (processes marked as running but not in memory)
 */
export async function cleanupZombieProcesses(): Promise<number> {
  if (!isRedisConnected()) {
    return 0;
  }

  try {
    const redis = getRedisClient();
    const activeIds = await redis.smembers(ACTIVE_PROCESSES_KEY);
    let cleanedUp = 0;

    for (const processId of activeIds) {
      // If not in memory, it's a zombie
      if (!activeProcesses.has(processId)) {
        const state = await getProcessState(processId);

        if (state?.status === 'running') {
          await updateProcessState(processId, {
            status: 'failed',
            error: 'Process terminated unexpectedly (zombie cleanup)',
            completedAt: new Date().toISOString(),
          });
          await redis.srem(ACTIVE_PROCESSES_KEY, processId);
          cleanedUp++;

          logger.warn({ processId }, 'Cleaned up zombie process');
        }
      }
    }

    return cleanedUp;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to cleanup zombie processes');
    return 0;
  }
}

/**
 * Terminates all active processes (for graceful shutdown)
 */
export async function terminateAllProcesses(): Promise<number> {
  const processIds = Array.from(activeProcesses.keys());
  let terminated = 0;

  for (const processId of processIds) {
    try {
      await updateProcessState(processId, { status: 'cancelled' });
      const killed = await killProcess(processId, 'SIGTERM');
      if (killed) {
        terminated++;
      }
    } catch (error) {
      logger.error({ processId }, 'Failed to terminate process during shutdown');
    }
  }

  logger.info({ terminated, total: processIds.length }, 'Terminated processes for shutdown');
  return terminated;
}

/**
 * Waits for all active processes to complete (with timeout)
 */
export async function waitForProcesses(timeoutMs: number = 30000): Promise<boolean> {
  const startTime = Date.now();

  while (activeProcesses.size > 0 && Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const allCompleted = activeProcesses.size === 0;

  if (!allCompleted) {
    logger.warn({ remaining: activeProcesses.size }, 'Timeout waiting for processes to complete');
  }

  return allCompleted;
}

/**
 * Subscribes to process events
 */
export function onProcessEvent(listener: (event: ProcessEventData) => void): () => void {
  processEmitter.on('process', listener);
  return () => processEmitter.off('process', listener);
}

/**
 * Emits a process event
 */
function emitProcessEvent(event: ProcessEventData): void {
  processEmitter.emit('process', event);
}

/**
 * Gets the process event emitter (for advanced usage)
 */
export function getProcessEmitter(): EventEmitter {
  return processEmitter;
}

/**
 * Checks if a process is running
 */
export function isProcessRunning(processId: string): boolean {
  return activeProcesses.has(processId);
}

/**
 * Gets the raw ChildProcess instance (use with caution)
 */
export function getChildProcess(processId: string): ChildProcess | undefined {
  return activeProcesses.get(processId);
}

export default {
  spawnProcess,
  killProcess,
  cancelProcess,
  getProcessState,
  updateProcessState,
  listActiveProcesses,
  listUserProcesses,
  getActiveProcessCount,
  enqueueProcess,
  dequeueProcess,
  removeFromQueue,
  getQueueSize,
  getQueuePosition,
  recordProcessDuration,
  getAverageProcessDuration,
  computeEstimatedWaitSeconds,
  cleanupZombieProcesses,
  terminateAllProcesses,
  waitForProcesses,
  onProcessEvent,
  isProcessRunning,
};
