/**
 * Orchestration Service
 * High-level API for common agent orchestration patterns
 */

import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import {
  getDefaultAgent,
  getAgent,
  executeAgent,
} from './agent-registry.service.js';
import { recordAgentMetric } from './agent-metrics.service.js';
import { interpolateTemplate } from './prompt-template.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationTask,
  OrchestrationTaskResult,
  OrchestrationStatus,
  OrchestrationPattern,
  AgentType,
  SelfCritiqueConfig,
  SelfCritiqueResult,
  DiscussionConfig,
  DiscussionResult,
} from '../types/agent.types.js';

// Lazy imports for collaboration services to avoid circular dependencies
let selfCritiqueService: typeof import('./self-critique.service.js') | null = null;
let discussionService: typeof import('./discussion.service.js') | null = null;

async function getSelfCritiqueService() {
  if (!selfCritiqueService) {
    selfCritiqueService = await import('./self-critique.service.js');
  }
  return selfCritiqueService;
}

async function getDiscussionService() {
  if (!discussionService) {
    discussionService = await import('./discussion.service.js');
  }
  return discussionService;
}

// Redis key prefixes
const ORCHESTRATION_STATE_PREFIX = 'orchestration:state:';
const ORCHESTRATION_METRICS_KEY = 'orchestration:metrics';

// Service configuration
interface OrchestrationServiceConfig {
  defaultTimeoutMs: number;
  maxParallelTasks: number;
  maxMapReduceItems: number;
}

let serviceConfig: OrchestrationServiceConfig = {
  defaultTimeoutMs: 300000, // 5 minutes
  maxParallelTasks: 10,
  maxMapReduceItems: 100,
};

/**
 * Initializes the orchestration service
 */
export function initializeOrchestrationService(
  config?: Partial<OrchestrationServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  logger.info(
    {
      defaultTimeoutMs: serviceConfig.defaultTimeoutMs,
      maxParallelTasks: serviceConfig.maxParallelTasks,
    },
    'Orchestration service initialized'
  );
}

/**
 * Generates a unique orchestration ID
 */
function generateOrchestrationId(): string {
  return generateRequestId().replace('req_', 'orch_');
}

/**
 * Resolves the prompt for a task
 */
async function resolveTaskPrompt(
  task: OrchestrationTask,
  context?: Record<string, unknown>
): Promise<string> {
  if (task.promptTemplateId) {
    const variables = { ...context, ...task.variables };
    const result = await interpolateTemplate(task.promptTemplateId, variables);
    if (!result.success) {
      throw new Error(`Template interpolation failed: ${result.error}`);
    }
    return result.content!;
  }

  if (task.prompt) {
    // Simple variable substitution for direct prompts
    let prompt = task.prompt;
    const allVariables = { ...context, ...task.variables };

    for (const [key, value] of Object.entries(allVariables)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      prompt = prompt.replace(pattern, String(value ?? ''));
    }

    return prompt;
  }

  throw new Error(`Task "${task.id}" has no prompt or template`);
}

/**
 * Executes a single task
 */
async function executeTask(
  task: OrchestrationTask,
  context?: Record<string, unknown>,
  userId: string = 'system'
): Promise<OrchestrationTaskResult> {
  const startTime = Date.now();

  try {
    // Resolve agent
    let agentId: string;
    if (task.agentId) {
      const agent = await getAgent(task.agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${task.agentId}`);
      }
      agentId = task.agentId;
    } else {
      const defaultAgent = await getDefaultAgent(task.agentType);
      if (!defaultAgent) {
        throw new Error(`No agent available for type: ${task.agentType}`);
      }
      agentId = defaultAgent.id;
    }

    // Resolve prompt
    const prompt = await resolveTaskPrompt(task, context);

    // Execute agent
    const result = await executeAgent(agentId, {
      prompt,
      context: { userId, taskId: task.id, ...context },
      timeoutMs: task.timeoutMs ?? serviceConfig.defaultTimeoutMs,
    });

    const taskDurationMs = Date.now() - startTime;

    // Record agent metric for orchestration context
    void recordAgentMetric({
      agentId,
      agentType: task.agentType,
      success: result.success,
      responseTimeMs: taskDurationMs,
      errorType: result.error,
    });

    return {
      taskId: task.id,
      success: result.success,
      result: result.result,
      error: result.error,
      durationMs: taskDurationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const taskDurationMs = Date.now() - startTime;

    // Record agent metric for failed execution
    void recordAgentMetric({
      agentId: task.agentId ?? '',
      agentType: task.agentType,
      success: false,
      responseTimeMs: taskDurationMs,
      errorType: errorMessage,
    });

    return {
      taskId: task.id,
      success: false,
      error: errorMessage,
      durationMs: taskDurationMs,
    };
  }
}

/**
 * Executes tasks sequentially
 */
export async function orchestrateSequential(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  const orchestrationId = request.id ?? generateOrchestrationId();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  logger.info(
    { orchestrationId, taskCount: request.tasks.length },
    'Starting sequential orchestration'
  );

  const taskResults: OrchestrationTaskResult[] = [];
  let context = { ...request.context };
  let overallSuccess = true;

  for (const task of request.tasks) {
    const result = await executeTask(task, context, request.userId);
    taskResults.push(result);

    if (!result.success) {
      overallSuccess = false;
      logger.warn(
        { orchestrationId, taskId: task.id, error: result.error },
        'Sequential task failed'
      );
      break; // Stop on first failure
    }

    // Add result to context for next task
    context = {
      ...context,
      [`_task_${task.id}`]: result.result,
      _lastResult: result.result,
    };
  }

  const completedAt = new Date().toISOString();

  const result: OrchestrationResult = {
    id: orchestrationId,
    status: overallSuccess ? 'completed' : 'failed',
    pattern: 'sequential',
    taskResults,
    error: overallSuccess ? undefined : taskResults.find((r) => !r.success)?.error,
    durationMs: Date.now() - startTime,
    startedAt,
    completedAt,
  };

  // Store result
  await saveOrchestrationResult(result);

  logger.info(
    { orchestrationId, status: result.status, durationMs: result.durationMs },
    'Sequential orchestration completed'
  );

  return result;
}

/**
 * Executes tasks in parallel
 */
export async function orchestrateParallel(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  const orchestrationId = request.id ?? generateOrchestrationId();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  logger.info(
    { orchestrationId, taskCount: request.tasks.length },
    'Starting parallel orchestration'
  );

  // Limit parallel tasks
  const maxParallel = Math.min(
    request.tasks.length,
    (request.options?.['maxParallel'] as number) ?? serviceConfig.maxParallelTasks
  );

  // Execute in batches if needed
  const taskResults: OrchestrationTaskResult[] = [];

  for (let i = 0; i < request.tasks.length; i += maxParallel) {
    const batch = request.tasks.slice(i, i + maxParallel);
    const batchResults = await Promise.all(
      batch.map((task) => executeTask(task, request.context, request.userId))
    );
    taskResults.push(...batchResults);
  }

  const completedAt = new Date().toISOString();
  const overallSuccess = taskResults.every((r) => r.success);

  const result: OrchestrationResult = {
    id: orchestrationId,
    status: overallSuccess ? 'completed' : 'failed',
    pattern: 'parallel',
    taskResults,
    error: overallSuccess
      ? undefined
      : `${taskResults.filter((r) => !r.success).length} tasks failed`,
    durationMs: Date.now() - startTime,
    startedAt,
    completedAt,
  };

  // Store result
  await saveOrchestrationResult(result);

  logger.info(
    {
      orchestrationId,
      status: result.status,
      durationMs: result.durationMs,
      successCount: taskResults.filter((r) => r.success).length,
      failCount: taskResults.filter((r) => !r.success).length,
    },
    'Parallel orchestration completed'
  );

  return result;
}

/**
 * Executes tasks conditionally based on a routing condition
 */
export async function orchestrateConditional(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  const orchestrationId = request.id ?? generateOrchestrationId();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  logger.info(
    { orchestrationId, taskCount: request.tasks.length },
    'Starting conditional orchestration'
  );

  const taskResults: OrchestrationTaskResult[] = [];
  let selectedTask: OrchestrationTask | undefined;

  // Find the task whose condition evaluates to true
  for (const task of request.tasks) {
    if (task.condition) {
      const conditionResult = evaluateCondition(task.condition, request.context ?? {});
      if (conditionResult) {
        selectedTask = task;
        break;
      }
    } else {
      // Task without condition is the default/fallback
      selectedTask = task;
    }
  }

  if (!selectedTask) {
    // No matching condition and no default
    const completedAt = new Date().toISOString();

    return {
      id: orchestrationId,
      status: 'completed',
      pattern: 'conditional',
      taskResults: [],
      durationMs: Date.now() - startTime,
      startedAt,
      completedAt,
    };
  }

  // Execute the selected task
  const result = await executeTask(selectedTask, request.context, request.userId);
  taskResults.push(result);

  const completedAt = new Date().toISOString();

  const orchestrationResult: OrchestrationResult = {
    id: orchestrationId,
    status: result.success ? 'completed' : 'failed',
    pattern: 'conditional',
    taskResults,
    error: result.success ? undefined : result.error,
    durationMs: Date.now() - startTime,
    startedAt,
    completedAt,
  };

  // Store result
  await saveOrchestrationResult(orchestrationResult);

  logger.info(
    {
      orchestrationId,
      status: orchestrationResult.status,
      selectedTaskId: selectedTask.id,
      durationMs: orchestrationResult.durationMs,
    },
    'Conditional orchestration completed'
  );

  return orchestrationResult;
}

/**
 * Executes map-reduce pattern
 * Maps input items to parallel agent executions, then reduces results
 */
export async function orchestrateMapReduce(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  const orchestrationId = request.id ?? generateOrchestrationId();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Get map and reduce configurations
  const mapTask = request.tasks.find((t) => t.id === 'map' || t.id.startsWith('map'));
  const reduceTask = request.tasks.find((t) => t.id === 'reduce' || t.id.startsWith('reduce'));
  const items = (request.options?.['items'] as unknown[]) ?? [];

  if (!mapTask) {
    throw new Error('Map-reduce requires a task with id "map" or starting with "map"');
  }

  if (items.length === 0) {
    throw new Error('Map-reduce requires items in options.items');
  }

  if (items.length > serviceConfig.maxMapReduceItems) {
    throw new Error(
      `Too many items: ${items.length} exceeds maximum of ${serviceConfig.maxMapReduceItems}`
    );
  }

  logger.info(
    { orchestrationId, itemCount: items.length },
    'Starting map-reduce orchestration'
  );

  const taskResults: OrchestrationTaskResult[] = [];

  // Map phase: execute mapTask for each item in parallel
  const maxParallel = Math.min(
    items.length,
    (request.options?.['maxParallel'] as number) ?? serviceConfig.maxParallelTasks
  );

  const mapResults: unknown[] = [];

  for (let i = 0; i < items.length; i += maxParallel) {
    const batch = items.slice(i, i + maxParallel);
    const batchPromises = batch.map((item, batchIndex) => {
      const itemIndex = i + batchIndex;
      const taskContext = {
        ...request.context,
        _item: item,
        _itemIndex: itemIndex,
        _totalItems: items.length,
      };

      // Create a copy of map task with unique ID
      const itemTask: OrchestrationTask = {
        ...mapTask,
        id: `${mapTask.id}_${itemIndex}`,
        input: item,
      };

      return executeTask(itemTask, taskContext, request.userId);
    });

    const batchResults = await Promise.all(batchPromises);
    taskResults.push(...batchResults);

    for (const result of batchResults) {
      if (result.success) {
        mapResults.push(result.result);
      }
    }
  }

  // Check if map phase had any failures
  const mapFailures = taskResults.filter((r) => !r.success);
  if (mapFailures.length > 0) {
    const completedAt = new Date().toISOString();

    return {
      id: orchestrationId,
      status: 'failed',
      pattern: 'map-reduce',
      taskResults,
      error: `${mapFailures.length} map tasks failed`,
      durationMs: Date.now() - startTime,
      startedAt,
      completedAt,
    };
  }

  // Reduce phase: if reduce task is defined, combine results
  let aggregatedResult: unknown = mapResults;

  if (reduceTask) {
    const reduceContext = {
      ...request.context,
      _mapResults: mapResults,
      _resultCount: mapResults.length,
    };

    const reduceResult = await executeTask(reduceTask, reduceContext, request.userId);
    taskResults.push(reduceResult);

    if (reduceResult.success) {
      aggregatedResult = reduceResult.result;
    } else {
      const completedAt = new Date().toISOString();

      return {
        id: orchestrationId,
        status: 'failed',
        pattern: 'map-reduce',
        taskResults,
        error: `Reduce task failed: ${reduceResult.error}`,
        durationMs: Date.now() - startTime,
        startedAt,
        completedAt,
      };
    }
  }

  const completedAt = new Date().toISOString();

  const result: OrchestrationResult = {
    id: orchestrationId,
    status: 'completed',
    pattern: 'map-reduce',
    taskResults,
    aggregatedResult,
    durationMs: Date.now() - startTime,
    startedAt,
    completedAt,
  };

  // Store result
  await saveOrchestrationResult(result);

  logger.info(
    {
      orchestrationId,
      status: result.status,
      mapCount: mapResults.length,
      durationMs: result.durationMs,
    },
    'Map-reduce orchestration completed'
  );

  return result;
}

/**
 * Default configuration for self-critique pattern
 */
const DEFAULT_SELF_CRITIQUE_CONFIG: SelfCritiqueConfig = {
  maxIterations: 3,
  qualityCriteria: [
    {
      name: 'completeness',
      description: 'Output fully addresses the request',
      evaluationPrompt: 'Evaluate if the output completely addresses all aspects of the original request.',
      weight: 0.5,
      threshold: 0.7,
    },
    {
      name: 'clarity',
      description: 'Output is clear and well-structured',
      evaluationPrompt: 'Evaluate if the output is clear, well-organized, and easy to understand.',
      weight: 0.5,
      threshold: 0.7,
    },
  ],
  stopOnQualityThreshold: 0.8,
};

/**
 * Default configuration for discussion pattern
 * Note: consensusStrategy defaults to 'majority' since it doesn't require facilitatorAgentId
 */
const DEFAULT_DISCUSSION_CONFIG: DiscussionConfig = {
  maxRounds: 3,
  participants: [],
  consensusStrategy: 'majority',
  convergenceThreshold: 0.7,
};

/**
 * Validates and merges self-critique configuration with defaults
 */
function validateSelfCritiqueConfig(options: Record<string, unknown> | undefined): SelfCritiqueConfig {
  if (!options) {
    return { ...DEFAULT_SELF_CRITIQUE_CONFIG };
  }

  const config = options as unknown as Partial<SelfCritiqueConfig>;

  // Validate required fields if partially provided
  if (config.qualityCriteria !== undefined && !Array.isArray(config.qualityCriteria)) {
    throw new Error('self-critique pattern requires qualityCriteria to be an array');
  }

  if (config.maxIterations !== undefined && (typeof config.maxIterations !== 'number' || config.maxIterations < 1)) {
    throw new Error('self-critique pattern requires maxIterations to be a positive number');
  }

  return {
    maxIterations: config.maxIterations ?? DEFAULT_SELF_CRITIQUE_CONFIG.maxIterations,
    qualityCriteria: config.qualityCriteria ?? DEFAULT_SELF_CRITIQUE_CONFIG.qualityCriteria,
    evaluationPromptTemplate: config.evaluationPromptTemplate,
    improvementPromptTemplate: config.improvementPromptTemplate,
    stopOnQualityThreshold: config.stopOnQualityThreshold ?? DEFAULT_SELF_CRITIQUE_CONFIG.stopOnQualityThreshold,
  };
}

/**
 * Validates and merges discussion configuration with defaults
 */
function validateDiscussionConfig(options: Record<string, unknown> | undefined): DiscussionConfig {
  if (!options) {
    throw new Error(
      'discussion pattern requires options with at least participants array. ' +
      'Provide { participants: [{ agentId: string, role: string }], consensusStrategy: "facilitator" | "majority" | "unanimous" | "weighted" }'
    );
  }

  const config = options as unknown as Partial<DiscussionConfig>;

  // Validate participants - required field that cannot have a sensible default
  if (!config.participants || !Array.isArray(config.participants)) {
    throw new Error(
      'discussion pattern requires participants array in options. ' +
      'Provide { participants: [{ agentId: string, role: string }] }'
    );
  }

  if (config.participants.length === 0) {
    throw new Error('discussion pattern requires at least one participant');
  }

  // Validate each participant
  for (const participant of config.participants) {
    if (!participant.agentId || typeof participant.agentId !== 'string') {
      throw new Error('Each discussion participant must have an agentId string');
    }
    if (!participant.role || typeof participant.role !== 'string') {
      throw new Error('Each discussion participant must have a role string');
    }
  }

  if (config.maxRounds !== undefined && (typeof config.maxRounds !== 'number' || config.maxRounds < 1)) {
    throw new Error('discussion pattern requires maxRounds to be a positive number');
  }

  const consensusStrategy = config.consensusStrategy ?? DEFAULT_DISCUSSION_CONFIG.consensusStrategy;

  // Validate facilitator agent ID when using facilitator strategy
  if (consensusStrategy === 'facilitator' && !config.facilitatorAgentId) {
    throw new Error('discussion pattern with facilitator strategy requires facilitatorAgentId in options');
  }

  return {
    maxRounds: config.maxRounds ?? DEFAULT_DISCUSSION_CONFIG.maxRounds,
    participants: config.participants,
    discussionPromptTemplate: config.discussionPromptTemplate,
    contributionPromptTemplate: config.contributionPromptTemplate,
    synthesisPromptTemplate: config.synthesisPromptTemplate,
    consensusStrategy,
    facilitatorAgentId: config.facilitatorAgentId,
    convergenceThreshold: config.convergenceThreshold ?? DEFAULT_DISCUSSION_CONFIG.convergenceThreshold,
  };
}

/**
 * Main orchestration entry point
 */
export async function orchestrate(
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  switch (request.pattern) {
    case 'sequential':
      return await orchestrateSequential(request);
    case 'parallel':
      return await orchestrateParallel(request);
    case 'conditional':
      return await orchestrateConditional(request);
    case 'map-reduce':
      return await orchestrateMapReduce(request);
    case 'self-critique': {
      const selfCritiqueConfig = validateSelfCritiqueConfig(request.options);
      return await orchestrateSelfCritique(request, selfCritiqueConfig);
    }
    case 'discussion': {
      const discussionConfig = validateDiscussionConfig(request.options);
      return await orchestrateDiscussion(request, discussionConfig);
    }
    default:
      throw new Error(`Unknown orchestration pattern: ${request.pattern}`);
  }
}

/**
 * Executes self-critique pattern
 * Iteratively improves output based on quality criteria
 */
export async function orchestrateSelfCritique(
  request: OrchestrationRequest,
  config: SelfCritiqueConfig
): Promise<SelfCritiqueResult> {
  const service = await getSelfCritiqueService();
  return await service.executeSelfCritique(request, config);
}

/**
 * Executes discussion pattern
 * Coordinates multiple agents in collaborative dialogue
 */
export async function orchestrateDiscussion(
  request: OrchestrationRequest,
  config: DiscussionConfig
): Promise<DiscussionResult> {
  const service = await getDiscussionService();
  return await service.executeDiscussion(request, config);
}

/**
 * Token types for the safe expression parser
 */
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'UNDEFINED'
  | 'CONTEXT_REF'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'NOT'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean | null | undefined;
  raw: string;
}

/**
 * Tokenizes a condition expression into tokens
 * Only allows safe tokens: literals, context references, and operators
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  const whitespaceRegex = /\s+/y;
  const numberRegex = /-?\d+(\.\d+)?/y;
  const stringRegex = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/y;
  const booleanRegex = /true|false/y;
  const nullRegex = /null/y;
  const undefinedRegex = /undefined/y;
  const contextRefRegex = /context\.[a-zA-Z_][a-zA-Z0-9_.]*/y;
  const operatorRegex = /===|!==|==|!=|>=|<=|&&|\|\||>|</y;
  const parenRegex = /[()]/y;
  const notRegex = /!/y;

  while (pos < expression.length) {
    // Skip whitespace
    whitespaceRegex.lastIndex = pos;
    const wsMatch = whitespaceRegex.exec(expression);
    if (wsMatch) {
      pos = whitespaceRegex.lastIndex;
      continue;
    }

    // Number
    numberRegex.lastIndex = pos;
    const numMatch = numberRegex.exec(expression);
    if (numMatch) {
      tokens.push({
        type: 'NUMBER',
        value: parseFloat(numMatch[0]),
        raw: numMatch[0],
      });
      pos = numberRegex.lastIndex;
      continue;
    }

    // String
    stringRegex.lastIndex = pos;
    const strMatch = stringRegex.exec(expression);
    if (strMatch) {
      // Remove quotes and unescape
      const raw = strMatch[0];
      const inner = raw.slice(1, -1).replace(/\\(.)/g, '$1');
      tokens.push({
        type: 'STRING',
        value: inner,
        raw,
      });
      pos = stringRegex.lastIndex;
      continue;
    }

    // Boolean (must check before context ref to avoid matching 'true' in 'context.trueValue')
    booleanRegex.lastIndex = pos;
    const boolMatch = booleanRegex.exec(expression);
    if (boolMatch && !expression.slice(pos).match(/^(true|false)[a-zA-Z0-9_]/)) {
      tokens.push({
        type: 'BOOLEAN',
        value: boolMatch[0] === 'true',
        raw: boolMatch[0],
      });
      pos = booleanRegex.lastIndex;
      continue;
    }

    // Null
    nullRegex.lastIndex = pos;
    const nullMatch = nullRegex.exec(expression);
    if (nullMatch && !expression.slice(pos).match(/^null[a-zA-Z0-9_]/)) {
      tokens.push({
        type: 'NULL',
        value: null,
        raw: nullMatch[0],
      });
      pos = nullRegex.lastIndex;
      continue;
    }

    // Undefined
    undefinedRegex.lastIndex = pos;
    const undefMatch = undefinedRegex.exec(expression);
    if (undefMatch && !expression.slice(pos).match(/^undefined[a-zA-Z0-9_]/)) {
      tokens.push({
        type: 'UNDEFINED',
        value: undefined,
        raw: undefMatch[0],
      });
      pos = undefinedRegex.lastIndex;
      continue;
    }

    // Context reference
    contextRefRegex.lastIndex = pos;
    const ctxMatch = contextRefRegex.exec(expression);
    if (ctxMatch) {
      tokens.push({
        type: 'CONTEXT_REF',
        value: ctxMatch[0],
        raw: ctxMatch[0],
      });
      pos = contextRefRegex.lastIndex;
      continue;
    }

    // Operators (must check multi-char operators first)
    operatorRegex.lastIndex = pos;
    const opMatch = operatorRegex.exec(expression);
    if (opMatch) {
      tokens.push({
        type: 'OPERATOR',
        value: opMatch[0],
        raw: opMatch[0],
      });
      pos = operatorRegex.lastIndex;
      continue;
    }

    // Parentheses
    parenRegex.lastIndex = pos;
    const parenMatch = parenRegex.exec(expression);
    if (parenMatch) {
      tokens.push({
        type: parenMatch[0] === '(' ? 'LPAREN' : 'RPAREN',
        value: parenMatch[0],
        raw: parenMatch[0],
      });
      pos = parenRegex.lastIndex;
      continue;
    }

    // Not operator (single !)
    notRegex.lastIndex = pos;
    const notMatch = notRegex.exec(expression);
    if (notMatch) {
      tokens.push({
        type: 'NOT',
        value: '!',
        raw: notMatch[0],
      });
      pos = notRegex.lastIndex;
      continue;
    }

    // Unknown character - reject the expression for safety
    throw new Error(`Invalid character in condition at position ${pos}: "${expression[pos]}"`);
  }

  tokens.push({ type: 'EOF', value: null, raw: '' });
  return tokens;
}

/**
 * Safe expression parser using recursive descent
 * Only supports: comparisons, logical AND/OR, NOT, parentheses, and literals
 */
class SafeExpressionParser {
  private tokens: Token[];
  private pos: number;
  private context: Record<string, unknown>;

  constructor(tokens: Token[], context: Record<string, unknown>) {
    this.tokens = tokens;
    this.pos = 0;
    this.context = context;
  }

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: null, raw: '' };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type}`);
    }
    return this.advance();
  }

  /**
   * Parse the expression: OR has lowest precedence
   * expression := orExpr
   */
  parse(): boolean {
    const result = this.parseOr();
    if (this.current().type !== 'EOF') {
      throw new Error(`Unexpected token: ${this.current().raw}`);
    }
    return Boolean(result);
  }

  /**
   * orExpr := andExpr ('||' andExpr)*
   */
  private parseOr(): unknown {
    let left = this.parseAnd();

    while (this.current().type === 'OPERATOR' && this.current().value === '||') {
      this.advance();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }

    return left;
  }

  /**
   * andExpr := notExpr ('&&' notExpr)*
   */
  private parseAnd(): unknown {
    let left = this.parseNot();

    while (this.current().type === 'OPERATOR' && this.current().value === '&&') {
      this.advance();
      const right = this.parseNot();
      left = Boolean(left) && Boolean(right);
    }

    return left;
  }

  /**
   * notExpr := '!' notExpr | comparison
   */
  private parseNot(): unknown {
    if (this.current().type === 'NOT') {
      this.advance();
      return !this.parseNot();
    }
    return this.parseComparison();
  }

  /**
   * comparison := primary (comparisonOp primary)?
   */
  private parseComparison(): unknown {
    const left = this.parsePrimary();

    const comparisonOps = ['===', '!==', '==', '!=', '>', '>=', '<', '<='];
    if (this.current().type === 'OPERATOR' && comparisonOps.includes(this.current().value as string)) {
      const op = this.advance().value as string;
      const right = this.parsePrimary();

      switch (op) {
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '>':
          return (left as number) > (right as number);
        case '>=':
          return (left as number) >= (right as number);
        case '<':
          return (left as number) < (right as number);
        case '<=':
          return (left as number) <= (right as number);
        default:
          throw new Error(`Unknown operator: ${op}`);
      }
    }

    return left;
  }

  /**
   * primary := '(' expression ')' | literal | contextRef
   */
  private parsePrimary(): unknown {
    const token = this.current();

    switch (token.type) {
      case 'LPAREN': {
        this.advance();
        const result = this.parseOr();
        this.expect('RPAREN');
        return result;
      }
      case 'NUMBER':
      case 'STRING':
      case 'BOOLEAN':
      case 'NULL':
      case 'UNDEFINED':
        this.advance();
        return token.value;
      case 'CONTEXT_REF': {
        this.advance();
        // Extract path after 'context.'
        const path = (token.value as string).slice(8);
        return resolvePath(this.context, path);
      }
      default:
        throw new Error(`Unexpected token: ${token.raw || token.type}`);
    }
  }
}

/**
 * Evaluates a condition expression safely without using eval or Function
 * Supports: context references, comparisons, logical operators, and literals
 */
function evaluateCondition(
  condition: string,
  context: Record<string, unknown>
): boolean {
  try {
    const tokens = tokenize(condition);
    const parser = new SafeExpressionParser(tokens, context);
    return parser.parse();
  } catch (error) {
    logger.warn({ condition, error }, 'Condition evaluation failed');
    return false;
  }
}

/**
 * Resolves a nested path in an object
 */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Saves orchestration result to Redis
 */
async function saveOrchestrationResult(result: OrchestrationResult): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.set(
      `${ORCHESTRATION_STATE_PREFIX}${result.id}`,
      JSON.stringify(result),
      'EX',
      86400 // 24 hours
    );

    // Update metrics
    await recordOrchestrationMetric(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to save orchestration result');
  }
}

/**
 * Records orchestration metrics
 */
async function recordOrchestrationMetric(result: OrchestrationResult): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const metric = {
      id: result.id,
      pattern: result.pattern,
      status: result.status,
      durationMs: result.durationMs,
      taskCount: result.taskResults.length,
      successCount: result.taskResults.filter((r) => r.success).length,
      failCount: result.taskResults.filter((r) => !r.success).length,
      timestamp: new Date().toISOString(),
    };

    await redis.lpush(ORCHESTRATION_METRICS_KEY, JSON.stringify(metric));
    await redis.ltrim(ORCHESTRATION_METRICS_KEY, 0, 999); // Keep last 1000 metrics
  } catch (error) {
    // Ignore metrics errors
  }
}

/**
 * Gets orchestration result by ID
 */
export async function getOrchestrationResult(
  orchestrationId: string
): Promise<OrchestrationResult | null> {
  if (!isRedisConnected()) {
    return null;
  }

  const redis = getRedisClient();
  const data = await redis.get(`${ORCHESTRATION_STATE_PREFIX}${orchestrationId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as OrchestrationResult;
}

/**
 * Gets orchestration metrics
 */
export async function getOrchestrationMetrics(
  limit: number = 100
): Promise<{
  total: number;
  byPattern: Record<OrchestrationPattern, number>;
  byStatus: Record<OrchestrationStatus, number>;
  avgDurationMs: number;
  successRate: number;
  recentMetrics: Array<{
    id: string;
    pattern: OrchestrationPattern;
    status: OrchestrationStatus;
    durationMs: number;
    taskCount: number;
    timestamp: string;
  }>;
}> {
  if (!isRedisConnected()) {
    return {
      total: 0,
      byPattern: { sequential: 0, parallel: 0, conditional: 0, 'map-reduce': 0, 'self-critique': 0, discussion: 0 },
      byStatus: { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
      avgDurationMs: 0,
      successRate: 0,
      recentMetrics: [],
    };
  }

  const redis = getRedisClient();
  const metricsData = await redis.lrange(ORCHESTRATION_METRICS_KEY, 0, limit - 1);

  const metrics = metricsData.map((d) => JSON.parse(d) as {
    id: string;
    pattern: OrchestrationPattern;
    status: OrchestrationStatus;
    durationMs: number;
    taskCount: number;
    successCount: number;
    failCount: number;
    timestamp: string;
  });

  const byPattern: Record<OrchestrationPattern, number> = {
    sequential: 0,
    parallel: 0,
    conditional: 0,
    'map-reduce': 0,
    'self-critique': 0,
    discussion: 0,
  };

  const byStatus: Record<OrchestrationStatus, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  let totalDuration = 0;
  let successCount = 0;

  for (const metric of metrics) {
    byPattern[metric.pattern]++;
    byStatus[metric.status]++;
    totalDuration += metric.durationMs;
    if (metric.status === 'completed') {
      successCount++;
    }
  }

  return {
    total: metrics.length,
    byPattern,
    byStatus,
    avgDurationMs: metrics.length > 0 ? Math.round(totalDuration / metrics.length) : 0,
    successRate: metrics.length > 0 ? successCount / metrics.length : 0,
    recentMetrics: metrics.slice(0, 10).map((m) => ({
      id: m.id,
      pattern: m.pattern,
      status: m.status,
      durationMs: m.durationMs,
      taskCount: m.taskCount,
      timestamp: m.timestamp,
    })),
  };
}

/**
 * Chain helper - creates a sequential orchestration from a list of agent calls
 */
export async function chain(
  userId: string,
  ...steps: Array<{
    agentType: AgentType;
    prompt?: string;
    promptTemplateId?: string;
    variables?: Record<string, unknown>;
  }>
): Promise<OrchestrationResult> {
  const tasks: OrchestrationTask[] = steps.map((step, index) => ({
    id: `step_${index}`,
    agentType: step.agentType,
    prompt: step.prompt,
    promptTemplateId: step.promptTemplateId,
    variables: step.variables,
  }));

  return await orchestrateSequential({
    userId,
    pattern: 'sequential',
    tasks,
  });
}

/**
 * Parallel helper - executes multiple agents in parallel
 */
export async function parallel(
  userId: string,
  ...tasks: Array<{
    agentType: AgentType;
    prompt?: string;
    promptTemplateId?: string;
    variables?: Record<string, unknown>;
  }>
): Promise<OrchestrationResult> {
  const orchestrationTasks: OrchestrationTask[] = tasks.map((task, index) => ({
    id: `task_${index}`,
    agentType: task.agentType,
    prompt: task.prompt,
    promptTemplateId: task.promptTemplateId,
    variables: task.variables,
  }));

  return await orchestrateParallel({
    userId,
    pattern: 'parallel',
    tasks: orchestrationTasks,
  });
}

/**
 * Gets service configuration
 */
export function getServiceConfig(): OrchestrationServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<OrchestrationServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };
  logger.info('Orchestration service configuration updated');
}

export default {
  initializeOrchestrationService,
  orchestrate,
  orchestrateSequential,
  orchestrateParallel,
  orchestrateConditional,
  orchestrateMapReduce,
  orchestrateSelfCritique,
  orchestrateDiscussion,
  getOrchestrationResult,
  getOrchestrationMetrics,
  chain,
  parallel,
  getServiceConfig,
  updateServiceConfig,
};
