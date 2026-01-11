/**
 * Workflow Engine Service
 * Executes multi-step workflows with dependency management and parallel execution
 */

/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable no-case-declarations */
/* eslint-disable no-constant-condition */
/* eslint-disable eqeqeq */

import { EventEmitter } from 'events';

import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import { recordStepMetric, recordWorkflowMetric } from './agent-metrics.service.js';
import { getDefaultAgent, executeAgent } from './agent-registry.service.js';
import { interpolateTemplate } from './prompt-template.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';
import {
  createContext,
  getContext,
  setContextValue,
  getContextValue,
  createSnapshot,
} from './workflow-context.service.js';

import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowState,
  WorkflowStepState,
  WorkflowStatus,
  RetryPolicy,
} from '../types/agent.types.js';

// Redis key prefixes
const WORKFLOW_STATE_PREFIX = 'workflow:state:';
const WORKFLOW_QUEUE_KEY = 'workflow:queue';
const WORKFLOW_ACTIVE_KEY = 'workflow:active';
const WORKFLOW_USER_PREFIX = 'workflow:user:';

// Event emitter for workflow events
const workflowEmitter = new EventEmitter();

// Service configuration
interface WorkflowEngineServiceConfig {
  maxConcurrentWorkflows: number;
  workflowTimeoutMs: number;
  enableQueue: boolean;
  maxQueueSize: number;
  maxWorkflowSteps: number;
  enableParallelExecution: boolean;
  maxParallelSteps: number;
  defaultRetryPolicy: RetryPolicy;
}

let serviceConfig: WorkflowEngineServiceConfig = {
  maxConcurrentWorkflows: parseInt(process.env['AGENT_MAX_CONCURRENT_WORKFLOWS'] ?? '10', 10),
  workflowTimeoutMs: parseInt(process.env['AGENT_WORKFLOW_TIMEOUT_MS'] ?? '600000', 10),
  enableQueue: process.env['AGENT_ENABLE_QUEUE'] !== 'false',
  maxQueueSize: parseInt(process.env['AGENT_MAX_QUEUE_SIZE'] ?? '100', 10),
  maxWorkflowSteps: parseInt(process.env['AGENT_MAX_WORKFLOW_STEPS'] ?? '50', 10),
  enableParallelExecution: process.env['AGENT_ENABLE_PARALLEL_EXECUTION'] !== 'false',
  maxParallelSteps: parseInt(process.env['AGENT_MAX_PARALLEL_STEPS'] ?? '5', 10),
  defaultRetryPolicy: {
    maxRetries: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
  },
};

// Active workflow executions
const activeWorkflows = new Map<string, { cancel: () => void; paused: boolean }>();

// Queue worker state
let queueWorkerRunning = false;
let queueWorkerInterval: NodeJS.Timeout | null = null;

/**
 * Initializes the workflow engine service
 */
export function initializeWorkflowEngineService(
  config?: Partial<WorkflowEngineServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  if (serviceConfig.enableQueue) {
    startQueueWorker();
  }

  logger.info(
    {
      maxConcurrentWorkflows: serviceConfig.maxConcurrentWorkflows,
      workflowTimeoutMs: serviceConfig.workflowTimeoutMs,
      enableQueue: serviceConfig.enableQueue,
      enableParallelExecution: serviceConfig.enableParallelExecution,
    },
    'Workflow engine service initialized'
  );
}

/**
 * Generates a unique workflow execution ID
 */
function generateExecutionId(): string {
  return generateRequestId().replace('req_', 'wf_');
}

/**
 * Validates a workflow definition
 */
export function validateWorkflowDefinition(workflow: WorkflowDefinition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check step count
  if (workflow.steps.length === 0) {
    errors.push('Workflow must have at least one step');
  }

  if (workflow.steps.length > serviceConfig.maxWorkflowSteps) {
    errors.push(
      `Workflow has ${workflow.steps.length} steps, exceeding maximum of ${serviceConfig.maxWorkflowSteps}`
    );
  }

  // Check for duplicate step IDs
  const stepIds = new Set<string>();
  for (const step of workflow.steps) {
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step ID: ${step.id}`);
    }
    stepIds.add(step.id);
  }

  // Check dependencies reference valid steps
  for (const step of workflow.steps) {
    for (const depId of step.dependencies) {
      if (!stepIds.has(depId)) {
        errors.push(`Step "${step.id}" depends on non-existent step "${depId}"`);
      }
    }
  }

  // Check for circular dependencies
  const circularCheck = detectCircularDependencies(workflow.steps);
  if (circularCheck.hasCircular) {
    errors.push(`Circular dependency detected: ${circularCheck.cycle?.join(' -> ')}`);
  }

  // Validate each step
  for (const step of workflow.steps) {
    if (!step.promptTemplateId && !step.prompt) {
      errors.push(`Step "${step.id}" must have either promptTemplateId or prompt`);
    }

    if (!['claude', 'strudel', 'custom'].includes(step.agentType)) {
      errors.push(`Step "${step.id}" has invalid agent type: ${step.agentType}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detects circular dependencies in workflow steps
 */
function detectCircularDependencies(steps: WorkflowStep[]): {
  hasCircular: boolean;
  cycle?: string[];
} {
  const stepMap = new Map<string, WorkflowStep>();
  for (const step of steps) {
    stepMap.set(step.id, step);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(stepId: string): boolean {
    visited.add(stepId);
    recursionStack.add(stepId);
    path.push(stepId);

    const step = stepMap.get(stepId);
    if (step) {
      for (const depId of step.dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          // Found a cycle - complete the cycle by adding depId
          path.push(depId);
          return true;
        }
      }
    }

    path.pop();
    recursionStack.delete(stepId);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.id)) {
      if (dfs(step.id)) {
        return { hasCircular: true, cycle: path };
      }
    }
  }

  return { hasCircular: false };
}

/**
 * Performs topological sort on workflow steps
 */
function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const stepMap = new Map<string, WorkflowStep>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const step of steps) {
    stepMap.set(step.id, step);
    inDegree.set(step.id, step.dependencies.length);

    for (const depId of step.dependencies) {
      const dependents = adjacency.get(depId) ?? [];
      dependents.push(step.id);
      adjacency.set(depId, dependents);
    }
  }

  // Find all steps with no dependencies
  const queue: string[] = [];
  for (const step of steps) {
    if (step.dependencies.length === 0) {
      queue.push(step.id);
    }
  }

  const sorted: WorkflowStep[] = [];

  while (queue.length > 0) {
    const stepId = queue.shift()!;
    const step = stepMap.get(stepId);
    if (step) {
      sorted.push(step);

      const dependents = adjacency.get(stepId) ?? [];
      for (const depId of dependents) {
        const degree = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, degree);
        if (degree === 0) {
          queue.push(depId);
        }
      }
    }
  }

  return sorted;
}

/**
 * Gets steps that are ready to execute (all dependencies met)
 * Also marks steps as skipped if their dependencies have failed or been skipped
 * Returns an object with ready steps and a list of step IDs that were marked as skipped
 */
function getReadySteps(
  steps: WorkflowStep[],
  stepStates: Record<string, WorkflowStepState>,
  maxParallel: number
): { ready: WorkflowStep[]; skippedStepIds: string[] } {
  const ready: WorkflowStep[] = [];
  const skippedStepIds: string[] = [];

  for (const step of steps) {
    const state = stepStates[step.id];

    // Skip if already running, completed, failed, or skipped
    if (state?.status !== 'pending' && state?.status !== 'waiting') {
      continue;
    }

    // Check if all dependencies are completed
    const allDepsCompleted = step.dependencies.every((depId) => {
      const depState = stepStates[depId];
      return depState?.status === 'completed';
    });

    // Check if any dependency failed or was skipped (and continueOnError is false for that step)
    const anyDepFailed = step.dependencies.some((depId) => {
      const depState = stepStates[depId];
      const depStep = steps.find((s) => s.id === depId);
      // A dependency is considered failed if it failed or was skipped, and continueOnError is not set
      return (
        (depState?.status === 'failed' || depState?.status === 'skipped') &&
        !depStep?.continueOnError
      );
    });

    if (anyDepFailed) {
      // Mark step as skipped so the workflow can complete
      const stepState = stepStates[step.id];
      if (stepState) {
        stepState.status = 'skipped';
      }
      skippedStepIds.push(step.id);
      continue;
    }

    if (allDepsCompleted) {
      ready.push(step);
      if (ready.length >= maxParallel) {
        break;
      }
    }
  }

  return { ready, skippedStepIds };
}

/**
 * Calculates workflow progress percentage
 */
function calculateProgress(
  stepStates: Record<string, WorkflowStepState>,
  totalSteps: number
): number {
  if (totalSteps === 0) return 100;

  let completed = 0;
  let inProgress = 0;

  for (const state of Object.values(stepStates)) {
    if (state.status === 'completed' || state.status === 'skipped') {
      completed++;
    } else if (state.status === 'running') {
      inProgress++;
    }
  }

  // Each running step counts as 50% complete
  return Math.floor(((completed + inProgress * 0.5) / totalSteps) * 100);
}

/**
 * Saves workflow state to Redis
 */
async function saveWorkflowState(state: WorkflowState): Promise<void> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  await redis.set(
    `${WORKFLOW_STATE_PREFIX}${state.id}`,
    JSON.stringify(state),
    'EX',
    86400 // 24 hours
  );
}

/**
 * Gets workflow state from Redis
 */
export async function getWorkflowState(executionId: string): Promise<WorkflowState | null> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const data = await redis.get(`${WORKFLOW_STATE_PREFIX}${executionId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as WorkflowState;
}

/**
 * Emits a workflow event
 */
function emitWorkflowEvent(eventName: string, data: Record<string, unknown>): void {
  workflowEmitter.emit('workflow', {
    type: eventName,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Gets the workflow event emitter
 */
export function getWorkflowEmitter(): EventEmitter {
  return workflowEmitter;
}

/**
 * Executes a workflow step
 */
async function executeStep(
  step: WorkflowStep,
  executionId: string,
  workflow: WorkflowDefinition,
  state: WorkflowState
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const retryPolicy =
    step.retryPolicy ?? workflow.defaultRetryPolicy ?? serviceConfig.defaultRetryPolicy;
  let lastError: string | undefined;
  let attempts = 0;

  while (attempts <= retryPolicy.maxRetries) {
    try {
      // Resolve agent
      let agentId: string;
      if (step.agentId) {
        agentId = step.agentId;
      } else {
        // Use default agent for type
        const defaultAgent = await getDefaultAgent(step.agentType);
        if (!defaultAgent) {
          throw new Error(`No agent available for type: ${step.agentType}`);
        }
        agentId = defaultAgent.id;
      }

      // Resolve prompt
      let prompt: string;
      if (step.promptTemplateId) {
        // Get variables from context
        const variables: Record<string, unknown> = {};

        for (const input of step.inputs) {
          let value: unknown;

          switch (input.source) {
            case 'context':
              const contextResult = await getContextValue(executionId, input.value as string);
              value = contextResult.success ? contextResult.value : undefined;
              break;

            case 'step':
              if (input.stepId) {
                const stepState = state.steps[input.stepId];
                if (stepState?.result !== undefined) {
                  value = stepState.result;
                }
              }
              break;

            case 'literal':
              value = input.value;
              break;
          }

          variables[input.variable] = value;
        }

        // Interpolate template
        const interpolated = await interpolateTemplate(step.promptTemplateId, variables);
        if (!interpolated.success) {
          throw new Error(`Template interpolation failed: ${interpolated.error}`);
        }
        prompt = interpolated.content!;
      } else if (step.prompt) {
        prompt = step.prompt;
      } else {
        throw new Error(`Step "${step.id}" has no prompt or template`);
      }

      // Check condition if specified
      if (step.condition) {
        const context = await getContext(executionId);
        const conditionResult = evaluateCondition(step.condition, context?.data ?? {});
        if (!conditionResult) {
          return { success: true, result: { skipped: true, reason: 'Condition not met' } };
        }
      }

      // Execute agent
      const agentResult = await executeAgent(agentId, {
        prompt,
        context: {
          workflowId: workflow.id,
          executionId,
          stepId: step.id,
          userId: state.userId,
        },
        timeoutMs: step.timeoutMs ?? workflow.timeoutMs ?? serviceConfig.workflowTimeoutMs,
      });

      if (!agentResult.success) {
        throw new Error(agentResult.error ?? 'Agent execution failed');
      }

      return { success: true, result: agentResult.result };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      attempts++;

      if (attempts <= retryPolicy.maxRetries) {
        // Calculate delay with exponential backoff
        const delay = Math.min(
          retryPolicy.initialDelayMs * Math.pow(retryPolicy.backoffMultiplier, attempts - 1),
          retryPolicy.maxDelayMs
        );

        logger.warn(
          { executionId, stepId: step.id, attempts, delay, error: lastError },
          'Step failed, retrying'
        );

        // Update step state to show retry
        const stepState = state.steps[step.id];
        if (stepState) {
          stepState.retryCount = attempts;
          await saveWorkflowState(state);
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return { success: false, error: lastError };
}

// Token types for the expression parser
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'UNDEFINED'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean | null | undefined;
  raw: string;
}

// Allowed operators (comparison and logical only)
const ALLOWED_OPERATORS = new Set([
  '==',
  '===',
  '!=',
  '!==',
  '>',
  '<',
  '>=',
  '<=',
  '&&',
  '||',
  '!',
]);

/**
 * Tokenizes a condition expression
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expression.length) {
    // Skip whitespace
    if (/\s/.test(expression[pos] ?? '')) {
      pos++;
      continue;
    }

    const char = expression[pos] ?? '';

    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(', raw: '(' });
      pos++;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')', raw: ')' });
      pos++;
      continue;
    }

    // Multi-character operators (must check before single-char)
    const threeChar = expression.slice(pos, pos + 3);
    const twoChar = expression.slice(pos, pos + 2);

    if (threeChar === '===' || threeChar === '!==') {
      if (!ALLOWED_OPERATORS.has(threeChar)) {
        throw new Error(`Disallowed operator: ${threeChar}`);
      }
      tokens.push({ type: 'OPERATOR', value: threeChar, raw: threeChar });
      pos += 3;
      continue;
    }

    if (ALLOWED_OPERATORS.has(twoChar)) {
      tokens.push({ type: 'OPERATOR', value: twoChar, raw: twoChar });
      pos += 2;
      continue;
    }

    // Single character operators
    if (char === '!' || char === '>' || char === '<') {
      if (!ALLOWED_OPERATORS.has(char)) {
        throw new Error(`Disallowed operator: ${char}`);
      }
      tokens.push({ type: 'OPERATOR', value: char, raw: char });
      pos++;
      continue;
    }

    // Numbers (including negative and decimals)
    if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(expression[pos + 1] ?? ''))) {
      let numStr = '';
      if (char === '-') {
        numStr = '-';
        pos++;
      }
      while (pos < expression.length && /[0-9.]/.test(expression[pos] ?? '')) {
        numStr += expression[pos];
        pos++;
      }
      const num = parseFloat(numStr);
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${numStr}`);
      }
      tokens.push({ type: 'NUMBER', value: num, raw: numStr });
      continue;
    }

    // Strings (single or double quoted)
    if (char === '"' || char === "'") {
      const quote = char;
      pos++;
      let str = '';
      while (pos < expression.length && expression[pos] !== quote) {
        if (expression[pos] === '\\' && pos + 1 < expression.length) {
          pos++;
          const escaped = expression[pos];
          switch (escaped) {
            case 'n':
              str += '\n';
              break;
            case 't':
              str += '\t';
              break;
            case 'r':
              str += '\r';
              break;
            case '\\':
              str += '\\';
              break;
            case '"':
              str += '"';
              break;
            case "'":
              str += "'";
              break;
            default:
              str += escaped;
          }
        } else {
          str += expression[pos];
        }
        pos++;
      }
      if (pos >= expression.length) {
        throw new Error('Unterminated string');
      }
      pos++; // Skip closing quote
      tokens.push({ type: 'STRING', value: str, raw: `${quote}${str}${quote}` });
      continue;
    }

    // Identifiers (keywords like true, false, null, undefined, or context references)
    if (/[a-zA-Z_]/.test(char)) {
      let ident = '';
      while (pos < expression.length && /[a-zA-Z0-9_.]/.test(expression[pos] ?? '')) {
        ident += expression[pos];
        pos++;
      }

      // Check for keywords
      if (ident === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true, raw: ident });
      } else if (ident === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false, raw: ident });
      } else if (ident === 'null') {
        tokens.push({ type: 'NULL', value: null, raw: ident });
      } else if (ident === 'undefined') {
        tokens.push({ type: 'UNDEFINED', value: undefined, raw: ident });
      } else if (ident.startsWith('context.')) {
        // Context reference - will be resolved later
        tokens.push({ type: 'IDENTIFIER', value: ident, raw: ident });
      } else {
        throw new Error(`Unknown identifier: ${ident}. Only 'context.*' references are allowed.`);
      }
      continue;
    }

    // Disallowed characters
    throw new Error(`Unexpected character: ${char}`);
  }

  tokens.push({ type: 'EOF', value: null, raw: '' });
  return tokens;
}

/**
 * Expression parser using recursive descent
 * Grammar:
 *   expr       -> or_expr
 *   or_expr    -> and_expr ('||' and_expr)*
 *   and_expr   -> compare_expr ('&&' compare_expr)*
 *   compare_expr -> unary_expr (('==' | '!=' | '===' | '!==' | '>' | '<' | '>=' | '<=') unary_expr)?
 *   unary_expr -> '!' unary_expr | primary
 *   primary    -> LITERAL | IDENTIFIER | '(' expr ')'
 */
class ExpressionParser {
  private tokens: Token[];
  private pos: number;
  private contextData: Record<string, unknown>;

  constructor(tokens: Token[], contextData: Record<string, unknown>) {
    this.tokens = tokens;
    this.pos = 0;
    this.contextData = contextData;
  }

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: null, raw: '' };
  }

  private advance(): Token {
    const token = this.current();
    if (token.type !== 'EOF') {
      this.pos++;
    }
    return token;
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.current();
    if (token.type === type && (value === undefined || token.value === value)) {
      return true;
    }
    return false;
  }

  parse(): unknown {
    const result = this.orExpr();
    if (this.current().type !== 'EOF') {
      throw new Error(`Unexpected token: ${this.current().raw}`);
    }
    return result;
  }

  private orExpr(): unknown {
    let left = this.andExpr();
    while (this.match('OPERATOR', '||')) {
      this.advance();
      const right = this.andExpr();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private andExpr(): unknown {
    let left = this.compareExpr();
    while (this.match('OPERATOR', '&&')) {
      this.advance();
      const right = this.compareExpr();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private compareExpr(): unknown {
    const left = this.unaryExpr();

    const compOps = ['==', '===', '!=', '!==', '>', '<', '>=', '<='];
    if (this.current().type === 'OPERATOR' && compOps.includes(this.current().value as string)) {
      const op = this.advance().value as string;
      const right = this.unaryExpr();

      switch (op) {
        case '==':
          return left == right;
        case '===':
          return left === right;
        case '!=':
          return left != right;
        case '!==':
          return left !== right;
        case '>':
          return (left as number) > (right as number);
        case '<':
          return (left as number) < (right as number);
        case '>=':
          return (left as number) >= (right as number);
        case '<=':
          return (left as number) <= (right as number);
        default:
          throw new Error(`Unknown operator: ${op}`);
      }
    }

    return left;
  }

  private unaryExpr(): unknown {
    if (this.match('OPERATOR', '!')) {
      this.advance();
      const operand = this.unaryExpr();
      return !operand;
    }
    return this.primary();
  }

  private primary(): unknown {
    const token = this.current();

    switch (token.type) {
      case 'NUMBER':
      case 'STRING':
      case 'BOOLEAN':
      case 'NULL':
      case 'UNDEFINED':
        this.advance();
        return token.value;

      case 'IDENTIFIER': {
        this.advance();
        // Resolve context reference
        const path = (token.value as string).replace(/^context\./, '');
        return resolvePath(this.contextData, path);
      }

      case 'LPAREN': {
        this.advance();
        const expr = this.orExpr();
        if (!this.match('RPAREN')) {
          throw new Error('Expected closing parenthesis');
        }
        this.advance();
        return expr;
      }

      default:
        throw new Error(`Unexpected token: ${token.raw || token.type}`);
    }
  }
}

/**
 * Evaluates a condition expression using a sandboxed parser
 * Supports: ==, !=, ===, !==, >, <, >=, <=, &&, ||, !, true, false, null, undefined, numbers, strings
 * Context references: context.path.to.value
 */
function evaluateCondition(condition: string, contextData: Record<string, unknown>): boolean {
  try {
    // Tokenize the expression
    const tokens = tokenize(condition);

    // Parse and evaluate
    const parser = new ExpressionParser(tokens, contextData);
    const result = parser.parse();

    return Boolean(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(
      { condition, error: errorMessage },
      'Condition evaluation failed, defaulting to false'
    );
    // Default to false for security - don't execute steps with invalid conditions
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
 * Executes a workflow
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  userId: string,
  initialContext?: Record<string, unknown>,
  priority: number = 0
): Promise<WorkflowState> {
  // Validate workflow
  const validation = validateWorkflowDefinition(workflow);
  if (!validation.valid) {
    throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
  }

  const executionId = generateExecutionId();
  const now = new Date().toISOString();

  // Initialize step states
  const stepStates: Record<string, WorkflowStepState> = {};
  for (const step of workflow.steps) {
    stepStates[step.id] = {
      stepId: step.id,
      status: 'pending',
      retryCount: 0,
    };
  }

  // Create initial state
  const state: WorkflowState = {
    id: executionId,
    workflowId: workflow.id,
    userId,
    status: 'pending',
    steps: stepStates,
    currentSteps: [],
    createdAt: now,
    progress: 0,
  };

  // Check concurrency
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const activeCount = await redis.scard(WORKFLOW_ACTIVE_KEY);

  if (activeCount >= serviceConfig.maxConcurrentWorkflows) {
    if (serviceConfig.enableQueue) {
      // Check queue size limit before enqueueing
      const currentQueueLength = await redis.llen(WORKFLOW_QUEUE_KEY);
      if (currentQueueLength >= serviceConfig.maxQueueSize) {
        throw new Error(
          `Workflow queue is full (${currentQueueLength}/${serviceConfig.maxQueueSize}). Please try again later.`
        );
      }

      // Queue the workflow
      state.status = 'queued';
      const queuePosition = await redis.rpush(
        WORKFLOW_QUEUE_KEY,
        JSON.stringify({ executionId, workflow, userId, initialContext, priority })
      );
      state.queuePosition = queuePosition;

      await saveWorkflowState(state);
      await redis.sadd(`${WORKFLOW_USER_PREFIX}${userId}`, executionId);

      emitWorkflowEvent('queued', { executionId, queuePosition });

      logger.info({ executionId, queuePosition }, 'Workflow queued');

      return state;
    } else {
      throw new Error('Maximum concurrent workflows reached');
    }
  }

  // Mark as active
  await redis.sadd(WORKFLOW_ACTIVE_KEY, executionId);
  await redis.sadd(`${WORKFLOW_USER_PREFIX}${userId}`, executionId);

  // Start execution
  state.status = 'running';
  state.startedAt = new Date().toISOString();
  await saveWorkflowState(state);

  // Create context
  const contextData = {
    ...workflow.initialContext,
    ...initialContext,
    _workflow: {
      id: workflow.id,
      executionId,
      userId,
      startedAt: state.startedAt,
    },
  };
  await createContext(executionId, contextData);

  emitWorkflowEvent('started', {
    executionId,
    workflowId: workflow.id,
    totalSteps: workflow.steps.length,
  });

  // Execute workflow asynchronously
  void runWorkflowExecution(executionId, workflow, state);

  return state;
}

/**
 * Runs the actual workflow execution
 */
async function runWorkflowExecution(
  executionId: string,
  workflow: WorkflowDefinition,
  state: WorkflowState
): Promise<void> {
  let cancelled = false;
  let timedOut = false;

  // Setup cancellation handler
  activeWorkflows.set(executionId, {
    cancel: () => {
      cancelled = true;
    },
    paused: false,
  });

  const redis = getRedisClient();

  // Setup workflow timeout
  const workflowTimeoutMs = workflow.timeoutMs ?? serviceConfig.workflowTimeoutMs;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    logger.warn({ executionId, workflowTimeoutMs }, 'Workflow timeout expired');
  }, workflowTimeoutMs);

  try {
    // Sort steps topologically
    const sortedSteps = topologicalSort(workflow.steps);

    // Execute steps
    while (true) {
      // Check for timeout
      if (timedOut) {
        state.status = 'failed';
        state.error = `Workflow timed out after ${workflowTimeoutMs}ms`;
        state.completedAt = new Date().toISOString();

        const timeoutCompletedSteps = Object.values(state.steps).filter(
          (s) => s.status === 'completed'
        ).length;
        const timeoutFailedSteps = Object.values(state.steps).filter(
          (s) => s.status === 'failed'
        ).length;
        const timeoutDurationMs = state.startedAt
          ? Date.parse(state.completedAt) - Date.parse(state.startedAt)
          : 0;

        // Record workflow timeout metric
        void recordWorkflowMetric({
          executionId,
          workflowId: workflow.id,
          userId: state.userId,
          status: 'failed',
          durationMs: timeoutDurationMs,
          stepCount: workflow.steps.length,
          completedSteps: timeoutCompletedSteps,
          failedSteps: timeoutFailedSteps,
        });

        emitWorkflowEvent('failed', {
          executionId,
          error: state.error,
          failedStepId: undefined,
          completedSteps: timeoutCompletedSteps,
          totalSteps: workflow.steps.length,
        });

        logger.error(
          { executionId, workflowTimeoutMs, completedSteps: timeoutCompletedSteps },
          'Workflow failed due to timeout'
        );
        break;
      }

      // Check for cancellation
      if (cancelled || activeWorkflows.get(executionId)?.paused) {
        if (cancelled) {
          state.status = 'cancelled';
          state.completedAt = new Date().toISOString();

          const cancelledCompletedSteps = Object.values(state.steps).filter(
            (s) => s.status === 'completed'
          ).length;
          const cancelledFailedSteps = Object.values(state.steps).filter(
            (s) => s.status === 'failed'
          ).length;
          const cancelDurationMs = state.startedAt
            ? Date.parse(state.completedAt) - Date.parse(state.startedAt)
            : 0;

          // Record workflow cancellation metric
          void recordWorkflowMetric({
            executionId,
            workflowId: workflow.id,
            userId: state.userId,
            status: 'cancelled',
            durationMs: cancelDurationMs,
            stepCount: workflow.steps.length,
            completedSteps: cancelledCompletedSteps,
            failedSteps: cancelledFailedSteps,
          });

          emitWorkflowEvent('cancelled', {
            executionId,
            completedSteps: cancelledCompletedSteps,
          });
        }
        break;
      }

      // Check for paused state
      const activeState = activeWorkflows.get(executionId);
      if (activeState?.paused) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Get ready steps
      const maxParallel = serviceConfig.enableParallelExecution
        ? Math.min(serviceConfig.maxParallelSteps, workflow.maxParallelSteps ?? 5)
        : 1;

      const { ready: readySteps, skippedStepIds } = getReadySteps(
        sortedSteps,
        state.steps,
        maxParallel
      );

      // If any steps were skipped due to failed dependencies, persist the updated state
      if (skippedStepIds.length > 0) {
        await saveWorkflowState(state);
      }

      // Check if workflow is complete
      if (readySteps.length === 0) {
        // Check if all steps are done
        const allDone = Object.values(state.steps).every(
          (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
        );

        if (allDone) {
          const anyFailed = Object.values(state.steps).some((s) => s.status === 'failed');
          state.status = anyFailed ? 'failed' : 'completed';
          state.completedAt = new Date().toISOString();
          state.progress = 100;

          break;
        }

        // Steps are still running, wait
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      // Execute ready steps
      state.currentSteps = readySteps.map((s) => s.id);
      await saveWorkflowState(state);

      // Execute in parallel if enabled
      const executions = readySteps.map(async (step) => {
        const stepStartTime = Date.now();
        const currentStepState = state.steps[step.id];

        if (!currentStepState) {
          return;
        }

        // Update step state to running
        currentStepState.status = 'running';
        currentStepState.startedAt = new Date().toISOString();
        await saveWorkflowState(state);

        emitWorkflowEvent('step:started', {
          executionId,
          stepId: step.id,
          stepName: step.name,
          agentType: step.agentType,
        });

        try {
          // Execute step
          const result = await executeStep(step, executionId, workflow, state);

          const stepDuration = Date.now() - stepStartTime;
          currentStepState.durationMs = stepDuration;

          if (result.success) {
            currentStepState.status = 'completed';
            currentStepState.result = result.result;
            currentStepState.completedAt = new Date().toISOString();

            // Store result in context
            for (const output of step.outputs) {
              // Derive value from result using output.field, fall back to whole result if field not specified or not found
              let value: unknown = result.result;
              if (output.field && result.result !== null && typeof result.result === 'object') {
                const fieldValue = resolvePath(
                  result.result as Record<string, unknown>,
                  output.field
                );
                if (fieldValue !== undefined) {
                  value = fieldValue;
                }
              }
              await setContextValue(executionId, output.contextPath, value);
            }

            // Record step metric
            void recordStepMetric({
              executionId,
              stepId: step.id,
              agentType: step.agentType,
              agentId: step.agentId ?? '',
              status: 'completed',
              durationMs: stepDuration,
              retryCount: currentStepState.retryCount ?? 0,
            });

            emitWorkflowEvent('step:completed', {
              executionId,
              stepId: step.id,
              result: result.result,
              durationMs: stepDuration,
            });
          } else {
            currentStepState.status = 'failed';
            currentStepState.error = result.error;
            currentStepState.completedAt = new Date().toISOString();

            // Record step metric
            void recordStepMetric({
              executionId,
              stepId: step.id,
              agentType: step.agentType,
              agentId: step.agentId ?? '',
              status: 'failed',
              durationMs: stepDuration,
              retryCount: currentStepState.retryCount ?? 0,
            });

            emitWorkflowEvent('step:failed', {
              executionId,
              stepId: step.id,
              error: result.error,
              willContinue: step.continueOnError ?? false,
            });

            // If not continuing on error, mark dependent steps as skipped
            if (!step.continueOnError) {
              for (const otherStep of sortedSteps) {
                if (otherStep.dependencies.includes(step.id)) {
                  const otherStepState = state.steps[otherStep.id];
                  if (otherStepState?.status === 'pending') {
                    otherStepState.status = 'skipped';
                  }
                }
              }
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const stepDuration = Date.now() - stepStartTime;

          currentStepState.status = 'failed';
          currentStepState.error = errorMessage;
          currentStepState.completedAt = new Date().toISOString();
          currentStepState.durationMs = stepDuration;

          // Record step metric
          void recordStepMetric({
            executionId,
            stepId: step.id,
            agentType: step.agentType,
            agentId: step.agentId ?? '',
            status: 'failed',
            durationMs: stepDuration,
            retryCount: currentStepState.retryCount ?? 0,
          });

          emitWorkflowEvent('step:failed', {
            executionId,
            stepId: step.id,
            error: errorMessage,
            willContinue: step.continueOnError ?? false,
          });
        }

        // Update progress
        state.progress = calculateProgress(state.steps, workflow.steps.length);
        await saveWorkflowState(state);
      });

      // Wait for current batch to complete
      await Promise.all(executions);
    }

    // Final save
    await saveWorkflowState(state);

    // Record workflow metrics and emit completion event
    const completedSteps = Object.values(state.steps).filter(
      (s) => s.status === 'completed'
    ).length;
    const failedSteps = Object.values(state.steps).filter((s) => s.status === 'failed').length;
    const workflowDurationMs =
      state.completedAt && state.startedAt
        ? Date.parse(state.completedAt) - Date.parse(state.startedAt)
        : 0;

    if (state.status === 'completed') {
      const context = await getContext(executionId);

      // Record workflow completion metric
      void recordWorkflowMetric({
        executionId,
        workflowId: workflow.id,
        userId: state.userId,
        status: 'completed',
        durationMs: workflowDurationMs,
        stepCount: workflow.steps.length,
        completedSteps,
        failedSteps,
      });

      emitWorkflowEvent('completed', {
        executionId,
        results: context?.data ?? {},
        durationMs: workflowDurationMs,
        stepResults: state.steps,
      });
    } else if (state.status === 'failed') {
      const failedStep = Object.values(state.steps).find((s) => s.status === 'failed');

      // Record workflow failure metric
      void recordWorkflowMetric({
        executionId,
        workflowId: workflow.id,
        userId: state.userId,
        status: 'failed',
        durationMs: workflowDurationMs,
        stepCount: workflow.steps.length,
        completedSteps,
        failedSteps,
      });

      emitWorkflowEvent('failed', {
        executionId,
        error: failedStep?.error ?? 'Unknown error',
        failedStepId: failedStep?.stepId,
        completedSteps,
        totalSteps: workflow.steps.length,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ executionId, error: errorMessage }, 'Workflow execution failed');

    state.status = 'failed';
    state.error = errorMessage;
    state.completedAt = new Date().toISOString();
    await saveWorkflowState(state);

    const catchCompletedSteps = Object.values(state.steps).filter(
      (s) => s.status === 'completed'
    ).length;
    const catchFailedSteps = Object.values(state.steps).filter((s) => s.status === 'failed').length;
    const catchDurationMs = state.startedAt
      ? Date.parse(state.completedAt) - Date.parse(state.startedAt)
      : 0;

    // Record workflow failure metric
    void recordWorkflowMetric({
      executionId,
      workflowId: workflow.id,
      userId: state.userId,
      status: 'failed',
      durationMs: catchDurationMs,
      stepCount: workflow.steps.length,
      completedSteps: catchCompletedSteps,
      failedSteps: catchFailedSteps,
    });

    emitWorkflowEvent('failed', {
      executionId,
      error: errorMessage,
      completedSteps: catchCompletedSteps,
      totalSteps: workflow.steps.length,
    });
  } finally {
    // Clean up timeout
    clearTimeout(timeoutHandle);

    // Clean up active tracking
    activeWorkflows.delete(executionId);
    await redis.srem(WORKFLOW_ACTIVE_KEY, executionId);

    // Process next queued workflow
    if (serviceConfig.enableQueue) {
      void processQueuedWorkflow();
    }
  }
}

/**
 * Cancels a workflow
 */
export async function cancelWorkflow(executionId: string): Promise<boolean> {
  const active = activeWorkflows.get(executionId);

  if (active) {
    active.cancel();
    return true;
  }

  // Check if queued
  if (!isRedisConnected()) {
    return false;
  }

  const redis = getRedisClient();
  const queueItems = await redis.lrange(WORKFLOW_QUEUE_KEY, 0, -1);

  for (let i = 0; i < queueItems.length; i++) {
    const queueItem = queueItems[i];
    if (!queueItem) continue;
    const item = JSON.parse(queueItem) as { executionId: string };
    if (item.executionId === executionId) {
      await redis.lrem(WORKFLOW_QUEUE_KEY, 1, queueItem);

      const state = await getWorkflowState(executionId);
      if (state) {
        state.status = 'cancelled';
        state.completedAt = new Date().toISOString();
        await saveWorkflowState(state);
      }

      emitWorkflowEvent('cancelled', { executionId, completedSteps: 0 });

      return true;
    }
  }

  return false;
}

/**
 * Pauses a workflow
 */
export async function pauseWorkflow(executionId: string): Promise<boolean> {
  const active = activeWorkflows.get(executionId);

  if (active && !active.paused) {
    active.paused = true;

    const state = await getWorkflowState(executionId);
    if (state) {
      state.status = 'paused';
      await saveWorkflowState(state);
    }

    // Create snapshot for recovery
    await createSnapshot(executionId, 'pause');

    logger.info({ executionId }, 'Workflow paused');
    return true;
  }

  return false;
}

/**
 * Resumes a paused workflow
 */
export async function resumeWorkflow(executionId: string): Promise<boolean> {
  const active = activeWorkflows.get(executionId);

  if (active?.paused) {
    active.paused = false;

    const state = await getWorkflowState(executionId);
    if (state) {
      state.status = 'running';
      await saveWorkflowState(state);
    }

    logger.info({ executionId }, 'Workflow resumed');
    return true;
  }

  return false;
}

/**
 * Gets workflow status
 */
export async function getWorkflowStatus(executionId: string): Promise<WorkflowState | null> {
  return await getWorkflowState(executionId);
}

/**
 * Lists workflows for a user
 */
export async function listWorkflows(
  userId: string,
  options?: {
    status?: WorkflowStatus;
    page?: number;
    pageSize?: number;
  }
): Promise<{
  workflows: WorkflowState[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;

  const executionIds = await redis.smembers(`${WORKFLOW_USER_PREFIX}${userId}`);

  const workflows: WorkflowState[] = [];
  for (const id of executionIds) {
    const state = await getWorkflowState(id);
    if (state) {
      if (!options?.status || state.status === options.status) {
        workflows.push(state);
      }
    }
  }

  // Sort by createdAt (newest first)
  workflows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Paginate
  const total = workflows.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const paginatedWorkflows = workflows.slice(start, start + pageSize);

  return {
    workflows: paginatedWorkflows,
    total,
    page,
    pageSize,
    totalPages,
  };
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
    void processQueuedWorkflow();
  }, 1000);

  logger.info('Workflow queue worker started');
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

  logger.info('Workflow queue worker stopped');
}

/**
 * Processes the next queued workflow
 */
async function processQueuedWorkflow(): Promise<void> {
  if (!serviceConfig.enableQueue || !isRedisConnected()) {
    return;
  }

  const redis = getRedisClient();

  try {
    const activeCount = await redis.scard(WORKFLOW_ACTIVE_KEY);

    if (activeCount >= serviceConfig.maxConcurrentWorkflows) {
      return;
    }

    // Get next from queue
    const item = await redis.lpop(WORKFLOW_QUEUE_KEY);
    if (!item) {
      return;
    }

    const { executionId, workflow, userId, initialContext } = JSON.parse(item) as {
      executionId: string;
      workflow: WorkflowDefinition;
      userId: string;
      initialContext?: Record<string, unknown>;
    };

    // Get existing state
    const state = await getWorkflowState(executionId);
    if (state?.status !== 'queued') {
      return;
    }

    // Mark as active
    await redis.sadd(WORKFLOW_ACTIVE_KEY, executionId);

    // Update state
    state.status = 'running';
    state.startedAt = new Date().toISOString();
    state.queuePosition = undefined;
    await saveWorkflowState(state);

    // Create context
    const contextData = {
      ...workflow.initialContext,
      ...initialContext,
      _workflow: {
        id: workflow.id,
        executionId,
        userId,
        startedAt: state.startedAt,
      },
    };
    await createContext(executionId, contextData);

    emitWorkflowEvent('started', {
      executionId,
      workflowId: workflow.id,
      totalSteps: workflow.steps.length,
    });

    // Run execution
    void runWorkflowExecution(executionId, workflow, state);

    logger.info({ executionId }, 'Queued workflow started');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Error processing queued workflow');
  }
}

/**
 * Gets engine statistics
 */
export async function getEngineStats(): Promise<{
  activeWorkflows: number;
  queuedWorkflows: number;
  maxConcurrent: number;
}> {
  if (!isRedisConnected()) {
    return {
      activeWorkflows: activeWorkflows.size,
      queuedWorkflows: 0,
      maxConcurrent: serviceConfig.maxConcurrentWorkflows,
    };
  }

  const redis = getRedisClient();
  const activeCount = await redis.scard(WORKFLOW_ACTIVE_KEY);
  const queueLength = await redis.llen(WORKFLOW_QUEUE_KEY);

  return {
    activeWorkflows: activeCount,
    queuedWorkflows: queueLength,
    maxConcurrent: serviceConfig.maxConcurrentWorkflows,
  };
}

/**
 * Gets service configuration
 */
export function getServiceConfig(): WorkflowEngineServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<WorkflowEngineServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };

  if (config.enableQueue !== undefined) {
    if (serviceConfig.enableQueue) {
      startQueueWorker();
    } else {
      stopQueueWorker();
    }
  }

  logger.info('Workflow engine service configuration updated');
}

export default {
  initializeWorkflowEngineService,
  validateWorkflowDefinition,
  executeWorkflow,
  cancelWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
  listWorkflows,
  getWorkflowState,
  getWorkflowEmitter,
  getEngineStats,
  stopQueueWorker,
  getServiceConfig,
  updateServiceConfig,
};
