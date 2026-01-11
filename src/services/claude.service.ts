/**
 * Claude CLI Wrapper Service
 * Wraps Claude CLI for process-based execution with streaming support
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

import Anthropic from '@anthropic-ai/sdk';

import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import { recordProcessMetrics } from './claude-metrics.service.js';
import {
  spawnProcess,
  cancelProcess,
  getProcessState,
  updateProcessState,
  enqueueProcess,
  dequeueProcess,
  getQueueSize,
  getQueuePosition,
  getActiveProcessCount,
  onProcessEvent,
  getProcessEmitter,
  recordProcessDuration,
  type SpawnOptions,
  type ProcessEventData,
} from './process-manager.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  ClaudeProcessConfig,
  ClaudeProcessResult,
  ClaudeProcessStatus,
  ClaudeInstallationStatus,
  ClaudeServiceConfig,
  ClaudeQueueItem,
  ClaudeStreamEvent,
  ClaudeParsedResponse,
} from '../types/claude.types.js';

// Rate limit tracking prefix
const RATE_LIMIT_PREFIX = 'claude:ratelimit:';
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour
const DEFAULT_RATE_LIMIT = 10; // 10 processes per hour per user

// Default service configuration
let serviceConfig: ClaudeServiceConfig = {
  cliPath: process.env['CLAUDE_CLI_PATH'] ?? '/usr/local/bin/claude',
  apiKey: process.env['ANTHROPIC_API_KEY'],
  maxConcurrentProcesses: parseInt(process.env['CLAUDE_MAX_CONCURRENT_PROCESSES'] ?? '5', 10),
  defaultTimeoutMs: parseInt(process.env['CLAUDE_PROCESS_TIMEOUT_MS'] ?? '300000', 10),
  enableQueue: true,
  maxQueueSize: 100,
  maxRetries: 3,
  retryDelayMs: 1000,
  useApiFallback: true,
};

// Anthropic SDK client (for fallback)
let anthropicClient: Anthropic | null = null;

// Event listeners for streaming
type StreamListener = (event: ClaudeStreamEvent) => void;
const streamListeners = new Map<string, Set<StreamListener>>();

// Track active streaming sessions to prevent premature cleanup during retries
// Maps processId to { active: boolean, unsubscribe: () => void }
const activeStreamSessions = new Map<
  string,
  { active: boolean; unsubscribe: (() => void) | null }
>();

// Queue worker state
let queueWorkerRunning = false;
let queueWorkerInterval: NodeJS.Timeout | null = null;

// In-memory cache for CLI installation status to avoid blocking execSync calls
const INSTALLATION_CACHE_TTL_MS = 60000; // 60 seconds default
let installationStatusCache: {
  status: ClaudeInstallationStatus;
  timestamp: number;
} | null = null;

// Counter for in-flight API executions (tracked against same concurrency limit as CLI)
let inFlightApiExecutions = 0;

// Retryable exit codes (transient failures)
const RETRYABLE_EXIT_CODES = new Set([
  1, // General error (may be transient)
  75, // Temporary failure
  111, // Connection refused
  124, // Timeout
]);

// Retryable error patterns (network/transient issues)
const RETRYABLE_ERROR_PATTERNS = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENETUNREACH/i,
  /EHOSTUNREACH/i,
  /socket hang up/i,
  /network/i,
  /timeout/i,
  /temporarily unavailable/i,
  /rate limit/i,
  /overloaded/i,
  /503/i,
  /502/i,
  /429/i,
];

/**
 * Checks if an error is retryable (transient)
 */
function isRetryableError(error: string | undefined, exitCode: number | null | undefined): boolean {
  // Check exit code
  if (exitCode !== null && exitCode !== undefined && RETRYABLE_EXIT_CODES.has(exitCode)) {
    return true;
  }

  // Check error message patterns
  if (error) {
    return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(error));
  }

  return false;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay
 */
function calculateBackoffDelay(attempt: number, baseDelayMs: number): number {
  // Exponential backoff: baseDelay * 2^attempt with jitter
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  // Add random jitter (0-25% of delay) to prevent thundering herd
  const jitter = exponentialDelay * Math.random() * 0.25;
  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Emits a process event for API fallback executions
 * This ensures stream listeners and status polling observe the correct state
 */
function emitApiProcessEvent(event: ProcessEventData): void {
  getProcessEmitter().emit('process', event);
}

/**
 * Initializes the Claude service with configuration
 */
export function initializeClaudeService(config?: Partial<ClaudeServiceConfig>): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  // Initialize Anthropic client if API key is available
  if (serviceConfig.apiKey && serviceConfig.useApiFallback) {
    anthropicClient = new Anthropic({
      apiKey: serviceConfig.apiKey,
    });
    logger.info('Anthropic SDK client initialized for API fallback');
  }

  // Start queue worker only if queueing is enabled
  if (serviceConfig.enableQueue) {
    startQueueWorker();
  }

  logger.info(
    {
      cliPath: serviceConfig.cliPath,
      maxConcurrent: serviceConfig.maxConcurrentProcesses,
      timeoutMs: serviceConfig.defaultTimeoutMs,
      queueEnabled: serviceConfig.enableQueue,
      apiFallback: serviceConfig.useApiFallback,
    },
    'Claude service initialized'
  );
}

/**
 * Validates Claude CLI installation with in-memory caching to avoid blocking execSync calls.
 * @param forceRefresh - If true, bypasses the cache and performs a fresh check (useful for health checks)
 */
export function validateClaudeInstallation(forceRefresh = false): ClaudeInstallationStatus {
  // Check if we have a valid cached result
  if (!forceRefresh && installationStatusCache) {
    const cacheAge = Date.now() - installationStatusCache.timestamp;
    if (cacheAge < INSTALLATION_CACHE_TTL_MS) {
      return installationStatusCache.status;
    }
  }

  // Perform the actual validation
  let status: ClaudeInstallationStatus;

  try {
    // Check if path exists
    if (!existsSync(serviceConfig.cliPath)) {
      status = {
        installed: false,
        error: `Claude CLI not found at ${serviceConfig.cliPath}`,
      };
    } else {
      // Try to get version
      try {
        const versionOutput = execSync(`"${serviceConfig.cliPath}" --version`, {
          timeout: 5000,
          encoding: 'utf-8',
        }).trim();

        status = {
          installed: true,
          path: serviceConfig.cliPath,
          version: versionOutput,
        };
      } catch {
        // CLI exists but version check failed (might still work)
        status = {
          installed: true,
          path: serviceConfig.cliPath,
          version: 'unknown',
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    status = {
      installed: false,
      error: errorMessage,
    };
  }

  // Update the cache
  installationStatusCache = {
    status,
    timestamp: Date.now(),
  };

  return status;
}

/**
 * Checks if Claude CLI is available, or if API fallback is available
 */
export function isClaudeAvailable(): boolean {
  const cliStatus = validateClaudeInstallation();
  return cliStatus.installed || (serviceConfig.useApiFallback && anthropicClient !== null);
}

/**
 * Checks rate limit for a user
 */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!isRedisConnected()) {
    // Allow if Redis is not available
    return { allowed: true, remaining: DEFAULT_RATE_LIMIT };
  }

  try {
    const redis = getRedisClient();
    const key = `${RATE_LIMIT_PREFIX}${userId}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    const remaining = Math.max(0, DEFAULT_RATE_LIMIT - count);
    return { allowed: count <= DEFAULT_RATE_LIMIT, remaining };
  } catch {
    // Allow on error
    return { allowed: true, remaining: DEFAULT_RATE_LIMIT };
  }
}

/**
 * Executes a Claude CLI command
 */
export async function executeClaudeCommand(
  config: ClaudeProcessConfig
): Promise<ClaudeProcessResult> {
  const processId = config.id || generateRequestId().replace('req_', 'claude_');
  const startTime = Date.now();

  logger.info({ processId, userId: config.userId }, 'Executing Claude command');

  // Check rate limit
  const rateLimitResult = await checkRateLimit(config.userId);
  if (!rateLimitResult.allowed) {
    logger.warn({ processId, userId: config.userId }, 'Rate limit exceeded');
    const createdAt = new Date().toISOString();
    const rateLimitError = 'Rate limit exceeded. Try again later.';

    // Persist failed state so status polling reports the failure
    await updateProcessState(processId, {
      config: { ...config, id: processId },
      status: 'failed',
      error: rateLimitError,
      createdAt,
      completedAt: createdAt,
    });

    return {
      id: processId,
      userId: config.userId,
      status: 'failed',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt: createdAt,
      completedAt: createdAt,
      durationMs: 0,
      error: rateLimitError,
    };
  }

  // Check CLI availability
  const cliStatus = validateClaudeInstallation();

  // If CLI not available, try API fallback
  if (!cliStatus.installed) {
    if (serviceConfig.useApiFallback && anthropicClient) {
      // Check concurrency limit (including in-flight API executions)
      const activeCount = await getActiveProcessCount();
      const totalActive = activeCount + inFlightApiExecutions;
      if (totalActive >= serviceConfig.maxConcurrentProcesses) {
        if (serviceConfig.enableQueue) {
          // Enqueue for later execution
          return await enqueueForExecution(config, processId);
        }

        const createdAt = new Date().toISOString();
        const concurrencyError = 'Maximum concurrent processes reached. Try again later.';

        // Persist failed state so status polling reports the failure
        await updateProcessState(processId, {
          config: { ...config, id: processId },
          status: 'failed',
          error: concurrencyError,
          createdAt,
          completedAt: createdAt,
        });

        return {
          id: processId,
          userId: config.userId,
          status: 'failed',
          stdout: '',
          stderr: '',
          exitCode: null,
          startedAt: createdAt,
          completedAt: createdAt,
          durationMs: 0,
          error: concurrencyError,
        };
      }

      logger.info({ processId }, 'Claude CLI not available, using API fallback');
      inFlightApiExecutions++;
      try {
        return await executeViaApi(config, processId, startTime);
      } finally {
        inFlightApiExecutions--;
      }
    }

    const createdAt = new Date().toISOString();
    const cliUnavailableError =
      cliStatus.error ?? 'Claude CLI not available and no API fallback configured';

    // Persist failed state so status polling reports the failure
    await updateProcessState(processId, {
      config: { ...config, id: processId },
      status: 'failed',
      error: cliUnavailableError,
      createdAt,
      completedAt: createdAt,
    });

    return {
      id: processId,
      userId: config.userId,
      status: 'failed',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt: createdAt,
      completedAt: createdAt,
      durationMs: 0,
      error: cliUnavailableError,
    };
  }

  // Check concurrency limit
  const activeCount = await getActiveProcessCount();
  if (activeCount + inFlightApiExecutions >= serviceConfig.maxConcurrentProcesses) {
    if (serviceConfig.enableQueue) {
      // Enqueue for later execution
      return await enqueueForExecution(config, processId);
    }

    const createdAt = new Date().toISOString();
    const concurrencyError = 'Maximum concurrent processes reached. Try again later.';

    // Persist failed state so status polling reports the failure
    await updateProcessState(processId, {
      config: { ...config, id: processId },
      status: 'failed',
      error: concurrencyError,
      createdAt,
      completedAt: createdAt,
    });

    return {
      id: processId,
      userId: config.userId,
      status: 'failed',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt: createdAt,
      completedAt: createdAt,
      durationMs: 0,
      error: concurrencyError,
    };
  }

  // Execute via CLI
  return await executeViaCli(config, processId, startTime);
}

/**
 * Executes command via Claude CLI with retry support for transient failures
 */
async function executeViaCli(
  config: ClaudeProcessConfig,
  processId: string,
  startTime: number
): Promise<ClaudeProcessResult> {
  const maxRetries = serviceConfig.maxRetries;
  const baseDelayMs = serviceConfig.retryDelayMs;
  let lastResult: ClaudeProcessResult | null = null;
  let attempt = 0;

  // Setup streaming once before any attempts - listeners filter by processId
  // and we reuse the same processId for all retry attempts
  if (config.stream) {
    setupStreamingForProcess(processId, config.userId);
  }

  while (attempt <= maxRetries) {
    if (attempt > 0) {
      logger.info(
        { processId, attempt, maxRetries },
        'Retrying Claude CLI execution after transient failure'
      );

      // Reset process state for retry - clear previous stdout/stderr
      // but keep the original processId so stream listeners continue receiving events
      await updateProcessState(processId, {
        status: 'running',
        stdout: '',
        stderr: '',
        exitCode: undefined,
        completedAt: undefined,
        error: undefined,
        retryCount: attempt,
      });
    }

    // Build CLI arguments
    const args = buildCliArgs(config);

    // Prepare spawn options - always use the original processId
    // This ensures events are emitted under the same ID that listeners are filtering for
    const spawnOptions: SpawnOptions = {
      id: processId,
      userId: config.userId,
      command: serviceConfig.cliPath,
      args,
      cwd: config.workingDirectory,
      env: config.env,
      timeoutMs: config.timeoutMs ?? serviceConfig.defaultTimeoutMs,
      captureOutput: true,
      stdinContent: config.prompt, // Pass prompt via stdin to avoid E2BIG for large prompts
    };

    // Update config in process state
    await updateProcessState(processId, {
      config: { ...config, id: processId },
    });

    try {
      // Spawn the process
      await spawnProcess(spawnOptions);

      // Wait for completion
      const result = await waitForCompletion(
        processId,
        config.timeoutMs ?? serviceConfig.defaultTimeoutMs
      );

      // Calculate duration from original start time
      const durationMs = Date.now() - startTime;

      // Check if this is a retryable failure
      if (result.status === 'failed' || result.status === 'timeout') {
        const isRetryable = isRetryableError(result.error, result.exitCode);

        if (isRetryable && attempt < maxRetries) {
          logger.warn(
            {
              processId,
              attempt,
              exitCode: result.exitCode,
              error: result.error,
            },
            'Transient failure detected, will retry'
          );

          // Store result in case this is the last attempt
          lastResult = {
            id: processId,
            userId: config.userId,
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode ?? null,
            startedAt: result.startedAt ?? new Date(startTime).toISOString(),
            completedAt: result.completedAt ?? new Date().toISOString(),
            durationMs,
            error: result.error,
          };

          // Wait with exponential backoff before retrying
          const delayMs = calculateBackoffDelay(attempt, baseDelayMs);
          logger.debug({ processId, delayMs, attempt }, 'Waiting before retry');
          await sleep(delayMs);

          attempt++;
          continue;
        }
      }

      // Parse response if possible
      let parsedResponse: ClaudeParsedResponse | undefined;
      try {
        if (result.stdout) {
          parsedResponse = parseClaudeOutput(result.stdout);
        }
      } catch {
        // Parsing failed, continue without parsed response
      }

      // Record metrics for completed process
      recordProcessMetrics({
        processId,
        userId: config.userId,
        durationMs,
        inputSize: config.prompt.length,
        outputSize: result.stdout.length,
        success: result.status === 'completed',
        timestamp: new Date().toISOString(),
      });

      // Record duration for ETA calculation (only for successful completions)
      if (result.status === 'completed') {
        await recordProcessDuration(durationMs);
      }

      // Update process state with final result
      await updateProcessState(processId, {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        completedAt: new Date().toISOString(),
        error: result.error,
      });

      // Cleanup streaming session on successful completion or non-retryable failure
      cleanupStreamSession(processId);

      return {
        id: processId,
        userId: config.userId,
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode ?? null,
        startedAt: result.startedAt ?? new Date(startTime).toISOString(),
        completedAt: result.completedAt ?? new Date().toISOString(),
        durationMs,
        error:
          attempt > 0 && result.status === 'failed'
            ? `${result.error ?? 'Unknown error'} (after ${String(attempt + 1)} attempts)`
            : result.error,
        parsedResponse,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isRetryable = isRetryableError(errorMessage, null);

      if (isRetryable && attempt < maxRetries) {
        logger.warn(
          { processId, attempt, error: errorMessage },
          'Transient exception during CLI execution, will retry'
        );

        // Wait with exponential backoff before retrying
        const delayMs = calculateBackoffDelay(attempt, baseDelayMs);
        await sleep(delayMs);

        attempt++;
        continue;
      }

      logger.error(
        { processId, error: errorMessage, attempts: attempt + 1 },
        'Claude CLI execution failed after all retries'
      );

      const failedDurationMs = Date.now() - startTime;

      // Record metrics for failed process
      recordProcessMetrics({
        processId,
        userId: config.userId,
        durationMs: failedDurationMs,
        inputSize: config.prompt.length,
        outputSize: 0,
        success: false,
        timestamp: new Date().toISOString(),
      });

      // Update process state with failure
      await updateProcessState(processId, {
        status: 'failed',
        error:
          attempt > 0 ? `${errorMessage} (after ${String(attempt + 1)} attempts)` : errorMessage,
        completedAt: new Date().toISOString(),
      });

      // Cleanup streaming session on non-retryable exception
      cleanupStreamSession(processId);

      return {
        id: processId,
        userId: config.userId,
        status: 'failed',
        stdout: '',
        stderr: '',
        exitCode: null,
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: failedDurationMs,
        error:
          attempt > 0 ? `${errorMessage} (after ${String(attempt + 1)} attempts)` : errorMessage,
      };
    }
  }

  // This should only be reached if all retries exhausted through the result.status path
  // Return the last result with updated error message
  if (lastResult) {
    const finalDurationMs = Date.now() - startTime;

    // Update process state with final failure
    await updateProcessState(processId, {
      status: 'failed',
      error: `${lastResult.error ?? 'Unknown error'} (after ${String(maxRetries + 1)} attempts)`,
      completedAt: new Date().toISOString(),
    });

    // Record metrics for final failure
    recordProcessMetrics({
      processId,
      userId: config.userId,
      durationMs: finalDurationMs,
      inputSize: config.prompt.length,
      outputSize: 0,
      success: false,
      timestamp: new Date().toISOString(),
    });

    // Cleanup streaming session after all retries exhausted
    cleanupStreamSession(processId);

    return {
      ...lastResult,
      durationMs: finalDurationMs,
      error: `${lastResult.error ?? 'Unknown error'} (after ${String(maxRetries + 1)} attempts)`,
    };
  }

  // Fallback (should never reach here)
  cleanupStreamSession(processId);
  return {
    id: processId,
    userId: config.userId,
    status: 'failed',
    stdout: '',
    stderr: '',
    exitCode: null,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    error: 'Unexpected error in retry logic',
  };
}

/**
 * Checks if an API error is retryable
 */
function isRetryableApiError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Check for common retryable API errors
    if (
      message.includes('rate limit') ||
      message.includes('overloaded') ||
      message.includes('temporarily') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('network') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('429') ||
      message.includes('500')
    ) {
      return true;
    }

    // Check for Anthropic SDK specific error properties
    const anyError = error as { status?: number };
    if (anyError.status) {
      // Retry on 429 (rate limit), 500, 502, 503, 504 (server errors)
      return [429, 500, 502, 503, 504].includes(anyError.status);
    }
  }
  return false;
}

/**
 * Executes command via Anthropic API (fallback) with retry support for transient failures
 */
async function executeViaApi(
  config: ClaudeProcessConfig,
  processId: string,
  startTime: number
): Promise<ClaudeProcessResult> {
  const startedAt = new Date(startTime).toISOString();

  if (!anthropicClient) {
    const completedAt = new Date().toISOString();
    const errorMsg = 'Anthropic API client not initialized';

    // Update process state with failure
    await updateProcessState(processId, {
      status: 'failed',
      stdout: '',
      stderr: '',
      exitCode: undefined,
      startedAt,
      completedAt,
      error: errorMsg,
      config: { ...config, id: processId },
    });

    // Emit error event
    emitApiProcessEvent({
      processId,
      userId: config.userId,
      type: 'error',
      error: errorMsg,
      timestamp: completedAt,
    });

    return {
      id: processId,
      userId: config.userId,
      status: 'failed',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      error: errorMsg,
    };
  }

  const maxRetries = serviceConfig.maxRetries;
  const baseDelayMs = serviceConfig.retryDelayMs;
  let lastError: string = '';
  let attempt = 0;

  // Update process state to running before first API call and emit start event
  await updateProcessState(processId, {
    status: 'running',
    startedAt,
    config: { ...config, id: processId },
  });

  emitApiProcessEvent({
    processId,
    userId: config.userId,
    type: 'start',
    timestamp: startedAt,
  });

  while (attempt <= maxRetries) {
    if (attempt > 0) {
      logger.info(
        { processId, attempt, maxRetries },
        'Retrying Anthropic API execution after transient failure'
      );
    }

    try {
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: config.prompt }];

      const response = await anthropicClient.messages.create({
        model: config.model ?? 'claude-sonnet-4-20250514',
        max_tokens: config.maxTokens ?? 4096,
        system: config.systemPrompt,
        messages,
      });

      // Extract text content
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      const durationMs = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      // Record metrics for successful API execution
      recordProcessMetrics({
        processId,
        userId: config.userId,
        durationMs,
        inputSize: config.prompt.length,
        outputSize: textContent.length,
        success: true,
        timestamp: completedAt,
      });

      // Record duration for ETA calculation
      await recordProcessDuration(durationMs);

      // Update process state to completed
      await updateProcessState(processId, {
        status: 'completed',
        stdout: textContent,
        stderr: '',
        exitCode: 0,
        completedAt,
        error: undefined,
      });

      // Emit exit event for successful completion
      emitApiProcessEvent({
        processId,
        userId: config.userId,
        type: 'exit',
        exitCode: 0,
        timestamp: completedAt,
      });

      return {
        id: processId,
        userId: config.userId,
        status: 'completed',
        stdout: textContent,
        stderr: '',
        exitCode: 0,
        startedAt,
        completedAt,
        durationMs,
        parsedResponse: {
          content: textContent,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
          model: response.model,
          stopReason: response.stop_reason ?? undefined,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      lastError = errorMessage;

      // Check if this is a retryable error
      if (isRetryableApiError(error) && attempt < maxRetries) {
        logger.warn(
          { processId, attempt, error: errorMessage },
          'Transient API error detected, will retry'
        );

        // Wait with exponential backoff before retrying
        const delayMs = calculateBackoffDelay(attempt, baseDelayMs);
        logger.debug({ processId, delayMs, attempt }, 'Waiting before API retry');
        await sleep(delayMs);

        attempt++;
        continue;
      }

      // Non-retryable error or exhausted retries
      logger.error(
        { processId, error: errorMessage, attempts: attempt + 1 },
        'Anthropic API execution failed after all retries'
      );

      const failedDurationMs = Date.now() - startTime;
      const completedAt = new Date().toISOString();
      const finalError =
        attempt > 0 ? `${errorMessage} (after ${String(attempt + 1)} attempts)` : errorMessage;

      // Record metrics for failed API execution
      recordProcessMetrics({
        processId,
        userId: config.userId,
        durationMs: failedDurationMs,
        inputSize: config.prompt.length,
        outputSize: 0,
        success: false,
        timestamp: completedAt,
      });

      // Update process state to failed
      await updateProcessState(processId, {
        status: 'failed',
        stdout: '',
        stderr: '',
        exitCode: undefined,
        completedAt,
        error: finalError,
      });

      // Emit error event
      emitApiProcessEvent({
        processId,
        userId: config.userId,
        type: 'error',
        error: finalError,
        timestamp: completedAt,
      });

      return {
        id: processId,
        userId: config.userId,
        status: 'failed',
        stdout: '',
        stderr: '',
        exitCode: null,
        startedAt,
        completedAt,
        durationMs: failedDurationMs,
        error: finalError,
      };
    }
  }

  // This should only be reached if all retries exhausted
  const finalDurationMs = Date.now() - startTime;
  const completedAt = new Date().toISOString();
  const finalError = `${lastError ?? 'Unknown error'} (after ${String(maxRetries + 1)} attempts)`;

  // Record metrics for final failure
  recordProcessMetrics({
    processId,
    userId: config.userId,
    durationMs: finalDurationMs,
    inputSize: config.prompt.length,
    outputSize: 0,
    success: false,
    timestamp: completedAt,
  });

  // Update process state to failed
  await updateProcessState(processId, {
    status: 'failed',
    stdout: '',
    stderr: '',
    exitCode: undefined,
    completedAt,
    error: finalError,
  });

  // Emit error event
  emitApiProcessEvent({
    processId,
    userId: config.userId,
    type: 'error',
    error: finalError,
    timestamp: completedAt,
  });

  return {
    id: processId,
    userId: config.userId,
    status: 'failed',
    stdout: '',
    stderr: '',
    exitCode: null,
    startedAt,
    completedAt,
    durationMs: finalDurationMs,
    error: finalError,
  };
}

/**
 * Enqueues a command for later execution
 */
async function enqueueForExecution(
  config: ClaudeProcessConfig,
  processId: string
): Promise<ClaudeProcessResult> {
  const queueItem: ClaudeQueueItem = {
    processId,
    userId: config.userId,
    priority: config.priority ?? 0,
    enqueuedAt: new Date().toISOString(),
  };

  try {
    // enqueueProcess now returns { position, estimatedWaitSeconds }
    const enqueueResult = await enqueueProcess(queueItem, serviceConfig.maxQueueSize, {
      ...config,
      id: processId,
    });

    logger.info(
      {
        processId,
        position: enqueueResult.position,
        estimatedWaitSeconds: enqueueResult.estimatedWaitSeconds,
      },
      'Process enqueued'
    );

    // Return a "queued" result with queue position and estimated wait time
    return {
      id: processId,
      userId: config.userId,
      status: 'queued',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt: '',
      completedAt: '',
      durationMs: 0,
      queuePosition: enqueueResult.position,
      estimatedWaitSeconds: enqueueResult.estimatedWaitSeconds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      id: processId,
      userId: config.userId,
      status: 'failed',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      error: `Failed to enqueue: ${errorMessage}`,
    };
  }
}

/**
 * Response from enqueueClaudeCommand (fire-and-forget execution)
 */
export interface EnqueueResult {
  processId: string;
  status: 'pending' | 'queued' | 'running' | 'failed';
  queuePosition?: number;
  /** Estimated wait time in seconds (for queued processes) */
  estimatedWaitSeconds?: number;
  error?: string;
}

/**
 * Enqueues a Claude command for fire-and-forget execution.
 * Returns immediately with process ID and initial status without waiting for completion.
 * Use getClaudeProcessStatus() to poll for results.
 */
export async function enqueueClaudeCommand(config: ClaudeProcessConfig): Promise<EnqueueResult> {
  const processId = config.id || generateRequestId().replace('req_', 'claude_');
  const createdAt = new Date().toISOString();

  logger.info({ processId, userId: config.userId }, 'Enqueuing Claude command (fire-and-forget)');

  // Check rate limit
  const rateLimitResult = await checkRateLimit(config.userId);
  if (!rateLimitResult.allowed) {
    logger.warn({ processId, userId: config.userId }, 'Rate limit exceeded');

    // Write failed process state so status polling reports the failure
    await updateProcessState(processId, {
      config: { ...config, id: processId },
      status: 'failed',
      error: 'Rate limit exceeded. Try again later.',
      createdAt,
      completedAt: createdAt,
    });

    return {
      processId,
      status: 'failed',
      error: 'Rate limit exceeded. Try again later.',
    };
  }

  // Check CLI availability
  const cliStatus = validateClaudeInstallation();

  // If CLI not available and no API fallback, return error
  if (!cliStatus.installed && !(serviceConfig.useApiFallback && anthropicClient)) {
    const errorMessage =
      cliStatus.error ?? 'Claude CLI not available and no API fallback configured';

    // Write failed process state so status polling reports the failure
    await updateProcessState(processId, {
      config: { ...config, id: processId },
      status: 'failed',
      error: errorMessage,
      createdAt,
      completedAt: createdAt,
    });

    return {
      processId,
      status: 'failed',
      error: errorMessage,
    };
  }

  // Check concurrency limit (including in-flight API executions)
  const activeCount = await getActiveProcessCount();
  const totalActive = activeCount + inFlightApiExecutions;
  if (totalActive >= serviceConfig.maxConcurrentProcesses) {
    if (serviceConfig.enableQueue) {
      // Enqueue for later execution by queue worker
      const queueItem: ClaudeQueueItem = {
        processId,
        userId: config.userId,
        priority: config.priority ?? 0,
        enqueuedAt: createdAt,
      };

      try {
        // enqueueProcess now returns { position, estimatedWaitSeconds }
        const enqueueResult = await enqueueProcess(queueItem, serviceConfig.maxQueueSize, {
          ...config,
          id: processId,
        });

        logger.info(
          {
            processId,
            position: enqueueResult.position,
            estimatedWaitSeconds: enqueueResult.estimatedWaitSeconds,
          },
          'Process enqueued due to concurrency limit'
        );

        return {
          processId,
          status: 'queued',
          queuePosition: enqueueResult.position,
          estimatedWaitSeconds: enqueueResult.estimatedWaitSeconds,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const fullError = `Failed to enqueue: ${errorMessage}`;

        // Write failed process state so status polling reports the failure
        await updateProcessState(processId, {
          config: { ...config, id: processId },
          status: 'failed',
          error: fullError,
          createdAt,
          completedAt: createdAt,
        });

        return {
          processId,
          status: 'failed',
          error: fullError,
        };
      }
    }

    // Queue is disabled and concurrency limit reached
    const concurrencyError = 'Maximum concurrent processes reached. Try again later.';

    // Write failed process state so status polling reports the failure
    await updateProcessState(processId, {
      config: { ...config, id: processId },
      status: 'failed',
      error: concurrencyError,
      createdAt,
      completedAt: createdAt,
    });

    return {
      processId,
      status: 'failed',
      error: concurrencyError,
    };
  }

  // Initialize process state as pending
  await updateProcessState(processId, {
    config: { ...config, id: processId },
    status: 'pending',
    createdAt,
  });

  // Fire and forget: start execution in background without awaiting
  const startTime = Date.now();

  if (!cliStatus.installed && serviceConfig.useApiFallback && anthropicClient) {
    // Use API fallback - track in-flight execution against concurrency limit
    inFlightApiExecutions++;
    executeViaApi(config, processId, startTime)
      .then((result) => {
        logger.info(
          { processId, status: result.status },
          'Fire-and-forget API execution completed'
        );
      })
      .catch((error: unknown) => {
        logger.error(
          { processId, error: error instanceof Error ? error.message : 'Unknown error' },
          'Fire-and-forget API execution failed'
        );
      })
      .finally(() => {
        inFlightApiExecutions--;
      });
  } else {
    // Use CLI
    executeViaCli(config, processId, startTime)
      .then((result) => {
        logger.info(
          { processId, status: result.status },
          'Fire-and-forget CLI execution completed'
        );
      })
      .catch((error: unknown) => {
        logger.error(
          { processId, error: error instanceof Error ? error.message : 'Unknown error' },
          'Fire-and-forget CLI execution failed'
        );
      });
  }

  // Return immediately with pending status
  return {
    processId,
    status: 'pending',
  };
}

/**
 * Builds CLI arguments from config (prompt is passed via stdin, not as arg)
 */
function buildCliArgs(config: ClaudeProcessConfig): string[] {
  const args: string[] = [];

  // Use --print flag for single-shot execution with stdin prompt
  args.push('--print');

  // Add model if specified
  if (config.model) {
    args.push('--model', config.model);
  }

  // Add max tokens if specified
  if (config.maxTokens) {
    args.push('--max-tokens', config.maxTokens.toString());
  }

  // Add system prompt if specified
  if (config.systemPrompt) {
    args.push('--system-prompt', config.systemPrompt);
  }

  // Add any additional CLI args
  if (config.cliArgs && config.cliArgs.length > 0) {
    args.push(...config.cliArgs);
  }

  return args;
}

/**
 * Waits for a process to complete
 */
async function waitForCompletion(
  processId: string,
  timeoutMs: number
): Promise<{
  status: ClaudeProcessStatus;
  stdout: string;
  stderr: string;
  exitCode?: number | null;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}> {
  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < timeoutMs) {
    const state = await getProcessState(processId);

    if (!state) {
      return {
        status: 'failed',
        stdout: '',
        stderr: '',
        error: 'Process state not found',
      };
    }

    if (['completed', 'failed', 'timeout', 'cancelled'].includes(state.status)) {
      return {
        status: state.status,
        stdout: state.stdout,
        stderr: state.stderr,
        exitCode: state.exitCode,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
        error: state.error,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout reached
  return {
    status: 'timeout',
    stdout: '',
    stderr: '',
    error: 'Timeout waiting for process completion',
  };
}

/**
 * Parses Claude CLI output
 */
export function parseClaudeOutput(output: string): ClaudeParsedResponse {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const content = parsed['content'] ?? parsed['text'] ?? parsed['response'];
    if (typeof content === 'string') {
      return {
        content,
        usage: parsed['usage'] as ClaudeParsedResponse['usage'],
        model: parsed['model'] as string | undefined,
        stopReason: (parsed['stop_reason'] ?? parsed['stopReason']) as string | undefined,
      };
    }
  } catch {
    // Not JSON, treat as plain text
  }

  return {
    content: output.trim(),
  };
}

/**
 * Sets up streaming for a process
 * The streaming session persists across retry attempts - cleanup only happens
 * when cleanupStreamSession is called after all retries are exhausted or on success
 */
function setupStreamingForProcess(processId: string, _userId: string): void {
  // If streaming is already set up for this process, don't create duplicate handlers
  if (activeStreamSessions.has(processId)) {
    return;
  }

  // Mark this session as active
  activeStreamSessions.set(processId, { active: true, unsubscribe: null });

  const unsubscribe = onProcessEvent((event: ProcessEventData) => {
    if (event.processId !== processId) {
      return;
    }

    const listeners = streamListeners.get(processId);
    if (!listeners || listeners.size === 0) {
      return;
    }

    let streamEvent: ClaudeStreamEvent;

    switch (event.type) {
      case 'start':
        streamEvent = {
          processId,
          type: 'start',
          timestamp: event.timestamp,
        };
        break;

      case 'stdout':
        streamEvent = {
          processId,
          type: 'data',
          timestamp: event.timestamp,
          data: event.data,
        };
        break;

      case 'stderr':
        streamEvent = {
          processId,
          type: 'data',
          timestamp: event.timestamp,
          data: event.data,
        };
        break;

      case 'error':
        streamEvent = {
          processId,
          type: 'error',
          timestamp: event.timestamp,
          error: event.error,
        };
        break;

      case 'exit':
      case 'timeout':
        // For exit/timeout events during retries, we still emit the event
        // but don't cleanup yet - cleanup happens via cleanupStreamSession
        // after all retries are exhausted or on final success
        streamEvent = {
          processId,
          type: 'end',
          timestamp: event.timestamp,
        };
        // Note: We intentionally don't clean up here anymore.
        // Cleanup is handled by cleanupStreamSession() called from executeViaCli
        // after the retry loop completes (success or exhausted retries).
        break;

      default:
        return;
    }

    // Notify all listeners
    for (const listener of listeners) {
      try {
        listener(streamEvent);
      } catch (listenerError) {
        logger.error({ processId, error: listenerError }, 'Stream listener error');
      }
    }
  });

  // Store the unsubscribe function for later cleanup
  const session = activeStreamSessions.get(processId);
  if (session) {
    session.unsubscribe = unsubscribe;
  }
}

/**
 * Cleans up streaming session for a process
 * Should be called after all retries are exhausted or on successful completion
 */
function cleanupStreamSession(processId: string): void {
  const session = activeStreamSessions.get(processId);
  if (session) {
    if (session.unsubscribe) {
      session.unsubscribe();
    }
    activeStreamSessions.delete(processId);
  }
  streamListeners.delete(processId);
}

/**
 * Subscribes to streaming events for a process
 */
export function subscribeToStream(processId: string, listener: StreamListener): () => void {
  let listeners = streamListeners.get(processId);
  if (!listeners) {
    listeners = new Set();
    streamListeners.set(processId, listeners);
  }

  listeners.add(listener);

  return () => {
    const listeners = streamListeners.get(processId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        streamListeners.delete(processId);
      }
    }
  };
}

/**
 * Streams Claude response in real-time
 * When the result is 'queued', the subscription is kept alive and attached to the result.
 * Caller should call unsubscribeQueuedStream() when the queued job completes.
 */
export async function streamClaudeResponse(
  config: ClaudeProcessConfig,
  onEvent: StreamListener
): Promise<ClaudeProcessResult> {
  const processId = config.id || generateRequestId().replace('req_', 'claude_');

  // Subscribe to events before starting
  const unsubscribe = subscribeToStream(processId, onEvent);

  let shouldUnsubscribe = true;

  try {
    // Execute with streaming enabled
    const result = await executeClaudeCommand({
      ...config,
      id: processId,
      stream: true,
    });

    // If the job is queued, don't unsubscribe - the caller needs to keep the
    // subscription alive to receive events when the job starts running.
    // Store the unsubscribe function in the result so caller can clean up later.
    if (result.status === 'queued') {
      // Attach unsubscribe to result for caller to manage
      (result as ClaudeProcessResult & { _unsubscribe?: () => void })._unsubscribe = unsubscribe;
      shouldUnsubscribe = false;
      return result;
    }

    return result;
  } finally {
    // Only unsubscribe if the job was NOT queued
    // For queued jobs, the caller is responsible for calling unsubscribeQueuedStream()
    if (shouldUnsubscribe) {
      unsubscribe();
    }
  }
}

/**
 * Unsubscribes from a queued stream result
 * Call this when the queued job completes or errors
 */
export function unsubscribeQueuedStream(result: ClaudeProcessResult): void {
  const unsubscribeFn = (result as ClaudeProcessResult & { _unsubscribe?: () => void })
    ._unsubscribe;
  if (unsubscribeFn) {
    unsubscribeFn();
    delete (result as ClaudeProcessResult & { _unsubscribe?: () => void })._unsubscribe;
  }
}

/**
 * Cancels a Claude process
 */
export async function cancelClaudeProcess(processId: string): Promise<boolean> {
  return await cancelProcess(processId);
}

/**
 * Gets the status of a Claude process
 */
export async function getClaudeProcessStatus(processId: string): Promise<{
  status: ClaudeProcessStatus;
  queuePosition?: number;
  result?: ClaudeProcessResult;
} | null> {
  const state = await getProcessState(processId);

  if (!state) {
    return null;
  }

  const response: {
    status: ClaudeProcessStatus;
    queuePosition?: number;
    result?: ClaudeProcessResult;
  } = {
    status: state.status,
  };

  if (state.status === 'queued') {
    response.queuePosition = (await getQueuePosition(processId)) ?? undefined;
  }

  if (['completed', 'failed', 'timeout', 'cancelled'].includes(state.status)) {
    response.result = {
      id: processId,
      userId: state.config.userId,
      status: state.status,
      stdout: state.stdout,
      stderr: state.stderr,
      exitCode: state.exitCode ?? null,
      startedAt: state.startedAt ?? state.createdAt,
      completedAt: state.completedAt ?? new Date().toISOString(),
      durationMs:
        state.completedAt && state.startedAt
          ? Date.parse(state.completedAt) - Date.parse(state.startedAt)
          : 0,
      error: state.error,
    };
  }

  return response;
}

/**
 * Gets service health status
 * @param forceRefresh - If true, bypasses CLI installation cache for fresh status (default: true for health checks)
 */
export async function getClaudeServiceHealth(forceRefresh = true): Promise<{
  healthy: boolean;
  cli: ClaudeInstallationStatus;
  apiFallbackAvailable: boolean;
  activeProcesses: number;
  queueSize: number;
  maxConcurrentProcesses: number;
}> {
  // Health checks should use fresh data by default to provide accurate status
  const cliStatus = validateClaudeInstallation(forceRefresh);
  const activeProcesses = await getActiveProcessCount();
  const queueSize = await getQueueSize();

  return {
    healthy: cliStatus.installed || (serviceConfig.useApiFallback && anthropicClient !== null),
    cli: cliStatus,
    apiFallbackAvailable: serviceConfig.useApiFallback && anthropicClient !== null,
    activeProcesses,
    queueSize,
    maxConcurrentProcesses: serviceConfig.maxConcurrentProcesses,
  };
}

/**
 * Starts the queue worker
 */
function startQueueWorker(): void {
  // Don't start if queueing is disabled
  if (!serviceConfig.enableQueue) {
    logger.debug('Queue worker not started: queueing is disabled');
    return;
  }

  if (queueWorkerRunning) {
    return;
  }

  queueWorkerRunning = true;
  queueWorkerInterval = setInterval(() => {
    void processQueue();
  }, 1000);

  logger.info('Queue worker started');
}

/**
 * Stops the queue worker
 */
export function stopQueueWorker(): void {
  if (queueWorkerInterval) {
    clearInterval(queueWorkerInterval);
    queueWorkerInterval = null;
  }
  queueWorkerRunning = false;

  logger.info('Queue worker stopped');
}

/**
 * Processes the queue
 */
async function processQueue(): Promise<void> {
  if (!serviceConfig.enableQueue) {
    return;
  }

  try {
    const activeCount = await getActiveProcessCount();

    // Check if we have capacity (including in-flight API executions)
    const totalActive = activeCount + inFlightApiExecutions;
    if (totalActive >= serviceConfig.maxConcurrentProcesses) {
      return;
    }

    // Dequeue next item
    const item = await dequeueProcess();
    if (!item) {
      return;
    }

    // Get the process config
    const state = await getProcessState(item.processId);
    if (!state?.config) {
      logger.warn({ processId: item.processId }, 'Dequeued process has no config');
      return;
    }

    // Check rate limit before executing dequeued process
    // This ensures queued jobs cannot bypass the per-user rate limit
    const rateLimitResult = await checkRateLimit(item.userId);
    if (!rateLimitResult.allowed) {
      logger.warn(
        { processId: item.processId, userId: item.userId },
        'Rate limit exceeded for dequeued process'
      );

      const completedAt = new Date().toISOString();
      const rateLimitError =
        'Rate limit exceeded. Process was queued but could not be executed due to rate limiting.';

      // Mark the process as failed with rate limit error
      await updateProcessState(item.processId, {
        status: 'failed',
        error: rateLimitError,
        completedAt,
      });

      // Emit error event so stream listeners and status polling observe the failure
      emitApiProcessEvent({
        processId: item.processId,
        userId: item.userId,
        type: 'error',
        error: rateLimitError,
        timestamp: completedAt,
      });

      // Record metrics for the rate-limited process
      recordProcessMetrics({
        processId: item.processId,
        userId: item.userId,
        durationMs: 0,
        inputSize: state.config.prompt?.length ?? 0,
        outputSize: 0,
        success: false,
        timestamp: completedAt,
      });

      return;
    }

    // Execute the process
    logger.info({ processId: item.processId }, 'Processing queued item');

    // Check CLI availability before executing
    const cliStatus = validateClaudeInstallation();
    const startTime = Date.now();

    if (!cliStatus.installed) {
      // CLI not available, check if API fallback is available
      if (serviceConfig.useApiFallback && anthropicClient) {
        logger.info(
          { processId: item.processId },
          'CLI not available for queued item, using API fallback'
        );

        // Execute via API fallback in background (don't await) - track in-flight execution
        inFlightApiExecutions++;
        executeViaApi(state.config, item.processId, startTime)
          .then((result) => {
            logger.info(
              { processId: item.processId, status: result.status },
              'Queued process completed via API fallback'
            );
          })
          .catch((error: unknown) => {
            logger.error(
              {
                processId: item.processId,
                error: error instanceof Error ? error.message : 'Unknown error',
              },
              'Queued process failed via API fallback'
            );
          })
          .finally(() => {
            inFlightApiExecutions--;
          });
      } else {
        // No CLI and no API fallback available - update process state with failure
        logger.error(
          { processId: item.processId },
          'CLI not available and no API fallback configured for queued item'
        );

        const completedAt = new Date().toISOString();
        const noFallbackError =
          cliStatus.error ?? 'Claude CLI not available and no API fallback configured';

        await updateProcessState(item.processId, {
          status: 'failed',
          error: noFallbackError,
          completedAt,
        });

        // Emit error event so stream listeners and status polling observe the failure
        emitApiProcessEvent({
          processId: item.processId,
          userId: item.userId,
          type: 'error',
          error: noFallbackError,
          timestamp: completedAt,
        });
      }
    } else {
      // CLI is available, execute via CLI in background (don't await)
      executeViaCli(state.config, item.processId, startTime)
        .then((result) => {
          logger.info(
            { processId: item.processId, status: result.status },
            'Queued process completed'
          );
        })
        .catch((error) => {
          logger.error(
            { processId: item.processId, error: error.message },
            'Queued process failed'
          );
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Queue processing error');
  }
}

/**
 * Gets the service configuration
 */
export function getServiceConfig(): ClaudeServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<ClaudeServiceConfig>): void {
  const previousEnableQueue = serviceConfig.enableQueue;
  serviceConfig = { ...serviceConfig, ...config };

  // Reinitialize Anthropic client if API key changed
  if (config.apiKey !== undefined || config.useApiFallback !== undefined) {
    if (serviceConfig.apiKey && serviceConfig.useApiFallback) {
      anthropicClient = new Anthropic({
        apiKey: serviceConfig.apiKey,
      });
    } else {
      anthropicClient = null;
    }
  }

  // Handle queue worker state changes when enableQueue is toggled
  if (config.enableQueue !== undefined && config.enableQueue !== previousEnableQueue) {
    if (serviceConfig.enableQueue) {
      // Queue was enabled, start the worker
      startQueueWorker();
    } else {
      // Queue was disabled, stop the worker
      stopQueueWorker();
    }
  }

  logger.info('Claude service configuration updated');
}

/**
 * Clears the installation status cache.
 * Primarily used for testing to ensure clean state between test runs.
 */
export function clearInstallationCache(): void {
  installationStatusCache = null;
}

export default {
  initializeClaudeService,
  validateClaudeInstallation,
  isClaudeAvailable,
  executeClaudeCommand,
  enqueueClaudeCommand,
  streamClaudeResponse,
  unsubscribeQueuedStream,
  cancelClaudeProcess,
  getClaudeProcessStatus,
  getClaudeServiceHealth,
  subscribeToStream,
  parseClaudeOutput,
  stopQueueWorker,
  getServiceConfig,
  updateServiceConfig,
  clearInstallationCache,
};
