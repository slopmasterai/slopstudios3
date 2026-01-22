/**
 * Self-Critique Service
 * Implements iterative self-improvement pattern for agent outputs
 */

import { EventEmitter } from 'events';
import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import {
  getDefaultAgent,
  getAgent,
  executeAgent,
} from './agent-registry.service.js';
import { recordAgentMetric, recordCritiqueMetric, getSelfCritiqueMetrics } from './agent-metrics.service.js';
import {
  interpolateTemplate,
  getTemplate,
  BUILTIN_TEMPLATE_IDS,
} from './prompt-template.service.js';
import {
  createContext,
  setContextValue,
  clearContext,
} from './workflow-context.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  OrchestrationRequest,
  OrchestrationTask,
  OrchestrationTaskResult,
  SelfCritiqueConfig,
  SelfCritiqueResult,
  CritiqueIteration,
  CritiqueEvaluation,
  QualityCriterion,
} from '../types/agent.types.js';

// Redis key prefixes
const CRITIQUE_STATE_PREFIX = 'critique:state:';
const CRITIQUE_ITERATIONS_PREFIX = 'critique:iterations:';

// Event emitter for critique events
export const critiqueEvents = new EventEmitter();

// Service configuration
interface SelfCritiqueServiceConfig {
  defaultMaxIterations: number;
  defaultQualityThreshold: number;
  defaultTimeoutMs: number;
  evaluationTimeoutMs: number;
}

let serviceConfig: SelfCritiqueServiceConfig = {
  defaultMaxIterations: parseInt(process.env['AGENT_CRITIQUE_MAX_ITERATIONS'] ?? '5', 10),
  defaultQualityThreshold: parseFloat(process.env['AGENT_CRITIQUE_DEFAULT_THRESHOLD'] ?? '0.8'),
  defaultTimeoutMs: parseInt(process.env['AGENT_CRITIQUE_TIMEOUT_MS'] ?? '600000', 10),
  evaluationTimeoutMs: 60000, // 1 minute for evaluation
};

// Default prompt templates
const DEFAULT_EVALUATION_TEMPLATE = `You are evaluating the quality of an output based on specific criteria.

Output to evaluate:
{{output}}

Evaluate the output based on these criteria:
{{criteria}}

For each criterion, provide:
1. A score from 0 to 1 (where 0 is poor and 1 is excellent)
2. Specific feedback explaining the score
3. Concrete suggestions for improvement

Respond with a JSON object in this exact format:
{
  "criteriaScores": {
    "criterion_name": 0.85
  },
  "feedback": "Overall assessment and key points...",
  "suggestions": ["suggestion 1", "suggestion 2"]
}`;

const DEFAULT_IMPROVEMENT_TEMPLATE = `You are improving content based on critique feedback.

Original output:
{{output}}

Critique feedback:
{{feedback}}

Specific suggestions for improvement:
{{suggestions}}

Quality scores from previous evaluation:
{{scores}}

Generate an improved version that addresses all the feedback and suggestions.
Focus on the areas with the lowest scores while maintaining the strengths.

Provide only the improved content without any meta-commentary.`;

/**
 * Gets the evaluation template content, preferring registered template with fallback
 */
async function getEvaluationTemplateContent(): Promise<string> {
  try {
    const template = await getTemplate(BUILTIN_TEMPLATE_IDS.SELF_CRITIQUE_EVALUATION);
    if (template) {
      return template.content;
    }
  } catch (error) {
    logger.debug({ error }, 'Failed to get evaluation template from registry, using default');
  }
  return DEFAULT_EVALUATION_TEMPLATE;
}

/**
 * Gets the improvement template content, preferring registered template with fallback
 */
async function getImprovementTemplateContent(): Promise<string> {
  try {
    const template = await getTemplate(BUILTIN_TEMPLATE_IDS.SELF_CRITIQUE_IMPROVEMENT);
    if (template) {
      return template.content;
    }
  } catch (error) {
    logger.debug({ error }, 'Failed to get improvement template from registry, using default');
  }
  return DEFAULT_IMPROVEMENT_TEMPLATE;
}

/**
 * Initializes the self-critique service
 */
export function initializeSelfCritiqueService(
  config?: Partial<SelfCritiqueServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  logger.info(
    {
      defaultMaxIterations: serviceConfig.defaultMaxIterations,
      defaultQualityThreshold: serviceConfig.defaultQualityThreshold,
    },
    'Self-critique service initialized'
  );
}

/**
 * Generates a unique critique execution ID
 */
function generateCritiqueId(): string {
  return generateRequestId().replace('req_', 'critique_');
}

/**
 * Formats criteria for evaluation prompt
 */
function formatCriteriaForPrompt(criteria: QualityCriterion[]): string {
  return criteria
    .map((c, i) => `${i + 1}. ${c.name}: ${c.description}\n   Evaluation: ${c.evaluationPrompt}`)
    .join('\n\n');
}

/**
 * Calculates weighted overall score from criteria scores
 */
export function calculateOverallScore(
  criteriaScores: Record<string, number>,
  criteria: QualityCriterion[]
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const criterion of criteria) {
    const score = criteriaScores[criterion.name] ?? 0;
    weightedSum += score * criterion.weight;
    totalWeight += criterion.weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Checks if all criteria meet their thresholds
 */
function checkThresholdsMet(
  criteriaScores: Record<string, number>,
  criteria: QualityCriterion[],
  overallThreshold?: number
): boolean {
  // Check individual criterion thresholds
  for (const criterion of criteria) {
    const score = criteriaScores[criterion.name] ?? 0;
    if (score < criterion.threshold) {
      return false;
    }
  }

  // Check overall threshold if specified
  if (overallThreshold !== undefined) {
    const overallScore = calculateOverallScore(criteriaScores, criteria);
    if (overallScore < overallThreshold) {
      return false;
    }
  }

  return true;
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
  userId: string = 'system',
  timeoutMs?: number
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
      timeoutMs: timeoutMs ?? task.timeoutMs ?? serviceConfig.defaultTimeoutMs,
    });

    const taskDurationMs = Date.now() - startTime;

    // Record agent metric
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

    return {
      taskId: task.id,
      success: false,
      error: errorMessage,
      durationMs: taskDurationMs,
    };
  }
}

/**
 * Evaluates output against quality criteria
 */
export async function evaluateOutput(
  output: unknown,
  criteria: QualityCriterion[],
  agentId: string,
  userId: string,
  customTemplate?: string
): Promise<CritiqueEvaluation> {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  const criteriaStr = formatCriteriaForPrompt(criteria);

  // Build evaluation prompt using custom template if provided, otherwise use registered template
  const template = customTemplate ?? await getEvaluationTemplateContent();
  const evaluationPrompt = template
    .replace('{{output}}', outputStr)
    .replace('{{criteria}}', criteriaStr);

  // Execute evaluation
  const result = await executeAgent(agentId, {
    prompt: evaluationPrompt,
    context: { userId, type: 'evaluation' },
    timeoutMs: serviceConfig.evaluationTimeoutMs,
  });

  if (!result.success) {
    throw new Error(`Evaluation failed: ${result.error}`);
  }

  // Parse evaluation response
  let evaluation: CritiqueEvaluation;
  try {
    const resultStr = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);

    // Try to extract JSON from the response
    const jsonMatch = resultStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in evaluation response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const criteriaScores = parsed.criteriaScores as Record<string, number>;
    const overallScore = calculateOverallScore(criteriaScores, criteria);
    const meetsThreshold = checkThresholdsMet(criteriaScores, criteria);

    evaluation = {
      overallScore,
      criteriaScores,
      feedback: parsed.feedback ?? '',
      meetsThreshold,
    };
  } catch (parseError) {
    // If parsing fails, create a default evaluation with low scores
    logger.warn({ error: parseError }, 'Failed to parse evaluation response');

    const defaultScores: Record<string, number> = {};
    for (const c of criteria) {
      defaultScores[c.name] = 0.5;
    }

    evaluation = {
      overallScore: 0.5,
      criteriaScores: defaultScores,
      feedback: 'Unable to parse evaluation. Please review the output manually.',
      meetsThreshold: false,
    };
  }

  return evaluation;
}

/**
 * Generates improvement prompt based on critique
 */
export async function generateImprovementPrompt(
  originalOutput: unknown,
  critique: CritiqueEvaluation,
  customTemplate?: string
): Promise<string> {
  const outputStr = typeof originalOutput === 'string'
    ? originalOutput
    : JSON.stringify(originalOutput, null, 2);

  // Use custom template if provided, otherwise use registered template
  const template = customTemplate ?? await getImprovementTemplateContent();
  const scoresStr = Object.entries(critique.criteriaScores)
    .map(([name, score]) => `- ${name}: ${(score * 100).toFixed(1)}%`)
    .join('\n');

  // Extract suggestions if available in feedback
  const suggestionsStr = critique.feedback;

  return template
    .replace('{{output}}', outputStr)
    .replace('{{feedback}}', critique.feedback)
    .replace('{{suggestions}}', suggestionsStr)
    .replace('{{scores}}', scoresStr);
}

/**
 * Executes self-critique pattern
 */
export async function executeSelfCritique(
  request: OrchestrationRequest,
  config: SelfCritiqueConfig
): Promise<SelfCritiqueResult> {
  const executionId = request.id ?? generateCritiqueId();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Defensive defaulting for maxIterations - ensure it's valid
  const maxIterations = (config.maxIterations && config.maxIterations >= 1)
    ? config.maxIterations
    : serviceConfig.defaultMaxIterations;

  // Defensive defaulting for stopOnQualityThreshold
  const stopOnQualityThreshold = config.stopOnQualityThreshold ?? serviceConfig.defaultQualityThreshold;

  // Create a normalized config with defaults applied
  const normalizedConfig: SelfCritiqueConfig = {
    ...config,
    maxIterations,
    stopOnQualityThreshold,
  };

  logger.info(
    { executionId, maxIterations: normalizedConfig.maxIterations },
    'Starting self-critique execution'
  );

  // Get the task to critique (first task in the request)
  const task = request.tasks[0];
  if (!task) {
    throw new Error('Self-critique requires at least one task');
  }

  // Create workflow context for storing iterations
  await createContext(executionId, {
    originalTask: task,
    config: normalizedConfig,
    userId: request.userId,
  });

  const iterations: CritiqueIteration[] = [];
  const taskResults: OrchestrationTaskResult[] = [];
  let currentOutput: unknown = null;
  let converged = false;
  let finalScore = 0;

  // Resolve agent for evaluation
  let evaluationAgentId: string;
  if (task.agentId) {
    evaluationAgentId = task.agentId;
  } else {
    const defaultAgent = await getDefaultAgent(task.agentType);
    if (!defaultAgent) {
      throw new Error(`No agent available for type: ${task.agentType}`);
    }
    evaluationAgentId = defaultAgent.id;
  }

  try {
    for (let iteration = 1; iteration <= normalizedConfig.maxIterations; iteration++) {
      const iterationStartTime = Date.now();

      // Emit iteration started event
      critiqueEvents.emit('agent:critique:iteration-started', {
        executionId,
        iteration,
        timestamp: new Date().toISOString(),
      });

      // Execute or improve the output
      let taskResult: OrchestrationTaskResult;

      if (iteration === 1) {
        // First iteration: execute the original task
        taskResult = await executeTask(task, request.context, request.userId, request.timeoutMs);
      } else {
        // Subsequent iterations: improve based on critique
        const previousIteration = iterations[iterations.length - 1];
        if (!previousIteration) {
          throw new Error('No previous iteration found');
        }

        const improvementPrompt = await generateImprovementPrompt(
          previousIteration.output,
          previousIteration.critique,
          normalizedConfig.improvementPromptTemplate
        );

        const improvementTask: OrchestrationTask = {
          ...task,
          id: `${task.id}_improve_${iteration}`,
          prompt: improvementPrompt,
        };

        taskResult = await executeTask(improvementTask, request.context, request.userId, request.timeoutMs);
      }

      taskResults.push(taskResult);

      if (!taskResult.success) {
        logger.warn(
          { executionId, iteration, error: taskResult.error },
          'Task execution failed during self-critique'
        );

        const completedAt = new Date().toISOString();

        const failedResult: SelfCritiqueResult = {
          id: executionId,
          status: 'failed',
          pattern: 'self-critique',
          taskResults,
          error: taskResult.error ?? 'Task execution failed',
          durationMs: Date.now() - startTime,
          startedAt,
          completedAt,
          iterations,
          finalOutput: currentOutput,
          finalScore,
          converged: false,
        };

        await saveCritiqueResult(failedResult);
        await recordCritiqueMetric({
          executionId: failedResult.id,
          userId: request.userId,
          iterations: failedResult.iterations.length,
          converged: failedResult.converged,
          finalScore: failedResult.finalScore,
          qualityImprovement: failedResult.iterations.length > 1
            ? failedResult.finalScore - (failedResult.iterations[0]?.critique.overallScore ?? 0)
            : 0,
          durationMs: failedResult.durationMs,
        });
        await clearContext(executionId);

        // Emit completed event with failed result so clients receive a terminal event
        critiqueEvents.emit('agent:critique:completed', {
          executionId,
          result: failedResult,
          timestamp: completedAt,
        });

        return failedResult;
      }

      currentOutput = taskResult.result;

      // Evaluate the output
      const critique = await evaluateOutput(
        currentOutput,
        normalizedConfig.qualityCriteria,
        evaluationAgentId,
        request.userId,
        normalizedConfig.evaluationPromptTemplate
      );

      finalScore = critique.overallScore;

      const iterationDurationMs = Date.now() - iterationStartTime;

      const critiqueIteration: CritiqueIteration = {
        iteration,
        output: currentOutput,
        critique,
        durationMs: iterationDurationMs,
        timestamp: new Date().toISOString(),
      };

      iterations.push(critiqueIteration);

      // Store iteration in context
      await setContextValue(executionId, `iterations.${iteration}`, critiqueIteration);

      // Store iteration in Redis list
      await storeIteration(executionId, critiqueIteration);

      // Emit iteration completed event
      critiqueEvents.emit('agent:critique:iteration', {
        executionId,
        iteration,
        scores: {
          overall: critique.overallScore,
          criteria: critique.criteriaScores,
        },
        feedback: critique.feedback,
        meetsThreshold: critique.meetsThreshold,
        timestamp: new Date().toISOString(),
      });

      // Check if quality threshold is met
      const thresholdToCheck = normalizedConfig.stopOnQualityThreshold!;

      if (critique.meetsThreshold && critique.overallScore >= thresholdToCheck) {
        converged = true;

        // Emit converged event
        critiqueEvents.emit('agent:critique:converged', {
          executionId,
          iterations: iteration,
          finalScore: critique.overallScore,
          timestamp: new Date().toISOString(),
        });

        logger.info(
          { executionId, iteration, finalScore: critique.overallScore },
          'Self-critique converged'
        );
        break;
      }

      // Check timeout (honor request.timeoutMs if provided)
      const effectiveTimeout = request.timeoutMs ?? serviceConfig.defaultTimeoutMs;
      if (Date.now() - startTime > effectiveTimeout) {
        logger.warn(
          { executionId, iteration },
          'Self-critique timeout reached'
        );
        break;
      }
    }

    // Emit max iterations event if not converged
    if (!converged && iterations.length >= normalizedConfig.maxIterations) {
      critiqueEvents.emit('agent:critique:max-iterations', {
        executionId,
        iterations: iterations.length,
        finalScore,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { executionId, error: errorMessage },
      'Self-critique execution failed'
    );

    const completedAt = new Date().toISOString();

    const result: SelfCritiqueResult = {
      id: executionId,
      status: 'failed',
      pattern: 'self-critique',
      taskResults,
      error: errorMessage,
      durationMs: Date.now() - startTime,
      startedAt,
      completedAt,
      iterations,
      finalOutput: currentOutput,
      finalScore,
      converged: false,
    };

    await saveCritiqueResult(result);
    await recordCritiqueMetric({
      executionId: result.id,
      userId: request.userId,
      iterations: result.iterations.length,
      converged: result.converged,
      finalScore: result.finalScore,
      qualityImprovement: result.iterations.length > 1
        ? result.finalScore - (result.iterations[0]?.critique.overallScore ?? 0)
        : 0,
      durationMs: result.durationMs,
    });

    // Emit completed event with failed result so clients receive a terminal event
    critiqueEvents.emit('agent:critique:completed', {
      executionId,
      result,
      timestamp: completedAt,
    });

    await clearContext(executionId);

    throw error;
  }

  const completedAt = new Date().toISOString();

  // Determine failure reason if not converged
  let failureReason: string | undefined;
  if (!converged) {
    const elapsedMs = Date.now() - startTime;
    const effectiveTimeoutForReason = request.timeoutMs ?? serviceConfig.defaultTimeoutMs;
    if (elapsedMs >= effectiveTimeoutForReason) {
      failureReason = 'Self-critique timed out before meeting quality thresholds';
    } else if (iterations.length >= normalizedConfig.maxIterations) {
      failureReason = `Self-critique reached maximum iterations (${normalizedConfig.maxIterations}) without meeting quality thresholds`;
    } else {
      failureReason = 'Self-critique did not converge';
    }
  }

  const result: SelfCritiqueResult = {
    id: executionId,
    status: 'completed',
    pattern: 'self-critique',
    taskResults,
    error: failureReason,
    durationMs: Date.now() - startTime,
    startedAt,
    completedAt,
    iterations,
    finalOutput: currentOutput,
    finalScore,
    converged,
  };

  // Store result
  await saveCritiqueResult(result);
  await recordCritiqueMetric({
    executionId: result.id,
    userId: request.userId,
    iterations: result.iterations.length,
    converged: result.converged,
    finalScore: result.finalScore,
    qualityImprovement: result.iterations.length > 1
      ? result.finalScore - (result.iterations[0]?.critique.overallScore ?? 0)
      : 0,
    durationMs: result.durationMs,
  });

  // Emit completed event
  critiqueEvents.emit('agent:critique:completed', {
    executionId,
    result,
    timestamp: completedAt,
  });

  // Cleanup context
  await clearContext(executionId);

  logger.info(
    {
      executionId,
      iterations: iterations.length,
      converged,
      finalScore,
      durationMs: result.durationMs,
    },
    'Self-critique execution completed'
  );

  return result;
}

/**
 * Stores a critique iteration in Redis
 */
async function storeIteration(
  executionId: string,
  iteration: CritiqueIteration
): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.rpush(
      `${CRITIQUE_ITERATIONS_PREFIX}${executionId}`,
      JSON.stringify(iteration)
    );
    await redis.expire(`${CRITIQUE_ITERATIONS_PREFIX}${executionId}`, 86400); // 24 hours
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to store critique iteration');
  }
}

/**
 * Saves critique result to Redis
 */
async function saveCritiqueResult(result: SelfCritiqueResult): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.set(
      `${CRITIQUE_STATE_PREFIX}${result.id}`,
      JSON.stringify(result),
      'EX',
      86400 // 24 hours
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to save critique result');
  }
}

/**
 * Gets critique result by ID
 */
export async function getCritiqueResult(
  executionId: string
): Promise<SelfCritiqueResult | null> {
  if (!isRedisConnected()) {
    return null;
  }

  const redis = getRedisClient();
  const data = await redis.get(`${CRITIQUE_STATE_PREFIX}${executionId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as SelfCritiqueResult;
}

/**
 * Gets critique iterations by execution ID
 */
export async function getCritiqueIterations(
  executionId: string
): Promise<CritiqueIteration[]> {
  if (!isRedisConnected()) {
    return [];
  }

  const redis = getRedisClient();
  const data = await redis.lrange(`${CRITIQUE_ITERATIONS_PREFIX}${executionId}`, 0, -1);

  return data.map((d) => JSON.parse(d) as CritiqueIteration);
}

/**
 * Gets critique metrics
 * @deprecated Use getSelfCritiqueMetrics from agent-metrics.service.ts instead
 */
export const getCritiqueMetrics = getSelfCritiqueMetrics;

/**
 * Gets service configuration
 */
export function getServiceConfig(): SelfCritiqueServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<SelfCritiqueServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };
  logger.info('Self-critique service configuration updated');
}

export default {
  initializeSelfCritiqueService,
  executeSelfCritique,
  evaluateOutput,
  generateImprovementPrompt,
  calculateOverallScore,
  getCritiqueResult,
  getCritiqueIterations,
  getCritiqueMetrics,
  getServiceConfig,
  updateServiceConfig,
  critiqueEvents,
};
