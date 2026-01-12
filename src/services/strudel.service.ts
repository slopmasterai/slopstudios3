/**
 * Strudel Service
 * Pattern validation and audio rendering for Strudel live coding integration
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as acorn from 'acorn';

// Web Audio API types for Node.js
type OscillatorType = 'sine' | 'square' | 'sawtooth' | 'triangle';
type BiquadFilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'notch'
  | 'allpass';

// Lazy-loaded modules for ESM compatibility with Jest
let NodeOfflineAudioContext: any = null;
let evaluate: ((code: string) => Promise<any>) | null = null;
let strudelCore: any = null;

/**
 * Lazily loads the Strudel and web-audio-engine modules
 * This is needed for Jest compatibility since these are ESM-only modules
 */
async function loadStrudelModules(): Promise<boolean> {
  if (evaluate !== null && strudelCore !== null && NodeOfflineAudioContext !== null) {
    return true;
  }

  try {
    // Dynamically import ESM modules
    const webAudioEngine = await import('web-audio-engine');
    NodeOfflineAudioContext = webAudioEngine.OfflineAudioContext;

    const transpilerModule = await import('@strudel/transpiler');
    evaluate = transpilerModule.evaluate;

    strudelCore = await import('@strudel/core');

    // Import mini notation support
    const miniModule = await import('@strudel/mini');

    // Register all Strudel functions on globalThis for evaluate() to find them
    // This is required because evaluate() transpiles code that references these functions
    Object.assign(globalThis, strudelCore);
    Object.assign(globalThis, miniModule);

    return true;
  } catch (error) {
    logger.warn({ error }, 'Failed to load Strudel modules');
    return false;
  }
}

import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import { getRedisClient, isRedisConnected } from './redis.service.js';
import { getSampleBuffer, hasSample, initSampleCache } from './sample-cache.service.js';
import { recordStrudelMetrics } from './strudel-metrics.service.js';

import type {
  StrudelValidationResult,
  StrudelValidationError,
  StrudelValidationWarning,
  StrudelProcessConfig,
  StrudelProcessResult,
  StrudelProcessStatus,
  StrudelRenderOptions,
  StrudelHealthResponse,
  StrudelRedisState,
  StrudelAudioFormat,
  StrudelProgressPayload,
  StrudelQueuedPayload,
} from '../types/strudel.types.js';

// Redis key prefixes
const STRUDEL_PREFIX = 'strudel:process:';
const STRUDEL_QUEUE_KEY = 'strudel:queue';
const STRUDEL_ACTIVE_KEY = 'strudel:active';
const STRUDEL_VALIDATION_CACHE_PREFIX = 'strudel:validation:';
const PROCESS_TTL_SECONDS = 86400; // 24 hours
const VALIDATION_CACHE_TTL_SECONDS = 300; // 5 minutes

// Rate limit tracking
const RATE_LIMIT_PREFIX = 'strudel:ratelimit:';
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const DEFAULT_VALIDATION_RATE_LIMIT = 30; // 30 validations per minute
const DEFAULT_EXECUTION_RATE_LIMIT = 10; // 10 executions per minute

// Default service configuration
interface StrudelServiceConfig {
  maxConcurrentRenders: number;
  renderTimeoutMs: number;
  maxPatternLength: number;
  maxRenderDuration: number;
  defaultSampleRate: number;
  enableQueue: boolean;
  maxQueueSize: number;
  audioFormats: string[];
}

let serviceConfig: StrudelServiceConfig = {
  maxConcurrentRenders: parseInt(process.env['STRUDEL_MAX_CONCURRENT_RENDERS'] ?? '3', 10),
  renderTimeoutMs: parseInt(process.env['STRUDEL_RENDER_TIMEOUT_MS'] ?? '60000', 10),
  maxPatternLength: parseInt(process.env['STRUDEL_MAX_PATTERN_LENGTH'] ?? '100000', 10),
  maxRenderDuration: parseInt(process.env['STRUDEL_MAX_RENDER_DURATION'] ?? '300', 10),
  defaultSampleRate: parseInt(process.env['STRUDEL_DEFAULT_SAMPLE_RATE'] ?? '44100', 10),
  enableQueue: process.env['STRUDEL_ENABLE_QUEUE'] !== 'false',
  maxQueueSize: parseInt(process.env['STRUDEL_MAX_QUEUE_SIZE'] ?? '50', 10),
  audioFormats: ['wav'], // Only WAV is currently supported
};

// Service state
let serviceStartTime = Date.now();
let transpilerAvailable = false;
let transpilerVersion: string | undefined;

// In-memory tracking
const activeRenders = new Set<string>();
const inMemoryProcessStates = new Map<string, StrudelRedisState>();
const inMemoryQueue: Array<{
  processId: string;
  userId: string;
  priority: number;
  enqueuedAt: string;
}> = [];

// Queue worker state
let queueWorkerRunning = false;
let queueWorkerInterval: NodeJS.Timeout | null = null;

// Progress listeners
type ProgressListener = (payload: StrudelProgressPayload | StrudelQueuedPayload) => void;
const progressListeners = new Map<string, Set<ProgressListener>>();

/**
 * Initializes the Strudel service
 */
export async function initializeStrudelService(
  config?: Partial<StrudelServiceConfig>
): Promise<void> {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  serviceStartTime = Date.now();

  // Load Strudel modules dynamically
  const modulesLoaded = await loadStrudelModules();

  // Validate transpiler availability by checking the imported modules
  try {
    if (modulesLoaded && typeof evaluate === 'function') {
      transpilerAvailable = true;
      transpilerVersion = '1.2.5'; // Match the installed package version
      logger.info('Strudel transpiler available (@strudel/transpiler)');

      // Verify strudelCore is available
      if (strudelCore && typeof strudelCore.TimeSpan === 'function') {
        logger.info('Strudel core available (@strudel/core)');
      }

      // Verify web-audio-engine is available
      if (NodeOfflineAudioContext) {
        logger.info('Node.js OfflineAudioContext available (web-audio-engine)');
      }
    } else {
      throw new Error('Strudel modules not available');
    }
  } catch (error) {
    transpilerAvailable = false;
    logger.warn({ error }, 'Strudel transpiler not available');
  }

  // Initialize sample cache for real sample playback
  await initSampleCache();
  logger.info('Sample cache initialized');

  // Start queue worker if enabled
  if (serviceConfig.enableQueue) {
    startQueueWorker();
  }

  logger.info(
    {
      maxConcurrentRenders: serviceConfig.maxConcurrentRenders,
      renderTimeoutMs: serviceConfig.renderTimeoutMs,
      maxPatternLength: serviceConfig.maxPatternLength,
      maxRenderDuration: serviceConfig.maxRenderDuration,
      queueEnabled: serviceConfig.enableQueue,
    },
    'Strudel service initialized'
  );
}

/**
 * Shuts down the Strudel service gracefully
 */
export async function shutdownStrudelService(): Promise<void> {
  // Stop queue worker
  stopQueueWorker();

  // Cancel all active renders
  for (const processId of activeRenders) {
    await cancelStrudelProcess(processId);
  }

  logger.info('Strudel service shut down');
}

/**
 * Validates a Strudel pattern
 */
export async function validateStrudelPattern(code: string): Promise<StrudelValidationResult> {
  const startTime = Date.now();
  const errors: StrudelValidationError[] = [];
  const warnings: StrudelValidationWarning[] = [];

  // Check pattern length
  if (code.length > serviceConfig.maxPatternLength) {
    return {
      isValid: false,
      errors: [
        {
          message: `Pattern exceeds maximum length of ${serviceConfig.maxPatternLength} characters`,
          code: 'PATTERN_TOO_LONG',
        },
      ],
      warnings: [],
      validationTimeMs: Date.now() - startTime,
    };
  }

  // Check cache first
  const cacheKey = `${STRUDEL_VALIDATION_CACHE_PREFIX}${hashCode(code)}`;
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        const result = JSON.parse(cached) as StrudelValidationResult;
        result.validationTimeMs = Date.now() - startTime;
        return result;
      }
    } catch {
      // Cache miss, continue with validation
    }
  }

  let transpiledCode: string | undefined;

  try {
    // Step 1: Parse with acorn to check basic JavaScript syntax
    try {
      acorn.parse(code, {
        ecmaVersion: 2022,
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
      });
    } catch (parseError) {
      const err = parseError as { message?: string; loc?: { line?: number; column?: number } };
      errors.push({
        message: err.message ?? 'Syntax error',
        line: err.loc?.line,
        column: err.loc?.column,
        code: 'SYNTAX_ERROR',
        suggestion: 'Check for missing brackets, parentheses, or quotes',
      });
    }

    // Step 2: Strudel-specific pattern validation using the real transpiler
    if (errors.length === 0) {
      const strudelValidation = await validateStrudelSyntax(code);
      errors.push(...strudelValidation.errors);
      warnings.push(...strudelValidation.warnings);

      if (strudelValidation.transpiledCode) {
        transpiledCode = strudelValidation.transpiledCode;
      }
    }

    // Step 3: Check for common issues
    const commonIssues = checkCommonIssues(code);
    warnings.push(...commonIssues);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
    errors.push({
      message: errorMessage,
      code: 'VALIDATION_ERROR',
    });
  }

  const result: StrudelValidationResult = {
    isValid: errors.length === 0,
    errors,
    warnings,
    transpiledCode,
    validationTimeMs: Date.now() - startTime,
  };

  // Cache the result
  if (isRedisConnected() && errors.length === 0) {
    try {
      const redis = getRedisClient();
      await redis.setex(cacheKey, VALIDATION_CACHE_TTL_SECONDS, JSON.stringify(result));
    } catch {
      // Ignore cache errors
    }
  }

  return result;
}

/**
 * Validates Strudel-specific syntax patterns using the real Strudel transpiler
 */
async function validateStrudelSyntax(code: string): Promise<{
  errors: StrudelValidationError[];
  warnings: StrudelValidationWarning[];
  transpiledCode?: string;
  evaluatedPattern?: any;
}> {
  const errors: StrudelValidationError[] = [];
  const warnings: StrudelValidationWarning[] = [];

  // Check for Strudel function patterns
  const strudelPatterns = [
    'note',
    'sound',
    's',
    'n',
    'freq',
    'pan',
    'gain',
    'speed',
    'cut',
    'room',
    'size',
    'delay',
    'delaytime',
    'delayfeedback',
    'vowel',
    'lpf',
    'hpf',
    'bpf',
    'resonance',
    'attack',
    'decay',
    'sustain',
    'release',
    'fast',
    'slow',
    'rev',
    'jux',
    'stack',
    'cat',
    'seq',
    'struct',
    'euclid',
    'iter',
    'chunk',
    'every',
    'sometimes',
    'rarely',
    'often',
    'almostAlways',
    'almostNever',
    'scramble',
    'shuffle',
    'degrade',
    'degradeBy',
    'silence',
    'hush',
    'samples',
    'bank',
    'loopAt',
    'slice',
    'fit',
    'chop',
    'striate',
    'legato',
    'sustain',
    'begin',
    'end',
    'loop',
    'unit',
    'add',
    'sub',
    'mul',
    'div',
    'range',
    'rangex',
    'segment',
    'run',
    'scan',
    'press',
    'off',
    'superimpose',
    'layer',
    'mask',
    'inside',
    'outside',
    'within',
    'whenmod',
    'ply',
    'stut',
    'echo',
    'echoWith',
  ];

  // Check if code uses any Strudel patterns
  const usesStrudelPattern = strudelPatterns.some((pattern) => {
    const regex = new RegExp(`\\b${pattern}\\s*\\(`, 'g');
    return regex.test(code);
  });

  if (!usesStrudelPattern) {
    // Check for mini-notation patterns (quoted strings with pattern syntax)
    // eslint-disable-next-line no-useless-escape
    const miniNotationPattern = /["'`][a-z0-9\s\[\]<>*!?@~_,.|]+["'`]/i;
    const hasMiniNotation = miniNotationPattern.test(code);

    if (!hasMiniNotation) {
      warnings.push({
        message: 'Code does not appear to use Strudel patterns or mini-notation',
        code: 'NO_STRUDEL_PATTERNS',
      });
    }
  }

  // Check for potential infinite loops or heavy operations
  if (/while\s*\(\s*true\s*\)/.test(code) || /for\s*\(\s*;\s*;\s*\)/.test(code)) {
    errors.push({
      message: 'Potential infinite loop detected',
      code: 'INFINITE_LOOP',
      suggestion: 'Remove infinite loops from pattern code',
    });
  }

  // Skip further evaluation if we already have errors
  if (errors.length > 0) {
    return { errors, warnings };
  }

  // Ensure Strudel modules are loaded
  const modulesLoaded = await loadStrudelModules();
  if (!modulesLoaded || !evaluate) {
    errors.push({
      message: 'Strudel transpiler not available',
      code: 'TRANSPILER_UNAVAILABLE',
      suggestion: 'Check that @strudel/transpiler is properly installed',
    });
    return { errors, warnings };
  }

  // Use the real Strudel transpiler to transpile and evaluate the pattern
  let transpiledCode: string | undefined;
  let evaluatedPattern: any;

  try {
    // evaluate() from @strudel/transpiler transpiles the code and evaluates it
    // It returns the evaluated pattern
    evaluatedPattern = await evaluate(code);

    // Check if the result is a valid Pattern
    // Strudel patterns have a 'pattern' property (not '_Pattern')
    const isValidPattern =
      evaluatedPattern?.pattern !== undefined || evaluatedPattern?._Pattern !== undefined;

    if (!isValidPattern) {
      // It might be a function that needs to be called
      if (typeof evaluatedPattern === 'function') {
        evaluatedPattern = evaluatedPattern();
      }

      const isValidAfterCall =
        evaluatedPattern?.pattern !== undefined || evaluatedPattern?._Pattern !== undefined;
      if (!isValidAfterCall) {
        errors.push({
          message: 'Code did not evaluate to a valid Strudel pattern',
          code: 'NOT_A_PATTERN',
          suggestion: 'Ensure your code returns a pattern (e.g., s("bd sd"))',
        });
      }
    }

    // Store the transpiled code (we use the original since we evaluated directly)
    transpiledCode = code;
  } catch (evalError) {
    const errorMessage = evalError instanceof Error ? evalError.message : String(evalError);

    // Parse error location if available
    const locMatch = errorMessage.match(/at line (\d+), column (\d+)/i);
    const line = locMatch?.[1] ? parseInt(locMatch[1], 10) : undefined;
    const column = locMatch?.[2] ? parseInt(locMatch[2], 10) : undefined;

    errors.push({
      message: `Pattern evaluation failed: ${errorMessage}`,
      line,
      column,
      code: 'TRANSPILE_ERROR',
      suggestion: 'Check pattern syntax and ensure all functions are valid',
    });
  }

  return { errors, warnings, transpiledCode, evaluatedPattern };
}

/**
 * Checks for common issues in pattern code
 */
function checkCommonIssues(code: string): StrudelValidationWarning[] {
  const warnings: StrudelValidationWarning[] = [];

  // Check for very short patterns (might not produce meaningful output)
  if (code.trim().length < 10) {
    warnings.push({
      message: 'Pattern is very short and may not produce meaningful output',
      code: 'SHORT_PATTERN',
    });
  }

  // Check for unmatched brackets in mini-notation
  const brackets = { '[': ']', '<': '>', '{': '}', '(': ')' };
  const stack: string[] = [];
  let bracketMismatch = false;
  for (const char of code) {
    if (char in brackets) {
      stack.push(brackets[char as keyof typeof brackets]);
    } else if (Object.values(brackets).includes(char)) {
      if (stack.length === 0 || stack.pop() !== char) {
        bracketMismatch = true;
        break;
      }
    }
  }

  // Check for unclosed brackets (remaining items in stack) or mismatches
  if (bracketMismatch || stack.length > 0) {
    warnings.push({
      message: 'Potentially unmatched brackets in pattern',
      code: 'UNMATCHED_BRACKETS',
    });
  }

  // Check for deprecated patterns
  const deprecatedPatterns = [
    { pattern: /\bstut\b/, replacement: 'echo', message: 'stut is deprecated, use echo instead' },
  ];

  for (const { pattern, message } of deprecatedPatterns) {
    if (pattern.test(code)) {
      warnings.push({ message, code: 'DEPRECATED_PATTERN' });
    }
  }

  return warnings;
}

/**
 * Simple hash function for cache keys
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Checks rate limit for a user
 */
async function checkRateLimit(
  userId: string,
  type: 'validation' | 'execution'
): Promise<{ allowed: boolean; remaining: number }> {
  const limit =
    type === 'validation' ? DEFAULT_VALIDATION_RATE_LIMIT : DEFAULT_EXECUTION_RATE_LIMIT;

  if (!isRedisConnected()) {
    return { allowed: true, remaining: limit };
  }

  try {
    const redis = getRedisClient();
    const key = `${RATE_LIMIT_PREFIX}${type}:${userId}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }

    const remaining = Math.max(0, limit - count);
    return { allowed: count <= limit, remaining };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

/**
 * Gets process state from Redis or in-memory fallback
 */
export async function getStrudelProcessState(processId: string): Promise<StrudelRedisState | null> {
  const inMemoryState = inMemoryProcessStates.get(processId);

  if (!isRedisConnected()) {
    return inMemoryState || null;
  }

  try {
    const redis = getRedisClient();
    const data = await redis.get(`${STRUDEL_PREFIX}${processId}`);

    if (!data) {
      return inMemoryState || null;
    }

    return JSON.parse(data) as StrudelRedisState;
  } catch {
    return inMemoryState || null;
  }
}

/**
 * Updates process state
 */
export async function updateStrudelProcessState(
  processId: string,
  updates: Partial<StrudelRedisState>
): Promise<boolean> {
  // Update in-memory state
  const inMemoryState = inMemoryProcessStates.get(processId);
  if (inMemoryState) {
    const updated = { ...inMemoryState, ...updates };
    inMemoryProcessStates.set(processId, updated);
  }

  if (!isRedisConnected()) {
    if (updates.processId && updates.userId && updates.status && updates.code) {
      inMemoryProcessStates.set(processId, updates as StrudelRedisState);
      return true;
    }
    return inMemoryState !== undefined;
  }

  try {
    const redis = getRedisClient();
    const key = `${STRUDEL_PREFIX}${processId}`;
    const existingData = await redis.get(key);

    let state: StrudelRedisState;
    if (existingData) {
      state = { ...JSON.parse(existingData), ...updates };
    } else if (updates.processId && updates.userId && updates.status && updates.code) {
      state = updates as StrudelRedisState;
    } else {
      return false;
    }

    await redis.setex(key, PROCESS_TTL_SECONDS, JSON.stringify(state));
    return true;
  } catch {
    return inMemoryState !== undefined;
  }
}

/**
 * Executes a Strudel pattern with validation and rendering
 */
export async function executeStrudelPattern(
  config: StrudelProcessConfig
): Promise<StrudelProcessResult> {
  const startTime = Date.now();
  const processId = config.processId || generateRequestId().replace('req_', 'strudel_');

  logger.info({ processId, userId: config.userId }, 'Executing Strudel pattern');

  // Check rate limit
  const rateLimitResult = await checkRateLimit(config.userId, 'execution');
  if (!rateLimitResult.allowed) {
    logger.warn({ processId, userId: config.userId }, 'Rate limit exceeded');
    return createFailedResult(
      processId,
      config.userId,
      'Rate limit exceeded. Try again later.',
      startTime
    );
  }

  // Check pattern length
  if (config.code.length > serviceConfig.maxPatternLength) {
    return createFailedResult(
      processId,
      config.userId,
      `Pattern exceeds maximum length of ${serviceConfig.maxPatternLength} characters`,
      startTime
    );
  }

  // Validate pattern
  const validation = await validateStrudelPattern(config.code);
  if (!validation.isValid) {
    const errorMessage = validation.errors.map((e) => e.message).join('; ');
    return createFailedResult(processId, config.userId, errorMessage, startTime, validation);
  }

  // Check concurrency limit
  const activeCount = activeRenders.size;
  if (activeCount >= serviceConfig.maxConcurrentRenders) {
    if (serviceConfig.enableQueue) {
      return await enqueueStrudelPattern(config, processId);
    }
    return createFailedResult(
      processId,
      config.userId,
      'Maximum concurrent renders reached. Try again later.',
      startTime,
      validation
    );
  }

  // Execute the render
  return await renderStrudelPattern(config, processId, startTime, validation);
}

/**
 * Enqueues a pattern for later execution
 */
export async function enqueueStrudelPattern(
  config: StrudelProcessConfig,
  processId?: string
): Promise<StrudelProcessResult> {
  const id = processId || config.processId || generateRequestId().replace('req_', 'strudel_');
  const startTime = Date.now();

  const queueItem = {
    processId: id,
    userId: config.userId,
    priority: config.priority || 0,
    enqueuedAt: new Date().toISOString(),
  };

  // Check queue size
  const queueSize = await getStrudelQueueSize();
  if (queueSize >= serviceConfig.maxQueueSize) {
    return createFailedResult(id, config.userId, 'Queue is full. Try again later.', startTime);
  }

  // Calculate initial queue position (current queue size + 1)
  const initialQueuePosition = queueSize + 1;

  // Store process state with queue position
  const state: StrudelRedisState = {
    processId: id,
    userId: config.userId,
    status: 'queued',
    code: config.code,
    options: config.options,
    priority: config.priority || 0,
    requestId: config.requestId,
    socketId: config.socketId,
    queuePosition: initialQueuePosition,
    progress: 0,
    createdAt: new Date().toISOString(),
  };

  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const score = -queueItem.priority * 1e15 + Date.parse(queueItem.enqueuedAt);
      await redis.zadd(STRUDEL_QUEUE_KEY, score, JSON.stringify(queueItem));
      await redis.setex(`${STRUDEL_PREFIX}${id}`, PROCESS_TTL_SECONDS, JSON.stringify(state));
    } catch (error) {
      logger.error({ processId: id, error }, 'Failed to enqueue pattern');
      return createFailedResult(id, config.userId, 'Failed to enqueue pattern', startTime);
    }
  } else {
    inMemoryQueue.push(queueItem);
    inMemoryQueue.sort(
      (a, b) => b.priority - a.priority || Date.parse(a.enqueuedAt) - Date.parse(b.enqueuedAt)
    );
    inMemoryProcessStates.set(id, state);
  }

  // Recalculate actual position after sorting (for priority queues)
  const position = await getStrudelQueuePosition(id);

  // Update state with actual position if different (due to priority sorting)
  if (position !== null && position !== initialQueuePosition) {
    await updateStrudelProcessState(id, { queuePosition: position });
  }

  logger.info({ processId: id, position }, 'Pattern enqueued');

  // Emit queued event
  emitProgress(id, {
    processId: id,
    position: position || 1,
    queueLength: queueSize + 1,
  } as StrudelQueuedPayload);

  return {
    processId: id,
    success: true,
    status: 'queued',
    timing: {
      startedAt: new Date(startTime),
      completedAt: new Date(),
      validationTimeMs: 0,
      renderTimeMs: 0,
      totalTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Renders a Strudel pattern to audio
 */
async function renderStrudelPattern(
  config: StrudelProcessConfig,
  processId: string,
  startTime: number,
  validation: StrudelValidationResult
): Promise<StrudelProcessResult> {
  const duration = config.options?.duration ?? 10;
  const sampleRate = config.options?.sampleRate ?? serviceConfig.defaultSampleRate;
  const channels = config.options?.channels ?? 2;
  const format = config.options?.format ?? 'wav';
  const tempo = config.options?.tempo;

  const options: Required<
    Pick<StrudelRenderOptions, 'duration' | 'sampleRate' | 'channels' | 'format'>
  > &
    Pick<StrudelRenderOptions, 'tempo'> = {
    duration,
    sampleRate,
    channels,
    format,
    tempo,
  };

  // Validate render duration
  if (duration > serviceConfig.maxRenderDuration) {
    return createFailedResult(
      processId,
      config.userId,
      `Render duration exceeds maximum of ${serviceConfig.maxRenderDuration} seconds`,
      startTime,
      validation
    );
  }

  // Mark as rendering
  activeRenders.add(processId);

  const state: StrudelRedisState = {
    processId,
    userId: config.userId,
    status: 'rendering',
    code: config.code,
    options,
    priority: config.priority || 0,
    requestId: config.requestId,
    socketId: config.socketId,
    progress: 0,
    validation,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };

  await updateStrudelProcessState(processId, state);

  try {
    const renderStartTime = Date.now();

    // Emit validation success
    emitProgress(processId, {
      processId,
      status: 'validating',
      progress: 0,
      message: 'Pattern validated successfully',
    });

    // Ensure Strudel modules are loaded
    const modulesLoaded = await loadStrudelModules();
    if (!modulesLoaded || !evaluate) {
      throw new Error('Strudel transpiler not available');
    }

    // Evaluate the pattern using the Strudel transpiler
    let evaluatedPattern: any;
    try {
      evaluatedPattern = await evaluate(config.code);

      // Handle case where evaluation returns a function
      if (typeof evaluatedPattern === 'function') {
        evaluatedPattern = evaluatedPattern();
      }

      // Check for valid pattern - Strudel patterns have either .pattern or ._Pattern property
      const isValidPattern =
        evaluatedPattern?.pattern !== undefined || evaluatedPattern?._Pattern !== undefined;
      if (!isValidPattern) {
        throw new Error('Code did not evaluate to a valid Strudel pattern');
      }
    } catch (evalError) {
      const errorMessage = evalError instanceof Error ? evalError.message : String(evalError);
      throw new Error(`Pattern evaluation failed: ${errorMessage}`);
    }

    // Check if cancelled before rendering
    const currentState = await getStrudelProcessState(processId);
    if (currentState?.status === 'cancelled') {
      throw new Error('Render cancelled');
    }

    emitProgress(processId, {
      processId,
      status: 'rendering',
      progress: 10,
      message: 'Pattern evaluated, starting audio render...',
    });

    // Calculate CPS (cycles per second) from tempo if provided
    const cps = options.tempo ? options.tempo / 60 / 2 : 0.5; // Default is 0.5 CPS (120 BPM)

    // Render the pattern to audio using the real Strudel engine with timeout
    let audioBuffer: Float32Array;
    try {
      const renderPromise = renderPatternToAudio(
        evaluatedPattern,
        options.duration,
        options.sampleRate,
        options.channels,
        cps,
        (progress) => {
          // Map render progress from 0-100 to 10-90 for overall progress
          const overallProgress = 10 + Math.round(progress * 0.8);
          emitProgress(processId, {
            processId,
            status: 'rendering',
            progress: overallProgress,
            message: `Rendering audio: ${progress}%`,
          });
          void updateStrudelProcessState(processId, { progress: overallProgress });
        }
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('TIMEOUT_ERROR'));
        }, serviceConfig.renderTimeoutMs);
      });

      audioBuffer = await Promise.race([renderPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT_ERROR') {
        const completedAt = new Date();

        // Mark process state as failed with TIMEOUT_ERROR
        await updateStrudelProcessState(processId, {
          status: 'failed',
          error: {
            code: 'TIMEOUT_ERROR',
            message: `Render timed out after ${serviceConfig.renderTimeoutMs}ms`,
          },
          completedAt: completedAt.toISOString(),
        });

        // Record metrics for timeout failure
        recordStrudelMetrics({
          processId,
          userId: config.userId,
          type: 'render',
          durationMs: serviceConfig.renderTimeoutMs,
          audioLengthSeconds: 0,
          success: false,
          timestamp: completedAt.toISOString(),
        });

        // Emit progress/error event
        emitProgress(processId, {
          processId,
          status: 'failed',
          progress: 0,
          message: `Render timed out after ${serviceConfig.renderTimeoutMs}ms`,
        });

        // Remove from activeRenders and clean up listeners
        activeRenders.delete(processId);
        progressListeners.delete(processId);

        return createFailedResult(
          processId,
          config.userId,
          `Render timed out after ${serviceConfig.renderTimeoutMs}ms`,
          startTime,
          validation
        );
      }
      throw error;
    }

    // Export to WAV format (only supported format) with correct channel count
    let exportResult: { data: string; fileSize: number };
    try {
      const exportPromise = Promise.resolve(
        exportAudioBuffer(audioBuffer, 'wav', options.sampleRate, options.channels)
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('TIMEOUT_ERROR'));
        }, serviceConfig.renderTimeoutMs);
      });

      exportResult = await Promise.race([exportPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT_ERROR') {
        const completedAt = new Date();

        // Mark process state as failed with TIMEOUT_ERROR
        await updateStrudelProcessState(processId, {
          status: 'failed',
          error: {
            code: 'TIMEOUT_ERROR',
            message: `Audio export timed out after ${serviceConfig.renderTimeoutMs}ms`,
          },
          completedAt: completedAt.toISOString(),
        });

        // Record metrics for timeout failure
        recordStrudelMetrics({
          processId,
          userId: config.userId,
          type: 'render',
          durationMs: Date.now() - startTime,
          audioLengthSeconds: 0,
          success: false,
          timestamp: completedAt.toISOString(),
        });

        // Emit progress/error event
        emitProgress(processId, {
          processId,
          status: 'failed',
          progress: 0,
          message: `Audio export timed out after ${serviceConfig.renderTimeoutMs}ms`,
        });

        // Remove from activeRenders and clean up listeners
        activeRenders.delete(processId);
        progressListeners.delete(processId);

        return createFailedResult(
          processId,
          config.userId,
          `Audio export timed out after ${serviceConfig.renderTimeoutMs}ms`,
          startTime,
          validation
        );
      }
      throw error;
    }

    const { data: audioData, fileSize } = exportResult;

    // Always report actual format (WAV) in metadata, not requested format
    const actualFormat = 'wav' as const;

    const renderTimeMs = Date.now() - renderStartTime;
    const completedAt = new Date();

    // Update final state with result for async/queued retrieval
    // Include the audio data (base64) so async consumers can retrieve it
    await updateStrudelProcessState(processId, {
      status: 'complete',
      progress: 100,
      completedAt: completedAt.toISOString(),
      result: {
        audioData,
        audioMetadata: {
          duration: options.duration,
          sampleRate: options.sampleRate,
          channels: options.channels,
          format: actualFormat,
          fileSize,
        },
        timing: {
          startedAt: new Date(startTime).toISOString(),
          completedAt: completedAt.toISOString(),
          validationTimeMs: validation.validationTimeMs,
          renderTimeMs,
          totalTimeMs: Date.now() - startTime,
        },
      },
    });

    // Record metrics
    recordStrudelMetrics({
      processId,
      userId: config.userId,
      type: 'render',
      durationMs: renderTimeMs,
      audioLengthSeconds: options.duration,
      success: true,
      timestamp: completedAt.toISOString(),
    });

    // Emit completion
    emitProgress(processId, {
      processId,
      status: 'complete',
      progress: 100,
      message: 'Render complete',
    });

    return {
      processId,
      success: true,
      status: 'complete',
      validation,
      audioBuffer: Array.from(audioBuffer),
      audioData,
      audioMetadata: {
        duration: options.duration,
        sampleRate: options.sampleRate,
        channels: options.channels,
        format: actualFormat,
        fileSize,
      },
      timing: {
        startedAt: new Date(startTime),
        completedAt,
        validationTimeMs: validation.validationTimeMs,
        renderTimeMs,
        totalTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown render error';
    const completedAt = new Date();

    await updateStrudelProcessState(processId, {
      status: 'failed',
      error: { code: 'RENDER_ERROR', message: errorMessage },
      completedAt: completedAt.toISOString(),
    });

    // Record metrics
    recordStrudelMetrics({
      processId,
      userId: config.userId,
      type: 'render',
      durationMs: Date.now() - startTime,
      audioLengthSeconds: 0,
      success: false,
      timestamp: completedAt.toISOString(),
    });

    emitProgress(processId, {
      processId,
      status: 'failed',
      progress: 0,
      message: errorMessage,
    });

    return createFailedResult(processId, config.userId, errorMessage, startTime, validation);
  } finally {
    activeRenders.delete(processId);
  }
}

/**
 * Hap interface for Strudel pattern events
 */
interface StrudelHap {
  whole: { begin: { valueOf: () => number }; end: { valueOf: () => number } };
  part: { begin: { valueOf: () => number }; end: { valueOf: () => number } };
  value: any;
  hasOnset: () => boolean;
}

/**
 * Converts MIDI note to frequency
 */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Parses note name to MIDI number
 */
function noteToMidi(note: string): number {
  const noteMap: Record<string, number> = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11,
  };

  const match = note.toLowerCase().match(/^([a-g])([#bs]*)(-?[0-9]*)$/);
  if (!match) return 60; // Default to C4

  const [, noteName, accidentals, octaveStr] = match;
  const octave = octaveStr ? parseInt(octaveStr, 10) : 4;

  let midi = noteName ? (noteMap[noteName] ?? 0) : 0;

  // Handle accidentals
  for (const acc of accidentals ?? '') {
    if (acc === '#' || acc === 's') midi++;
    else if (acc === 'b') midi--;
  }

  return (octave + 1) * 12 + midi;
}

/**
 * Gets frequency from a hap value
 */
function getFrequencyFromHap(value: any): number {
  // Direct frequency
  if (typeof value === 'number') {
    return value > 20 ? value : midiToFreq(value);
  }

  if (typeof value === 'object' && value !== null) {
    // freq property
    if (typeof value.freq === 'number') {
      return value.freq;
    }

    // note property (string or number)
    if (value.note !== undefined) {
      if (typeof value.note === 'string') {
        return midiToFreq(noteToMidi(value.note));
      }
      if (typeof value.note === 'number') {
        return midiToFreq(value.note);
      }
    }

    // n property (common in Strudel for note number)
    if (typeof value.n === 'number') {
      return midiToFreq(value.n);
    }
  }

  if (typeof value === 'string') {
    // Try to parse as note name
    return midiToFreq(noteToMidi(value));
  }

  // Default to A440
  return 440;
}

/**
 * Gets gain/velocity from a hap value
 */
function getGainFromHap(value: any): number {
  if (typeof value === 'object' && value !== null) {
    if (typeof value.gain === 'number') return value.gain;
    if (typeof value.amp === 'number') return value.amp;
    if (typeof value.velocity === 'number') return value.velocity / 127;
  }
  return 0.5; // Default gain
}

/**
 * Gets pan value from a hap (-1 to 1)
 */
function getPanFromHap(value: any): number {
  if (typeof value === 'object' && value !== null) {
    if (typeof value.pan === 'number') return value.pan * 2 - 1; // Strudel uses 0-1
  }
  return 0; // Center
}

/**
 * Renders a single synthesized note to the audio context
 */
function renderSynthNote(
  offlineCtx: any,
  destinationL: any,
  destinationR: any,
  frequency: number,
  startTime: number,
  duration: number,
  gain: number,
  pan: number,
  waveform: OscillatorType = 'sine',
  attack: number = 0.01,
  decay: number = 0.1,
  sustain: number = 0.7,
  release: number = 0.1
): void {
  const osc = offlineCtx.createOscillator();
  const gainNode = offlineCtx.createGain();

  osc.type = waveform;
  osc.frequency.setValueAtTime(frequency, startTime);

  // ADSR envelope
  const attackEnd = startTime + attack;
  const decayEnd = attackEnd + decay;
  const sustainEnd = startTime + duration - release;
  const releaseEnd = startTime + duration;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, Math.min(attackEnd, releaseEnd));

  if (decayEnd < sustainEnd) {
    gainNode.gain.linearRampToValueAtTime(gain * sustain, decayEnd);
    gainNode.gain.setValueAtTime(gain * sustain, sustainEnd);
  }

  gainNode.gain.linearRampToValueAtTime(0, releaseEnd);

  // Apply panning - mix to left/right based on pan value
  const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);

  const leftPan = offlineCtx.createGain();
  const rightPan = offlineCtx.createGain();
  leftPan.gain.value = leftGain;
  rightPan.gain.value = rightGain;

  osc.connect(gainNode);
  gainNode.connect(leftPan);
  gainNode.connect(rightPan);
  leftPan.connect(destinationL);
  rightPan.connect(destinationR);

  osc.start(startTime);
  osc.stop(releaseEnd + 0.01);
}

/**
 * Sound synthesis parameters for different sound types
 */
interface SoundParams {
  freq: number;
  freqDecay: number;
  freqEnd?: number;
  noise: boolean;
  noiseGain: number;
  noiseFilterFreq?: number;
  duration: number;
  waveform: OscillatorType;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  detune?: number;
  filterFreq?: number;
  filterQ?: number;
  filterType?: BiquadFilterType;
  harmonics?: number[];
}

/**
 * Comprehensive sound library covering Strudel/Dirt-Samples sounds
 */
const soundLibrary: Record<string, SoundParams> = {
  // ============ STANDARD DRUMS ============
  // Bass drums
  bd: { freq: 150, freqDecay: 0.05, noise: false, noiseGain: 0, duration: 0.3, waveform: 'sine' },
  kick: { freq: 150, freqDecay: 0.05, noise: false, noiseGain: 0, duration: 0.3, waveform: 'sine' },
  clubkick: {
    freq: 55,
    freqDecay: 0.08,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'sine',
  },
  hardkick: {
    freq: 180,
    freqDecay: 0.03,
    noise: true,
    noiseGain: 0.15,
    duration: 0.25,
    waveform: 'sine',
  },
  popkick: {
    freq: 100,
    freqDecay: 0.04,
    noise: false,
    noiseGain: 0,
    duration: 0.2,
    waveform: 'sine',
  },
  kicklinn: {
    freq: 120,
    freqDecay: 0.06,
    noise: false,
    noiseGain: 0,
    duration: 0.35,
    waveform: 'sine',
  },

  // Snare drums
  sd: {
    freq: 200,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.5,
    duration: 0.2,
    waveform: 'triangle',
  },
  sn: {
    freq: 200,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.5,
    duration: 0.2,
    waveform: 'triangle',
  },
  snare: {
    freq: 200,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.5,
    duration: 0.2,
    waveform: 'triangle',
  },

  // Hi-hats
  hh: {
    freq: 8000,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.85,
    duration: 0.08,
    waveform: 'square',
    noiseFilterFreq: 7000,
  },
  hihat: {
    freq: 8000,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.85,
    duration: 0.08,
    waveform: 'square',
    noiseFilterFreq: 7000,
  },
  hh27: {
    freq: 9000,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.9,
    duration: 0.06,
    waveform: 'square',
    noiseFilterFreq: 8000,
  },
  oh: {
    freq: 8000,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.85,
    duration: 0.35,
    waveform: 'square',
    noiseFilterFreq: 6000,
  },
  linnhats: {
    freq: 10000,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.9,
    duration: 0.1,
    waveform: 'square',
    noiseFilterFreq: 9000,
  },

  // Hand claps
  cp: {
    freq: 1200,
    freqDecay: 0.008,
    noise: true,
    noiseGain: 0.92,
    duration: 0.12,
    waveform: 'square',
    noiseFilterFreq: 1500,
  },
  clap: {
    freq: 1200,
    freqDecay: 0.008,
    noise: true,
    noiseGain: 0.92,
    duration: 0.12,
    waveform: 'square',
    noiseFilterFreq: 1500,
  },
  realclaps: {
    freq: 1000,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.95,
    duration: 0.15,
    waveform: 'square',
    noiseFilterFreq: 1200,
  },

  // Toms
  lt: { freq: 80, freqDecay: 0.1, noise: false, noiseGain: 0, duration: 0.3, waveform: 'sine' },
  mt: { freq: 120, freqDecay: 0.08, noise: false, noiseGain: 0, duration: 0.25, waveform: 'sine' },
  ht: { freq: 180, freqDecay: 0.06, noise: false, noiseGain: 0, duration: 0.2, waveform: 'sine' },
  tom: { freq: 120, freqDecay: 0.08, noise: false, noiseGain: 0, duration: 0.25, waveform: 'sine' },

  // Cymbals
  rd: {
    freq: 5000,
    freqDecay: 0.002,
    noise: true,
    noiseGain: 0.75,
    duration: 0.6,
    waveform: 'triangle',
    noiseFilterFreq: 4000,
  },
  ride: {
    freq: 5000,
    freqDecay: 0.002,
    noise: true,
    noiseGain: 0.75,
    duration: 0.6,
    waveform: 'triangle',
    noiseFilterFreq: 4000,
  },
  cr: {
    freq: 4000,
    freqDecay: 0.003,
    noise: true,
    noiseGain: 0.85,
    duration: 1.0,
    waveform: 'triangle',
    noiseFilterFreq: 3500,
  },
  crash: {
    freq: 4000,
    freqDecay: 0.003,
    noise: true,
    noiseGain: 0.85,
    duration: 1.0,
    waveform: 'triangle',
    noiseFilterFreq: 3500,
  },

  // Rim and sidestick
  rim: {
    freq: 900,
    freqDecay: 0.003,
    noise: true,
    noiseGain: 0.35,
    duration: 0.04,
    waveform: 'square',
  },
  rs: {
    freq: 900,
    freqDecay: 0.003,
    noise: true,
    noiseGain: 0.35,
    duration: 0.04,
    waveform: 'square',
  },

  // Cowbell
  cb: {
    freq: 560,
    freqDecay: 0.015,
    noise: false,
    noiseGain: 0,
    duration: 0.2,
    waveform: 'square',
  },
  cowbell: {
    freq: 560,
    freqDecay: 0.015,
    noise: false,
    noiseGain: 0,
    duration: 0.2,
    waveform: 'square',
  },

  // ============ 808 DRUM MACHINE ============
  '808': { freq: 60, freqDecay: 0.15, noise: false, noiseGain: 0, duration: 0.6, waveform: 'sine' },
  '808bd': {
    freq: 55,
    freqDecay: 0.12,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'sine',
  },
  '808sd': {
    freq: 180,
    freqDecay: 0.025,
    noise: true,
    noiseGain: 0.6,
    duration: 0.18,
    waveform: 'triangle',
  },
  '808hc': {
    freq: 9500,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.9,
    duration: 0.05,
    waveform: 'square',
    noiseFilterFreq: 9000,
  },
  '808oh': {
    freq: 8500,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.88,
    duration: 0.4,
    waveform: 'square',
    noiseFilterFreq: 7500,
  },
  '808cy': {
    freq: 4500,
    freqDecay: 0.004,
    noise: true,
    noiseGain: 0.82,
    duration: 1.2,
    waveform: 'triangle',
    noiseFilterFreq: 4000,
  },
  '808lt': {
    freq: 70,
    freqDecay: 0.12,
    noise: false,
    noiseGain: 0,
    duration: 0.35,
    waveform: 'sine',
  },
  '808mt': {
    freq: 100,
    freqDecay: 0.1,
    noise: false,
    noiseGain: 0,
    duration: 0.3,
    waveform: 'sine',
  },
  '808ht': {
    freq: 150,
    freqDecay: 0.08,
    noise: false,
    noiseGain: 0,
    duration: 0.25,
    waveform: 'sine',
  },
  '808lc': {
    freq: 200,
    freqDecay: 0.005,
    noise: true,
    noiseGain: 0.4,
    duration: 0.08,
    waveform: 'triangle',
  },
  '808mc': {
    freq: 280,
    freqDecay: 0.005,
    noise: true,
    noiseGain: 0.4,
    duration: 0.07,
    waveform: 'triangle',
  },

  // ============ 909 DRUM MACHINE ============
  '909': {
    freq: 70,
    freqDecay: 0.08,
    noise: true,
    noiseGain: 0.1,
    duration: 0.4,
    waveform: 'sine',
  },

  // ============ OTHER DRUM MACHINES ============
  electro1: {
    freq: 60,
    freqDecay: 0.1,
    noise: false,
    noiseGain: 0,
    duration: 0.4,
    waveform: 'sine',
  },
  drumtraks: {
    freq: 80,
    freqDecay: 0.07,
    noise: true,
    noiseGain: 0.2,
    duration: 0.25,
    waveform: 'sine',
  },
  dr55: {
    freq: 90,
    freqDecay: 0.06,
    noise: true,
    noiseGain: 0.15,
    duration: 0.2,
    waveform: 'sine',
  },
  dr: { freq: 100, freqDecay: 0.05, noise: true, noiseGain: 0.2, duration: 0.2, waveform: 'sine' },
  dr2: {
    freq: 110,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.25,
    duration: 0.22,
    waveform: 'sine',
  },
  drum: {
    freq: 120,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.2,
    duration: 0.2,
    waveform: 'sine',
  },
  gretsch: {
    freq: 130,
    freqDecay: 0.06,
    noise: true,
    noiseGain: 0.3,
    duration: 0.25,
    waveform: 'sine',
  },

  // ============ PERCUSSION ============
  perc: {
    freq: 500,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.4,
    duration: 0.1,
    waveform: 'triangle',
  },
  click: {
    freq: 1500,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.5,
    duration: 0.02,
    waveform: 'square',
  },
  clak: {
    freq: 2000,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.6,
    duration: 0.03,
    waveform: 'square',
  },
  tink: {
    freq: 3000,
    freqDecay: 0.005,
    noise: false,
    noiseGain: 0,
    duration: 0.08,
    waveform: 'sine',
  },
  tok: {
    freq: 800,
    freqDecay: 0.003,
    noise: true,
    noiseGain: 0.3,
    duration: 0.05,
    waveform: 'square',
  },
  can: {
    freq: 600,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.5,
    duration: 0.15,
    waveform: 'triangle',
  },
  bottle: {
    freq: 800,
    freqDecay: 0.02,
    noise: false,
    noiseGain: 0,
    duration: 0.3,
    waveform: 'sine',
  },
  metal: {
    freq: 2500,
    freqDecay: 0.005,
    noise: true,
    noiseGain: 0.7,
    duration: 0.4,
    waveform: 'square',
  },
  coins: {
    freq: 4000,
    freqDecay: 0.003,
    noise: true,
    noiseGain: 0.6,
    duration: 0.08,
    waveform: 'triangle',
  },
  glasstap: {
    freq: 2000,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.15,
    waveform: 'sine',
  },
  lighter: {
    freq: 3500,
    freqDecay: 0.002,
    noise: true,
    noiseGain: 0.4,
    duration: 0.05,
    waveform: 'square',
  },
  stomp: {
    freq: 80,
    freqDecay: 0.08,
    noise: true,
    noiseGain: 0.3,
    duration: 0.2,
    waveform: 'sine',
  },
  hand: {
    freq: 500,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.7,
    duration: 0.08,
    waveform: 'triangle',
  },

  // Shakers and tambourine
  sh: {
    freq: 7000,
    freqDecay: 0.001,
    noise: true,
    noiseGain: 0.95,
    duration: 0.1,
    waveform: 'square',
    noiseFilterFreq: 6000,
  },
  tb: {
    freq: 5000,
    freqDecay: 0.002,
    noise: true,
    noiseGain: 0.85,
    duration: 0.15,
    waveform: 'square',
    noiseFilterFreq: 4500,
  },

  // ============ BASS SOUNDS ============
  bass: {
    freq: 80,
    freqDecay: 0.3,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'sawtooth',
    attack: 0.01,
    decay: 0.1,
    sustain: 0.7,
    release: 0.15,
  },
  bass0: {
    freq: 60,
    freqDecay: 0.4,
    noise: false,
    noiseGain: 0,
    duration: 0.6,
    waveform: 'sine',
    attack: 0.005,
    decay: 0.15,
    sustain: 0.8,
    release: 0.2,
  },
  bass1: {
    freq: 70,
    freqDecay: 0.35,
    noise: false,
    noiseGain: 0,
    duration: 0.55,
    waveform: 'sawtooth',
    attack: 0.01,
    decay: 0.12,
    sustain: 0.75,
    release: 0.18,
  },
  bass2: {
    freq: 75,
    freqDecay: 0.32,
    noise: false,
    noiseGain: 0,
    duration: 0.52,
    waveform: 'square',
    attack: 0.008,
    decay: 0.1,
    sustain: 0.7,
    release: 0.15,
  },
  bass3: {
    freq: 65,
    freqDecay: 0.38,
    noise: false,
    noiseGain: 0,
    duration: 0.58,
    waveform: 'triangle',
    attack: 0.01,
    decay: 0.14,
    sustain: 0.78,
    release: 0.2,
  },
  bassdm: { freq: 55, freqDecay: 0.1, noise: false, noiseGain: 0, duration: 0.4, waveform: 'sine' },
  bassfoo: {
    freq: 50,
    freqDecay: 0.15,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'sine',
  },
  jungbass: {
    freq: 45,
    freqDecay: 0.2,
    noise: false,
    noiseGain: 0,
    duration: 0.6,
    waveform: 'sine',
  },
  jvbass: {
    freq: 55,
    freqDecay: 0.18,
    noise: false,
    noiseGain: 0,
    duration: 0.55,
    waveform: 'sawtooth',
    filterFreq: 800,
    filterQ: 2,
  },
  subroc3d: {
    freq: 40,
    freqDecay: 0.25,
    noise: false,
    noiseGain: 0,
    duration: 0.7,
    waveform: 'sine',
  },

  // ============ SYNTH SOUNDS ============
  // Plucks
  pluck: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.4,
    waveform: 'triangle',
    attack: 0.001,
    decay: 0.1,
    sustain: 0.3,
    release: 0.2,
  },
  arpy: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.25,
    waveform: 'sawtooth',
    attack: 0.001,
    decay: 0.08,
    sustain: 0.2,
    release: 0.15,
  },
  arp: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.2,
    waveform: 'square',
    attack: 0.001,
    decay: 0.06,
    sustain: 0.25,
    release: 0.1,
  },

  // Bleeps and blips
  bleep: {
    freq: 880,
    freqDecay: 0.02,
    noise: false,
    noiseGain: 0,
    duration: 0.15,
    waveform: 'sine',
    attack: 0.001,
    decay: 0.05,
    sustain: 0.5,
    release: 0.08,
  },
  blip: {
    freq: 660,
    freqDecay: 0.015,
    noise: false,
    noiseGain: 0,
    duration: 0.1,
    waveform: 'sine',
    attack: 0.001,
    decay: 0.03,
    sustain: 0.4,
    release: 0.05,
  },

  // Pads
  pad: {
    freq: 220,
    freqDecay: 0.5,
    noise: false,
    noiseGain: 0,
    duration: 2.0,
    waveform: 'sawtooth',
    attack: 0.3,
    decay: 0.2,
    sustain: 0.8,
    release: 0.5,
    filterFreq: 2000,
    filterQ: 1,
  },
  padlong: {
    freq: 220,
    freqDecay: 0.5,
    noise: false,
    noiseGain: 0,
    duration: 4.0,
    waveform: 'sawtooth',
    attack: 0.5,
    decay: 0.3,
    sustain: 0.85,
    release: 0.8,
    filterFreq: 1500,
    filterQ: 1,
  },

  // Stabs
  stab: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.15,
    waveform: 'sawtooth',
    attack: 0.001,
    decay: 0.05,
    sustain: 0.3,
    release: 0.08,
  },

  // FM-style sounds
  fm: {
    freq: 440,
    freqDecay: 0.02,
    noise: false,
    noiseGain: 0,
    duration: 0.3,
    waveform: 'sine',
    attack: 0.001,
    decay: 0.1,
    sustain: 0.4,
    release: 0.15,
  },

  // Classic synths
  moog: {
    freq: 220,
    freqDecay: 0.1,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'sawtooth',
    attack: 0.01,
    decay: 0.15,
    sustain: 0.6,
    release: 0.2,
    filterFreq: 1000,
    filterQ: 3,
  },
  juno: {
    freq: 220,
    freqDecay: 0.1,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'sawtooth',
    attack: 0.02,
    decay: 0.12,
    sustain: 0.65,
    release: 0.18,
    filterFreq: 1200,
    filterQ: 2,
  },
  hoover: {
    freq: 150,
    freqDecay: 0.15,
    noise: false,
    noiseGain: 0,
    duration: 0.6,
    waveform: 'sawtooth',
    attack: 0.01,
    decay: 0.2,
    sustain: 0.5,
    release: 0.25,
    detune: 15,
  },

  // Notes/keys
  notes: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'triangle',
    attack: 0.01,
    decay: 0.1,
    sustain: 0.6,
    release: 0.2,
  },
  newnotes: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.4,
    waveform: 'sine',
    attack: 0.005,
    decay: 0.08,
    sustain: 0.55,
    release: 0.15,
  },
  feel: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.6,
    waveform: 'sine',
    attack: 0.02,
    decay: 0.15,
    sustain: 0.7,
    release: 0.25,
  },
  casio: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.35,
    waveform: 'square',
    attack: 0.001,
    decay: 0.05,
    sustain: 0.4,
    release: 0.1,
  },

  // ============ INSTRUMENTS ============
  // Piano-like
  piano: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 1.0,
    waveform: 'triangle',
    attack: 0.001,
    decay: 0.3,
    sustain: 0.4,
    release: 0.3,
  },

  // Guitar-like
  gtr: {
    freq: 220,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.8,
    waveform: 'sawtooth',
    attack: 0.001,
    decay: 0.2,
    sustain: 0.3,
    release: 0.25,
  },

  // Sitar
  sitar: {
    freq: 220,
    freqDecay: 0.02,
    noise: false,
    noiseGain: 0,
    duration: 1.2,
    waveform: 'sawtooth',
    attack: 0.001,
    decay: 0.3,
    sustain: 0.2,
    release: 0.4,
  },

  // Brass
  trump: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.6,
    waveform: 'sawtooth',
    attack: 0.02,
    decay: 0.1,
    sustain: 0.7,
    release: 0.15,
  },

  // Sax
  sax: {
    freq: 440,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.08,
    duration: 0.6,
    waveform: 'sawtooth',
    attack: 0.03,
    decay: 0.1,
    sustain: 0.65,
    release: 0.2,
  },

  // ============ TABLA / WORLD ============
  tabla: {
    freq: 200,
    freqDecay: 0.03,
    noise: true,
    noiseGain: 0.25,
    duration: 0.2,
    waveform: 'sine',
  },
  tabla2: {
    freq: 150,
    freqDecay: 0.04,
    noise: true,
    noiseGain: 0.2,
    duration: 0.25,
    waveform: 'sine',
  },
  tablex: {
    freq: 180,
    freqDecay: 0.035,
    noise: true,
    noiseGain: 0.22,
    duration: 0.22,
    waveform: 'sine',
  },
  world: {
    freq: 300,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.3,
    duration: 0.2,
    waveform: 'triangle',
  },
  east: { freq: 350, freqDecay: 0.02, noise: false, noiseGain: 0, duration: 0.3, waveform: 'sine' },

  // ============ EFFECTS / NOISE ============
  noise: {
    freq: 1000,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.98,
    duration: 0.3,
    waveform: 'sine',
  },
  noise2: {
    freq: 2000,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.95,
    duration: 0.25,
    waveform: 'sine',
  },
  glitch: {
    freq: 3000,
    freqDecay: 0.002,
    noise: true,
    noiseGain: 0.9,
    duration: 0.08,
    waveform: 'square',
  },
  glitch2: {
    freq: 4000,
    freqDecay: 0.003,
    noise: true,
    noiseGain: 0.85,
    duration: 0.1,
    waveform: 'square',
  },
  wind: {
    freq: 400,
    freqDecay: 0.1,
    noise: true,
    noiseGain: 0.95,
    duration: 1.0,
    waveform: 'sine',
    noiseFilterFreq: 800,
  },
  breath: {
    freq: 500,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.9,
    duration: 0.5,
    waveform: 'sine',
    noiseFilterFreq: 1000,
  },
  bubble: {
    freq: 600,
    freqDecay: 0.05,
    noise: false,
    noiseGain: 0,
    duration: 0.2,
    waveform: 'sine',
  },
  fire: {
    freq: 800,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.85,
    duration: 0.4,
    waveform: 'triangle',
    noiseFilterFreq: 2000,
  },

  // FX sounds
  fx: {
    freq: 1000,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.5,
    duration: 0.3,
    waveform: 'sawtooth',
  },
  feelfx: {
    freq: 800,
    freqDecay: 0.04,
    noise: true,
    noiseGain: 0.4,
    duration: 0.25,
    waveform: 'triangle',
  },

  // ============ RAVE / TECHNO ============
  rave: {
    freq: 150,
    freqDecay: 0.05,
    noise: false,
    noiseGain: 0,
    duration: 0.3,
    waveform: 'sawtooth',
    attack: 0.001,
    decay: 0.08,
    sustain: 0.4,
    release: 0.1,
  },
  rave2: {
    freq: 180,
    freqDecay: 0.04,
    noise: false,
    noiseGain: 0,
    duration: 0.25,
    waveform: 'square',
    attack: 0.001,
    decay: 0.06,
    sustain: 0.35,
    release: 0.08,
  },
  ravemono: {
    freq: 140,
    freqDecay: 0.06,
    noise: false,
    noiseGain: 0,
    duration: 0.35,
    waveform: 'sawtooth',
    attack: 0.001,
    decay: 0.1,
    sustain: 0.45,
    release: 0.12,
  },
  techno: {
    freq: 100,
    freqDecay: 0.08,
    noise: false,
    noiseGain: 0,
    duration: 0.4,
    waveform: 'sawtooth',
  },
  gabba: {
    freq: 200,
    freqDecay: 0.03,
    noise: true,
    noiseGain: 0.3,
    duration: 0.2,
    waveform: 'sine',
  },
  gabbaloud: {
    freq: 220,
    freqDecay: 0.025,
    noise: true,
    noiseGain: 0.35,
    duration: 0.18,
    waveform: 'sine',
  },
  gabbalouder: {
    freq: 240,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.4,
    duration: 0.16,
    waveform: 'sine',
  },
  hardcore: {
    freq: 180,
    freqDecay: 0.04,
    noise: true,
    noiseGain: 0.25,
    duration: 0.22,
    waveform: 'sine',
  },
  industrial: {
    freq: 300,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.6,
    duration: 0.15,
    waveform: 'square',
  },

  // ============ JUNGLE / BREAKS ============
  jungle: {
    freq: 140,
    freqDecay: 0.06,
    noise: true,
    noiseGain: 0.3,
    duration: 0.25,
    waveform: 'sine',
  },
  breaks125: {
    freq: 150,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.35,
    duration: 0.2,
    waveform: 'triangle',
  },
  breaks152: {
    freq: 160,
    freqDecay: 0.045,
    noise: true,
    noiseGain: 0.32,
    duration: 0.18,
    waveform: 'triangle',
  },
  breaks157: {
    freq: 165,
    freqDecay: 0.04,
    noise: true,
    noiseGain: 0.3,
    duration: 0.17,
    waveform: 'triangle',
  },
  breaks165: {
    freq: 170,
    freqDecay: 0.038,
    noise: true,
    noiseGain: 0.28,
    duration: 0.16,
    waveform: 'triangle',
  },
  amencutup: {
    freq: 155,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.4,
    duration: 0.2,
    waveform: 'triangle',
  },

  // ============ HOUSE / JAZZ ============
  house: {
    freq: 120,
    freqDecay: 0.07,
    noise: false,
    noiseGain: 0,
    duration: 0.35,
    waveform: 'sine',
  },
  jazz: {
    freq: 100,
    freqDecay: 0.08,
    noise: true,
    noiseGain: 0.15,
    duration: 0.3,
    waveform: 'sine',
  },

  // ============ MISC SOUNDS ============
  sid: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.3,
    waveform: 'square',
    attack: 0.001,
    decay: 0.05,
    sustain: 0.5,
    release: 0.1,
  },
  simplesine: {
    freq: 440,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.5,
    waveform: 'sine',
    attack: 0.01,
    decay: 0.1,
    sustain: 0.7,
    release: 0.2,
  },
  chin: {
    freq: 1200,
    freqDecay: 0.01,
    noise: false,
    noiseGain: 0,
    duration: 0.2,
    waveform: 'triangle',
  },
  circus: {
    freq: 600,
    freqDecay: 0.03,
    noise: false,
    noiseGain: 0,
    duration: 0.3,
    waveform: 'sine',
  },
  cosmicg: {
    freq: 200,
    freqDecay: 0.1,
    noise: true,
    noiseGain: 0.2,
    duration: 0.5,
    waveform: 'sawtooth',
  },
  future: {
    freq: 300,
    freqDecay: 0.05,
    noise: false,
    noiseGain: 0,
    duration: 0.4,
    waveform: 'sawtooth',
  },
  hit: {
    freq: 400,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.5,
    duration: 0.15,
    waveform: 'triangle',
  },
  invaders: {
    freq: 800,
    freqDecay: 0.02,
    noise: false,
    noiseGain: 0,
    duration: 0.2,
    waveform: 'square',
  },
  space: {
    freq: 200,
    freqDecay: 0.1,
    noise: true,
    noiseGain: 0.3,
    duration: 0.8,
    waveform: 'sine',
  },
  wobble: {
    freq: 100,
    freqDecay: 0.2,
    noise: false,
    noiseGain: 0,
    duration: 0.6,
    waveform: 'sawtooth',
    filterFreq: 500,
    filterQ: 5,
  },
  sugar: {
    freq: 500,
    freqDecay: 0.02,
    noise: false,
    noiseGain: 0,
    duration: 0.25,
    waveform: 'sine',
  },
  yeah: {
    freq: 400,
    freqDecay: 0.03,
    noise: true,
    noiseGain: 0.2,
    duration: 0.3,
    waveform: 'sawtooth',
  },
  miniyeah: {
    freq: 500,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.15,
    duration: 0.2,
    waveform: 'sawtooth',
  },

  // Misc percussion
  misc: {
    freq: 600,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.4,
    duration: 0.15,
    waveform: 'triangle',
  },
  crow: {
    freq: 800,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.3,
    duration: 0.4,
    waveform: 'sawtooth',
  },
  birds: {
    freq: 2000,
    freqDecay: 0.03,
    noise: true,
    noiseGain: 0.2,
    duration: 0.3,
    waveform: 'sine',
  },
  birds3: {
    freq: 2500,
    freqDecay: 0.025,
    noise: true,
    noiseGain: 0.15,
    duration: 0.25,
    waveform: 'sine',
  },
  insect: {
    freq: 4000,
    freqDecay: 0.01,
    noise: true,
    noiseGain: 0.5,
    duration: 0.15,
    waveform: 'square',
  },

  // Mouth/speech placeholder (just a tone)
  mouth: {
    freq: 300,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.3,
    duration: 0.2,
    waveform: 'sawtooth',
  },
  speech: {
    freq: 250,
    freqDecay: 0.04,
    noise: true,
    noiseGain: 0.25,
    duration: 0.3,
    waveform: 'sawtooth',
  },
  speechless: {
    freq: 200,
    freqDecay: 0.05,
    noise: true,
    noiseGain: 0.35,
    duration: 0.35,
    waveform: 'triangle',
  },
  diphone: {
    freq: 280,
    freqDecay: 0.04,
    noise: true,
    noiseGain: 0.2,
    duration: 0.25,
    waveform: 'sawtooth',
  },
  diphone2: {
    freq: 320,
    freqDecay: 0.035,
    noise: true,
    noiseGain: 0.18,
    duration: 0.22,
    waveform: 'sawtooth',
  },
};

/**
 * Renders a sample buffer to the audio context
 */
interface SampleEffects {
  lpf?: number; // Low pass filter frequency
  hpf?: number; // High pass filter frequency
  room?: number; // Reverb amount 0-1
  delay?: number; // Delay amount 0-1
}

function renderSampleBuffer(
  offlineCtx: any,
  destinationL: any,
  destinationR: any,
  sampleData: Float32Array,
  startTime: number,
  gain: number,
  pan: number,
  playbackRate: number = 1.0,
  effects: SampleEffects = {}
): void {
  // Create an AudioBuffer from the sample data
  const audioBuffer = offlineCtx.createBuffer(1, sampleData.length, offlineCtx.sampleRate);
  audioBuffer.copyToChannel(sampleData, 0);

  // Create buffer source
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  // Apply pitch shifting via playback rate
  source.playbackRate.value = playbackRate;

  // Create gain node
  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = gain;

  // Build the audio chain: source -> [filters] -> gain -> pan -> destination
  let lastNode: any = source;

  // Apply low pass filter if specified
  if (effects.lpf && effects.lpf < 20000) {
    const lpfNode = offlineCtx.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = effects.lpf;
    lpfNode.Q.value = 1;
    lastNode.connect(lpfNode);
    lastNode = lpfNode;
  }

  // Apply high pass filter if specified
  if (effects.hpf && effects.hpf > 20) {
    const hpfNode = offlineCtx.createBiquadFilter();
    hpfNode.type = 'highpass';
    hpfNode.frequency.value = effects.hpf;
    hpfNode.Q.value = 1;
    lastNode.connect(hpfNode);
    lastNode = hpfNode;
  }

  // Connect to gain
  lastNode.connect(gainNode);

  // Apply panning
  const leftGainVal = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGainVal = Math.sin(((pan + 1) * Math.PI) / 4);

  const leftPan = offlineCtx.createGain();
  const rightPan = offlineCtx.createGain();
  leftPan.gain.value = leftGainVal;
  rightPan.gain.value = rightGainVal;

  // Connect: gain -> pan -> destination
  gainNode.connect(leftPan);
  gainNode.connect(rightPan);
  leftPan.connect(destinationL);
  rightPan.connect(destinationR);

  // Start playback
  source.start(startTime);
}

/**
 * Synthesizes a sound based on sample name using comprehensive sound library
 */
async function renderDrumSound(
  offlineCtx: any,
  destinationL: any,
  destinationR: any,
  sampleName: string,
  sampleIndex: number,
  startTime: number,
  gain: number,
  pan: number,
  playbackRate: number = 1.0,
  effects: SampleEffects = {}
): Promise<void> {
  // Try to load real sample first
  if (hasSample(sampleName)) {
    try {
      const sampleBuffer = await getSampleBuffer(sampleName, sampleIndex, offlineCtx);
      if (sampleBuffer) {
        // Play the real sample with optional pitch shifting and effects
        renderSampleBuffer(
          offlineCtx,
          destinationL,
          destinationR,
          sampleBuffer,
          startTime,
          gain,
          pan,
          playbackRate,
          effects
        );
        return;
      } else {
        logger.warn({ sampleName, sampleIndex }, 'Sample buffer returned null, using fallback');
      }
    } catch (error) {
      logger.warn({ error, sampleName }, 'Failed to load sample, using synthesized fallback');
    }
  } else {
    logger.warn({ sampleName }, 'Sample not in hasSample map, using synth');
  }

  // Fallback to synthesized sound
  // Get sound params from library or use default
  const params = soundLibrary[sampleName.toLowerCase()] || {
    freq: 400,
    freqDecay: 0.02,
    noise: true,
    noiseGain: 0.3,
    duration: 0.15,
    waveform: 'triangle' as OscillatorType,
  };

  // Create oscillator for tonal component
  const osc = offlineCtx.createOscillator();
  const oscGain = offlineCtx.createGain();

  osc.type = params.waveform;
  osc.frequency.setValueAtTime(params.freq, startTime);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(20, params.freq * 0.1),
    startTime + params.freqDecay
  );

  // Quick attack, exponential decay
  const oscLevel = gain * (1 - params.noiseGain);
  oscGain.gain.setValueAtTime(oscLevel, startTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + params.duration);

  // Apply panning
  const leftGainVal = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGainVal = Math.sin(((pan + 1) * Math.PI) / 4);

  const leftPan = offlineCtx.createGain();
  const rightPan = offlineCtx.createGain();
  leftPan.gain.value = leftGainVal;
  rightPan.gain.value = rightGainVal;

  osc.connect(oscGain);
  oscGain.connect(leftPan);
  oscGain.connect(rightPan);
  leftPan.connect(destinationL);
  rightPan.connect(destinationR);

  osc.start(startTime);
  osc.stop(startTime + params.duration + 0.01);

  // Add noise component for snares, hi-hats, etc.
  if (params.noise && params.noiseGain > 0) {
    // Create noise using a buffer
    const noiseLength = Math.ceil(params.duration * offlineCtx.sampleRate);
    const noiseBuffer = offlineCtx.createBuffer(1, noiseLength, offlineCtx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    for (let i = 0; i < noiseLength; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    const noiseSource = offlineCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // High-pass filter for noise (makes it more metallic)
    const noiseFilter = offlineCtx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = params.freq > 1000 ? 5000 : 1000;

    const noiseGainNode = offlineCtx.createGain();
    const noiseLevel = gain * params.noiseGain;
    noiseGainNode.gain.setValueAtTime(noiseLevel, startTime);
    noiseGainNode.gain.exponentialRampToValueAtTime(0.001, startTime + params.duration);

    const noiseLeftPan = offlineCtx.createGain();
    const noiseRightPan = offlineCtx.createGain();
    noiseLeftPan.gain.value = leftGainVal;
    noiseRightPan.gain.value = rightGainVal;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGainNode);
    noiseGainNode.connect(noiseLeftPan);
    noiseGainNode.connect(noiseRightPan);
    noiseLeftPan.connect(destinationL);
    noiseRightPan.connect(destinationR);

    noiseSource.start(startTime);
    noiseSource.stop(startTime + params.duration + 0.01);
  }
}

/**
 * Checks if a hap value represents a sample-based sound
 */
function isSampleBasedHap(value: any): string | null {
  if (typeof value === 'object' && value !== null) {
    // Check for sample name in 's' or 'sound' property
    if (typeof value.s === 'string') return value.s;
    if (typeof value.sound === 'string') return value.sound;
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

/**
 * Renders a Strudel pattern to audio using the real Strudel engine and OfflineAudioContext
 */
async function renderPatternToAudio(
  pattern: any,
  duration: number,
  sampleRate: number,
  channels: number,
  cps: number = 0.5,
  onProgress?: (progress: number) => void
): Promise<Float32Array> {
  // Ensure modules are loaded
  if (!NodeOfflineAudioContext || !strudelCore) {
    throw new Error('Audio rendering modules not available');
  }

  const totalSamples = Math.ceil(duration * sampleRate);

  // Create OfflineAudioContext using web-audio-engine for Node.js
  const offlineCtx = new NodeOfflineAudioContext(channels, totalSamples, sampleRate);

  // Create channel merger for stereo rendering
  const merger = offlineCtx.createChannelMerger(2);

  // Create destination gains for left and right channels
  const leftGain = offlineCtx.createGain();
  const rightGain = offlineCtx.createGain();

  leftGain.connect(merger, 0, 0);
  rightGain.connect(merger, 0, 1);
  merger.connect(offlineCtx.destination);

  // Query the pattern for all events in the duration
  // Strudel patterns work in cycles, so we need to query based on cycles
  const numCycles = duration * cps;

  // Query the pattern to get all haps (events)
  // Strudel patterns can be queried different ways depending on version
  let haps: StrudelHap[] = [];
  try {
    // Find the actual Pattern object - it might be nested
    let actualPattern = pattern;

    // Log pattern structure for debugging
    logger.info(
      {
        patternType: typeof pattern,
        hasQueryArc: typeof pattern?.queryArc === 'function',
        hasFirstCycle: typeof pattern?.firstCycle === 'function',
        patternKeys: pattern ? Object.keys(pattern).slice(0, 10) : [],
        innerPatternType: typeof pattern?.pattern,
        innerHasQueryArc: typeof pattern?.pattern?.queryArc === 'function',
        innerHasFirstCycle: typeof pattern?.pattern?.firstCycle === 'function',
        innerPatternKeys: pattern?.pattern ? Object.keys(pattern.pattern).slice(0, 10) : [],
      },
      'Pattern structure'
    );

    // Navigate to find the actual Pattern with queryArc
    if (typeof pattern?.queryArc === 'function') {
      actualPattern = pattern;
    } else if (typeof pattern?.pattern?.queryArc === 'function') {
      actualPattern = pattern.pattern;
    } else if (typeof pattern?.pattern?.pattern?.queryArc === 'function') {
      actualPattern = pattern.pattern.pattern;
    }

    // Try to query using queryArc (the standard Strudel method)
    if (typeof actualPattern?.queryArc === 'function') {
      haps = actualPattern.queryArc(0, numCycles);
      logger.info({ method: 'queryArc', hapCount: haps.length }, 'Query method used');
    } else if (typeof actualPattern?.firstCycle === 'function') {
      // Fallback - get first cycle and repeat for duration
      const cycleHaps = actualPattern.firstCycle();
      logger.info({ method: 'firstCycle', cycleHapCount: cycleHaps?.length }, 'Query method used');
      haps = [];
      for (let cycle = 0; cycle < Math.ceil(numCycles); cycle++) {
        for (const hap of cycleHaps || []) {
          // Offset hap times by cycle number
          const wholeBegin = Number(hap.whole.begin.valueOf()) + cycle;
          const wholeEnd = Number(hap.whole.end.valueOf()) + cycle;
          const partBegin = Number(hap.part.begin.valueOf()) + cycle;
          const partEnd = Number(hap.part.end.valueOf()) + cycle;
          const offsetHap = {
            ...hap,
            whole: {
              begin: { valueOf: (): number => wholeBegin },
              end: { valueOf: (): number => wholeEnd },
            },
            part: {
              begin: { valueOf: (): number => partBegin },
              end: { valueOf: (): number => partEnd },
            },
            hasOnset: (): boolean => (hap.hasOnset ? Boolean(hap.hasOnset()) : true),
          };
          if (offsetHap.whole.begin.valueOf() < numCycles) {
            haps.push(offsetHap as StrudelHap);
          }
        }
      }
    } else {
      // Last resort - try to manually extract events if pattern has an _events property or similar
      logger.warn(
        {
          patternStr: JSON.stringify(actualPattern)?.slice(0, 500),
          methods: actualPattern
            ? Object.getOwnPropertyNames(Object.getPrototypeOf(actualPattern) || {}).slice(0, 20)
            : [],
        },
        'No query method found, pattern structure'
      );
    }
  } catch (queryError) {
    const errorMsg = queryError instanceof Error ? queryError.message : String(queryError);
    logger.warn(
      {
        error: errorMsg,
        stack: queryError instanceof Error ? queryError.stack?.slice(0, 300) : '',
      },
      'Error querying pattern'
    );
  }

  logger.info({ hapCount: haps.length, numCycles, duration }, 'Rendering Strudel haps to audio');

  // Sort haps by onset time
  haps.sort((a, b) => {
    const aBegin = a.whole?.begin?.valueOf?.() ?? 0;
    const bBegin = b.whole?.begin?.valueOf?.() ?? 0;
    return aBegin - bBegin;
  });

  // Log haps AFTER sorting for debugging
  if (haps.length > 0) {
    const allTimes = haps.map((h) => h.whole?.begin?.valueOf?.() ?? h.whole?.begin);
    const uniqueTimes = [...new Set(allTimes.map((t) => Math.round(t * 1000) / 1000))].sort(
      (a, b) => a - b
    );
    logger.info(
      {
        totalHaps: haps.length,
        uniqueTimeCount: uniqueTimes.length,
        first20Times: uniqueTimes.slice(0, 20),
      },
      'Hap timing distribution'
    );

    const sampleHaps = haps.slice(0, 8).map((h, i) => ({
      index: i,
      wholeBegin: h.whole?.begin?.valueOf?.() ?? h.whole?.begin,
      wholeEnd: h.whole?.end?.valueOf?.() ?? h.whole?.end,
      value: typeof h.value === 'object' ? JSON.stringify(h.value).slice(0, 50) : h.value,
      hasOnset: typeof h.hasOnset === 'function' ? h.hasOnset() : 'no hasOnset method',
    }));
    logger.info({ sampleHaps }, 'First 8 haps after sorting');
  }

  // Track progress
  let processedHaps = 0;
  let skippedNoOnset = 0;
  let skippedOutOfWindow = 0;
  const totalHaps = haps.length || 1;

  // Track sample usage
  const sampleStats: Record<string, { count: number; loaded: boolean }> = {};

  // Render each hap as audio
  const renderedTimes: number[] = [];
  for (const hap of haps) {
    // Only render haps with onsets (to avoid duplicate sounds from continuous patterns)
    if (!hap.hasOnset()) {
      skippedNoOnset++;
      continue;
    }

    const value = hap.value;

    // Convert cycle time to seconds
    const startCycle = hap.whole.begin.valueOf();
    const endCycle = hap.whole.end.valueOf();
    const startTime = startCycle / cps;
    const hapDuration = (endCycle - startCycle) / cps;

    // Skip events outside our render window
    if (startTime >= duration || startTime < 0) {
      skippedOutOfWindow++;
      continue;
    }

    // Track rendered times for debugging
    renderedTimes.push(Math.round(startTime * 1000) / 1000);

    // Get common synthesis parameters
    // Ensure minimum gain of 0.3 so sounds are always audible
    const gain = Math.max(0.3, getGainFromHap(value));
    const pan = getPanFromHap(value);

    // Check if this is a sample-based sound (drums, etc.)
    const sampleName = isSampleBasedHap(value);

    if (sampleName) {
      // Track sample usage
      if (!sampleStats[sampleName]) {
        const isKnown = hasSample(sampleName);
        sampleStats[sampleName] = { count: 0, loaded: isKnown };
        if (!isKnown) {
          logger.warn(
            { sampleName, value: JSON.stringify(value).slice(0, 100) },
            'Unknown sample name'
          );
        }
      }
      sampleStats[sampleName].count++;

      // Get sample index (n parameter in Strudel)
      const sampleIndex = typeof value?.n === 'number' ? value.n : 0;

      // Calculate playback rate for pitch shifting melodic samples
      // DISABLED: Pitch shifting was causing issues because samples have unknown base pitches
      // For now, play all samples at their original pitch
      // TODO: Re-enable with proper sample base pitch detection
      const playbackRate = 1.0;

      // Extract effects from hap value
      const effects: SampleEffects = {};
      if (typeof value === 'object' && value !== null) {
        // Low pass filter (lpf or cutoff) - enforce minimum of 1000 Hz to prevent muffled sound
        const lpfValue =
          typeof value.lpf === 'number'
            ? value.lpf
            : typeof value.cutoff === 'number'
              ? value.cutoff
              : undefined;
        if (lpfValue !== undefined) {
          effects.lpf = Math.max(1000, lpfValue); // Don't go below 1000 Hz
        }
        // High pass filter
        if (typeof value.hpf === 'number') effects.hpf = value.hpf;
        // Reverb
        if (typeof value.room === 'number') effects.room = value.room;
        // Delay
        if (typeof value.delay === 'number') effects.delay = value.delay;
      }

      // Use real samples or synthesizer fallback
      await renderDrumSound(
        offlineCtx,
        leftGain,
        rightGain,
        sampleName,
        sampleIndex,
        Math.max(0, startTime),
        gain,
        pan,
        playbackRate,
        effects
      );
    } else {
      // Use melodic synthesizer for note-based sounds
      const frequency = getFrequencyFromHap(value);

      // Get waveform type if specified
      let waveform: OscillatorType = 'sine';
      if (typeof value === 'object' && value !== null) {
        if (value.wave) waveform = value.wave as OscillatorType;
      }

      // Get ADSR if specified
      const attack = typeof value?.attack === 'number' ? value.attack : 0.01;
      const decay = typeof value?.decay === 'number' ? value.decay : 0.1;
      const sustain = typeof value?.sustain === 'number' ? value.sustain : 0.7;
      const release = typeof value?.release === 'number' ? value.release : 0.1;

      // Render the note
      renderSynthNote(
        offlineCtx,
        leftGain,
        rightGain,
        frequency,
        Math.max(0, startTime),
        Math.min(hapDuration, duration - startTime),
        gain,
        pan,
        waveform,
        attack,
        decay,
        sustain,
        release
      );
    }

    processedHaps++;
    if (onProgress && processedHaps % 100 === 0) {
      onProgress(Math.round((processedHaps / totalHaps) * 50)); // First 50% is scheduling
    }
  }

  // Log rendered audio times for debugging
  logger.info(
    {
      totalHaps: haps.length,
      processedHaps,
      skippedNoOnset,
      skippedOutOfWindow,
      cps,
      renderedTimesSeconds: renderedTimes.slice(0, 20),
      uniqueTimesCount: new Set(renderedTimes).size,
      sampleStats,
    },
    'Audio scheduling complete'
  );

  // If no haps were rendered, generate a short silence indicator beep
  if (processedHaps === 0) {
    logger.warn('No haps rendered, pattern may be silent or use unsupported features');
    // Add a brief 1kHz beep to indicate the pattern was processed
    renderSynthNote(offlineCtx, leftGain, rightGain, 1000, 0, 0.1, 0.3, 0, 'sine');
  }

  // Render the audio offline
  onProgress?.(50); // Halfway through - now rendering
  const renderedBuffer = await offlineCtx.startRendering();
  onProgress?.(90); // Nearly done

  // Debug: Check audio levels at different time points
  const debugChannel = renderedBuffer.getChannelData(0);
  const debugTimes = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
  const audioLevels: Record<string, number> = {};
  for (const t of debugTimes) {
    const startSample = Math.floor(t * sampleRate);
    const endSample = Math.min(startSample + Math.floor(0.15 * sampleRate), debugChannel.length);
    let max = 0;
    for (let i = startSample; i < endSample; i++) {
      max = Math.max(max, Math.abs(debugChannel[i] || 0));
    }
    audioLevels[`${t}s`] = Math.round(max * 1000) / 1000;
  }
  logger.info(
    { audioLevels, totalSamples: debugChannel.length },
    'Audio buffer levels at time points'
  );

  // Convert AudioBuffer to interleaved Float32Array
  const numChannels = Math.min(channels, renderedBuffer.numberOfChannels);
  const length = renderedBuffer.length;
  const interleaved = new Float32Array(length * numChannels);

  // Get channel data
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(renderedBuffer.getChannelData(ch));
  }

  // Interleave the channels
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const channel = channelData[ch];
      interleaved[i * numChannels + ch] = channel ? (channel[i] ?? 0) : 0;
    }
  }

  onProgress?.(100);
  return interleaved;
}

/**
 * Exports audio buffer to specified format
 * Buffer should contain interleaved samples for multi-channel audio
 */
function exportAudioBuffer(
  buffer: Float32Array,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _format: StrudelAudioFormat,
  sampleRate: number,
  channels: number = 1
): { data: string; fileSize: number } {
  // In a real implementation, this would encode to actual audio formats
  // For now, we return a base64-encoded representation

  // Calculate sizes based on channel count
  // Buffer contains interleaved samples: [L0, R0, L1, R1, ...] for stereo
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const headerSize = 44;
  const dataSize = buffer.length * bytesPerSample; // buffer.length is total interleaved samples
  const fileSize = headerSize + dataSize;

  // Convert Float32 to Int16 for WAV
  const int16Buffer = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const rawSample = buffer[i] ?? 0;
    const sample = Math.max(-1, Math.min(1, rawSample));
    int16Buffer[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  // Create WAV header
  const wavBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(wavBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true); // numChannels
  view.setUint32(24, sampleRate, true); // sampleRate
  view.setUint32(28, byteRate, true); // byteRate = sampleRate * blockAlign
  view.setUint16(32, blockAlign, true); // blockAlign = channels * bytesPerSample
  view.setUint16(34, bitsPerSample, true); // bitsPerSample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy audio data
  const int16View = new Int16Array(wavBuffer, 44);
  int16View.set(int16Buffer);

  // Convert to base64 using Buffer to avoid argument list overflow for large buffers
  const uint8Array = new Uint8Array(wavBuffer);
  const base64 = Buffer.from(uint8Array).toString('base64');

  return { data: base64, fileSize };
}

/**
 * Helper to write string to DataView
 */
function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Creates a failed result
 */
function createFailedResult(
  processId: string,
  _userId: string,
  errorMessage: string,
  startTime: number,
  validation?: StrudelValidationResult
): StrudelProcessResult {
  return {
    processId,
    success: false,
    status: 'failed',
    validation,
    error: {
      code: 'EXECUTION_ERROR',
      message: errorMessage,
    },
    timing: {
      startedAt: new Date(startTime),
      completedAt: new Date(),
      validationTimeMs: validation?.validationTimeMs || 0,
      renderTimeMs: 0,
      totalTimeMs: Date.now() - startTime,
    },
  };
}

/**
 * Cancels a running Strudel process
 */
export async function cancelStrudelProcess(processId: string): Promise<boolean> {
  const state = await getStrudelProcessState(processId);

  if (!state) {
    return false;
  }

  if (state.status === 'queued') {
    // Remove from queue
    await removeFromQueue(processId);
    await updateStrudelProcessState(processId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
    return true;
  }

  if (state.status === 'rendering' || state.status === 'validating') {
    await updateStrudelProcessState(processId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
    activeRenders.delete(processId);
    return true;
  }

  return false;
}

/**
 * Gets the status of a Strudel process
 */
export async function getStrudelProcessStatus(processId: string): Promise<{
  status: StrudelProcessStatus;
  progress?: number;
  queuePosition?: number;
  result?: StrudelProcessResult;
} | null> {
  const state = await getStrudelProcessState(processId);

  if (!state) {
    return null;
  }

  const response: {
    status: StrudelProcessStatus;
    progress?: number;
    queuePosition?: number;
    result?: StrudelProcessResult;
  } = {
    status: state.status,
    progress: state.progress,
  };

  if (state.status === 'queued') {
    // Use persisted queuePosition from state
    response.queuePosition = state.queuePosition;
  }

  // Include stored result for completed processes (async/queued retrieval)
  if (state.status === 'complete' && state.result) {
    response.result = {
      processId,
      success: true,
      status: 'complete',
      validation: state.validation,
      audioData: state.result.audioData,
      audioMetadata: state.result.audioMetadata,
      timing: state.result.timing
        ? {
            startedAt: new Date(state.result.timing.startedAt),
            completedAt: new Date(state.result.timing.completedAt),
            validationTimeMs: state.result.timing.validationTimeMs,
            renderTimeMs: state.result.timing.renderTimeMs,
            totalTimeMs: state.result.timing.totalTimeMs,
          }
        : {
            startedAt: new Date(state.startedAt || state.createdAt),
            completedAt: new Date(state.completedAt || new Date().toISOString()),
            validationTimeMs: state.validation?.validationTimeMs || 0,
            renderTimeMs: 0,
            totalTimeMs: 0,
          },
    };
  } else if (state.status === 'failed' && state.error) {
    response.result = {
      processId,
      success: false,
      status: 'failed',
      validation: state.validation,
      error: state.error,
      timing: {
        startedAt: new Date(state.startedAt || state.createdAt),
        completedAt: new Date(state.completedAt || new Date().toISOString()),
        validationTimeMs: state.validation?.validationTimeMs || 0,
        renderTimeMs: 0,
        totalTimeMs: 0,
      },
    };
  }

  return response;
}

/**
 * Gets Strudel service health
 */
export async function getStrudelServiceHealth(): Promise<StrudelHealthResponse> {
  const queueSize = await getStrudelQueueSize();

  return {
    status: transpilerAvailable ? 'healthy' : 'degraded',
    version: '1.0.0',
    transpiler: {
      available: transpilerAvailable,
      version: transpilerVersion,
    },
    audioRenderer: {
      available: true,
    },
    processes: {
      active: activeRenders.size,
      queued: queueSize,
      maxConcurrent: serviceConfig.maxConcurrentRenders,
    },
    uptimeSeconds: Math.floor((Date.now() - serviceStartTime) / 1000),
    lastCheck: new Date().toISOString(),
  };
}

/**
 * Gets queue size
 */
export async function getStrudelQueueSize(): Promise<number> {
  if (!isRedisConnected()) {
    return inMemoryQueue.length;
  }

  try {
    const redis = getRedisClient();
    return await redis.zcard(STRUDEL_QUEUE_KEY);
  } catch {
    return inMemoryQueue.length;
  }
}

/**
 * Gets queue position for a process
 */
async function getStrudelQueuePosition(processId: string): Promise<number | null> {
  if (!isRedisConnected()) {
    const index = inMemoryQueue.findIndex((item) => item.processId === processId);
    return index !== -1 ? index + 1 : null;
  }

  try {
    const redis = getRedisClient();
    const items = await redis.zrange(STRUDEL_QUEUE_KEY, 0, -1);

    for (let i = 0; i < items.length; i++) {
      const rawItem = items[i];
      if (rawItem) {
        const item = JSON.parse(rawItem) as { processId: string };
        if (item.processId === processId) {
          return i + 1;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Removes a process from the queue
 */
async function removeFromQueue(processId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    const index = inMemoryQueue.findIndex((item) => item.processId === processId);
    if (index !== -1) {
      inMemoryQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  try {
    const redis = getRedisClient();
    const items = await redis.zrange(STRUDEL_QUEUE_KEY, 0, -1);

    for (const itemStr of items) {
      const item = JSON.parse(itemStr) as { processId: string };
      if (item.processId === processId) {
        await redis.zrem(STRUDEL_QUEUE_KEY, itemStr);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Starts the queue worker
 */
function startQueueWorker(): void {
  if (queueWorkerRunning) {
    return;
  }

  queueWorkerRunning = true;
  queueWorkerInterval = setInterval(() => {
    void processQueue();
  }, 1000);

  logger.info('Strudel queue worker started');
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

  logger.info('Strudel queue worker stopped');
}

/**
 * Updates queue positions for all remaining queued processes
 * Called after an item is dequeued to keep positions accurate
 */
async function refreshQueuePositions(): Promise<void> {
  try {
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const items = await redis.zrange(STRUDEL_QUEUE_KEY, 0, -1);

      for (let i = 0; i < items.length; i++) {
        const rawItem = items[i];
        if (rawItem) {
          const item = JSON.parse(rawItem) as { processId: string };
          const newPosition = i + 1;

          // Update the process state with new position
          const state = await getStrudelProcessState(item.processId);
          if (state && state.queuePosition !== newPosition) {
            await updateStrudelProcessState(item.processId, { queuePosition: newPosition });

            // Emit queue position update event
            const queueSize = items.length;
            emitProgress(item.processId, {
              processId: item.processId,
              position: newPosition,
              queueLength: queueSize,
            } as StrudelQueuedPayload);
          }
        }
      }
    } else {
      // Update in-memory queue positions
      for (let i = 0; i < inMemoryQueue.length; i++) {
        const item = inMemoryQueue[i];
        if (item) {
          const newPosition = i + 1;
          const state = inMemoryProcessStates.get(item.processId);
          if (state && state.queuePosition !== newPosition) {
            state.queuePosition = newPosition;
            inMemoryProcessStates.set(item.processId, state);

            // Emit queue position update event
            emitProgress(item.processId, {
              processId: item.processId,
              position: newPosition,
              queueLength: inMemoryQueue.length,
            } as StrudelQueuedPayload);
          }
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to refresh queue positions');
  }
}

/**
 * Processes the queue
 */
async function processQueue(): Promise<void> {
  if (!serviceConfig.enableQueue) {
    return;
  }

  try {
    // Check if we have capacity
    if (activeRenders.size >= serviceConfig.maxConcurrentRenders) {
      return;
    }

    // Dequeue next item
    let item: { processId: string; userId: string; priority: number; enqueuedAt: string } | null =
      null;

    if (isRedisConnected()) {
      const redis = getRedisClient();
      const result = await redis.zpopmin(STRUDEL_QUEUE_KEY);

      if (result && result.length > 0 && result[0]) {
        item = JSON.parse(result[0]);
      }
    } else {
      item = inMemoryQueue.shift() || null;
    }

    if (!item) {
      return;
    }

    // Refresh queue positions for remaining items after dequeue
    await refreshQueuePositions();

    // Get process state
    const state = await getStrudelProcessState(item.processId);
    if (!state) {
      logger.warn({ processId: item.processId }, 'Dequeued process has no state');
      return;
    }

    // Execute the process
    logger.info({ processId: item.processId }, 'Processing queued Strudel pattern');

    const config: StrudelProcessConfig = {
      processId: item.processId,
      userId: state.userId,
      code: state.code,
      options: state.options,
      priority: state.priority,
      requestId: state.requestId,
      socketId: state.socketId,
      createdAt: new Date(state.createdAt),
    };

    // Execute without awaiting (fire and forget)
    const startTime = Date.now();
    const validation = await validateStrudelPattern(config.code);

    if (!validation.isValid) {
      await updateStrudelProcessState(item.processId, {
        status: 'failed',
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.errors.map((e) => e.message).join('; '),
        },
        completedAt: new Date().toISOString(),
      });
      return;
    }

    renderStrudelPattern(config, item.processId, startTime, validation)
      .then((result) => {
        logger.info(
          { processId: item.processId, status: result.status },
          'Queued pattern completed'
        );
      })
      .catch((error) => {
        logger.error({ processId: item.processId, error: error.message }, 'Queued pattern failed');
      });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Queue processing error');
  }
}

/**
 * Subscribes to progress events for a process
 */
export function subscribeToProgress(processId: string, listener: ProgressListener): () => void {
  let listeners = progressListeners.get(processId);
  if (!listeners) {
    listeners = new Set();
    progressListeners.set(processId, listeners);
  }

  listeners.add(listener);

  return () => {
    const listeners = progressListeners.get(processId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        progressListeners.delete(processId);
      }
    }
  };
}

/**
 * Emits a progress event
 */
function emitProgress(
  processId: string,
  payload: StrudelProgressPayload | StrudelQueuedPayload
): void {
  const listeners = progressListeners.get(processId);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        logger.error({ processId, error }, 'Progress listener error');
      }
    }
  }
}

/**
 * Streams Strudel response in real-time
 */
export async function streamStrudelResponse(
  config: StrudelProcessConfig,
  onEvent: ProgressListener
): Promise<StrudelProcessResult> {
  const processId = config.processId || generateRequestId().replace('req_', 'strudel_');

  // Subscribe to events before starting
  const unsubscribe = subscribeToProgress(processId, onEvent);

  try {
    const result = await executeStrudelPattern({
      ...config,
      processId,
    });

    return result;
  } finally {
    unsubscribe();
  }
}

/**
 * Gets service configuration
 */
export function getStrudelServiceConfig(): StrudelServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateStrudelServiceConfig(config: Partial<StrudelServiceConfig>): void {
  const previousEnableQueue = serviceConfig.enableQueue;
  serviceConfig = { ...serviceConfig, ...config };

  if (config.enableQueue !== undefined && config.enableQueue !== previousEnableQueue) {
    if (serviceConfig.enableQueue) {
      startQueueWorker();
    } else {
      stopQueueWorker();
    }
  }

  logger.info('Strudel service configuration updated');
}

/**
 * Lists user's Strudel processes
 */
export async function listUserStrudelProcesses(
  userId: string,
  options: { page?: number; pageSize?: number; status?: StrudelProcessStatus } = {}
): Promise<{
  processes: StrudelRedisState[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { page = 1, pageSize = 20, status } = options;

  if (!isRedisConnected()) {
    const processes: StrudelRedisState[] = [];
    for (const [, state] of inMemoryProcessStates) {
      if (state.userId === userId && (!status || state.status === status)) {
        processes.push(state);
      }
    }

    return {
      processes: processes.slice((page - 1) * pageSize, page * pageSize),
      total: processes.length,
      page,
      pageSize,
      totalPages: Math.ceil(processes.length / pageSize),
    };
  }

  try {
    const redis = getRedisClient();
    const allProcesses: StrudelRedisState[] = [];

    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', `${STRUDEL_PREFIX}*`, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];

      for (const key of keys) {
        if (key === STRUDEL_QUEUE_KEY || key === STRUDEL_ACTIVE_KEY) {
          continue;
        }

        const data = await redis.get(key);
        if (data) {
          try {
            const state = JSON.parse(data) as StrudelRedisState;
            if (state.userId === userId && (!status || state.status === status)) {
              allProcesses.push(state);
            }
          } catch {
            // Skip malformed entries
          }
        }
      }
    } while (cursor !== '0');

    // Sort by creation time (newest first)
    allProcesses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allProcesses.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;

    return {
      processes: allProcesses.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    logger.error({ userId, error }, 'Failed to list user Strudel processes');
    throw error;
  }
}

export default {
  initializeStrudelService,
  shutdownStrudelService,
  validateStrudelPattern,
  executeStrudelPattern,
  enqueueStrudelPattern,
  cancelStrudelProcess,
  getStrudelProcessStatus,
  getStrudelProcessState,
  getStrudelQueueSize,
  getStrudelServiceHealth,
  streamStrudelResponse,
  subscribeToProgress,
  stopQueueWorker,
  getStrudelServiceConfig,
  updateStrudelServiceConfig,
  listUserStrudelProcesses,
};
