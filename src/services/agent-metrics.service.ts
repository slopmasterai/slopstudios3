/**
 * Agent Metrics Service
 * Collects and aggregates metrics for workflows, steps, templates, and agents
 */

import { logger } from '../utils/logger.js';

import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  WorkflowMetrics,
  StepMetrics,
  TemplateMetrics,
  AgentMetrics,
  AgentServiceMetrics,
  AgentType,
  AgentStatus,
  SelfCritiqueMetrics,
  DiscussionMetrics,
} from '../types/agent.types.js';

// Redis key prefixes
const WORKFLOW_METRICS_KEY = 'agent:metrics:workflows';
const STEP_METRICS_KEY = 'agent:metrics:steps';
const TEMPLATE_METRICS_KEY = 'agent:metrics:templates';
const AGENT_METRICS_KEY = 'agent:metrics:agents';
const CRITIQUE_METRICS_KEY = 'agent:metrics:critique';
const DISCUSSION_METRICS_KEY = 'agent:metrics:discussion';

// Maximum metrics to store
const MAX_WORKFLOW_METRICS = 10000;
const MAX_STEP_METRICS = 50000;
const MAX_TEMPLATE_METRICS = 10000;
const MAX_AGENT_METRICS = 10000;
const MAX_CRITIQUE_METRICS = 5000;
const MAX_DISCUSSION_METRICS = 5000;

// Service configuration
interface AgentMetricsServiceConfig {
  enableMetrics: boolean;
  aggregationPeriodSeconds: number;
  metricsRetentionDays: number;
}

let serviceConfig: AgentMetricsServiceConfig = {
  enableMetrics: true,
  aggregationPeriodSeconds: 3600, // 1 hour
  metricsRetentionDays: 7,
};

/**
 * Initializes the agent metrics service
 */
export function initializeAgentMetricsService(
  config?: Partial<AgentMetricsServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  logger.info(
    {
      enableMetrics: serviceConfig.enableMetrics,
      aggregationPeriodSeconds: serviceConfig.aggregationPeriodSeconds,
    },
    'Agent metrics service initialized'
  );
}

/**
 * Records a workflow execution metric
 */
export async function recordWorkflowMetric(metric: {
  executionId: string;
  workflowId: string;
  userId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  stepCount: number;
  completedSteps: number;
  failedSteps: number;
}): Promise<void> {
  if (!serviceConfig.enableMetrics || !isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const timestamp = Date.now();

    const metricData = {
      ...metric,
      timestamp,
    };

    await redis.lpush(WORKFLOW_METRICS_KEY, JSON.stringify(metricData));
    await redis.ltrim(WORKFLOW_METRICS_KEY, 0, MAX_WORKFLOW_METRICS - 1);

    logger.debug(
      { executionId: metric.executionId, status: metric.status },
      'Workflow metric recorded'
    );
  } catch (error) {
    // Don't throw on metrics errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to record workflow metric');
  }
}

/**
 * Records a step execution metric
 */
export async function recordStepMetric(metric: {
  executionId: string;
  stepId: string;
  agentType: AgentType;
  agentId: string;
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
  retryCount: number;
}): Promise<void> {
  if (!serviceConfig.enableMetrics || !isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const timestamp = Date.now();

    const metricData = {
      ...metric,
      timestamp,
    };

    await redis.lpush(STEP_METRICS_KEY, JSON.stringify(metricData));
    await redis.ltrim(STEP_METRICS_KEY, 0, MAX_STEP_METRICS - 1);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to record step metric');
  }
}

/**
 * Records a template usage metric
 */
export async function recordTemplateMetric(metric: {
  templateId: string;
  success: boolean;
  variablesUsed: number;
  interpolationTimeMs?: number;
}): Promise<void> {
  if (!serviceConfig.enableMetrics || !isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const timestamp = Date.now();

    const metricData = {
      ...metric,
      timestamp,
    };

    await redis.lpush(TEMPLATE_METRICS_KEY, JSON.stringify(metricData));
    await redis.ltrim(TEMPLATE_METRICS_KEY, 0, MAX_TEMPLATE_METRICS - 1);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to record template metric');
  }
}

/**
 * Records an agent execution metric
 */
export async function recordAgentMetric(metric: {
  agentId: string;
  agentType: AgentType;
  success: boolean;
  responseTimeMs: number;
  errorType?: string;
}): Promise<void> {
  if (!serviceConfig.enableMetrics || !isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const timestamp = Date.now();

    const metricData = {
      ...metric,
      timestamp,
    };

    await redis.lpush(AGENT_METRICS_KEY, JSON.stringify(metricData));
    await redis.ltrim(AGENT_METRICS_KEY, 0, MAX_AGENT_METRICS - 1);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to record agent metric');
  }
}

/**
 * Records a self-critique execution metric
 */
export async function recordCritiqueMetric(metric: {
  executionId: string;
  userId: string;
  iterations: number;
  converged: boolean;
  finalScore: number;
  qualityImprovement: number;
  durationMs: number;
}): Promise<void> {
  if (!serviceConfig.enableMetrics || !isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const timestamp = Date.now();

    const metricData = {
      ...metric,
      timestamp,
    };

    await redis.lpush(CRITIQUE_METRICS_KEY, JSON.stringify(metricData));
    await redis.ltrim(CRITIQUE_METRICS_KEY, 0, MAX_CRITIQUE_METRICS - 1);

    logger.debug(
      { executionId: metric.executionId, iterations: metric.iterations, converged: metric.converged },
      'Critique metric recorded'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to record critique metric');
  }
}

/**
 * Records a discussion execution metric
 */
export async function recordDiscussionMetric(metric: {
  executionId: string;
  userId: string;
  rounds: number;
  participantCount: number;
  converged: boolean;
  consensusScore: number;
  durationMs: number;
}): Promise<void> {
  if (!serviceConfig.enableMetrics || !isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const timestamp = Date.now();

    const metricData = {
      ...metric,
      timestamp,
    };

    await redis.lpush(DISCUSSION_METRICS_KEY, JSON.stringify(metricData));
    await redis.ltrim(DISCUSSION_METRICS_KEY, 0, MAX_DISCUSSION_METRICS - 1);

    logger.debug(
      { executionId: metric.executionId, rounds: metric.rounds, converged: metric.converged },
      'Discussion metric recorded'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to record discussion metric');
  }
}

/**
 * Gets workflow metrics for a time period
 */
export async function getWorkflowMetrics(
  periodSeconds: number = 3600
): Promise<WorkflowMetrics> {
  const defaultMetrics: WorkflowMetrics = {
    totalWorkflows: 0,
    successfulWorkflows: 0,
    failedWorkflows: 0,
    cancelledWorkflows: 0,
    activeWorkflows: 0,
    queuedWorkflows: 0,
    avgDurationMs: 0,
    p50DurationMs: 0,
    p95DurationMs: 0,
    p99DurationMs: 0,
    successRate: 0,
    timestamp: new Date().toISOString(),
    periodSeconds,
  };

  if (!isRedisConnected()) {
    return defaultMetrics;
  }

  try {
    const redis = getRedisClient();
    const cutoffTime = Date.now() - periodSeconds * 1000;

    // Get all workflow metrics
    const metricsData = await redis.lrange(WORKFLOW_METRICS_KEY, 0, -1);

    const metrics = metricsData
      .map((d) => JSON.parse(d) as {
        executionId: string;
        status: string;
        durationMs: number;
        timestamp: number;
      })
      .filter((m) => m.timestamp >= cutoffTime);

    if (metrics.length === 0) {
      return defaultMetrics;
    }

    // Calculate metrics
    const completed = metrics.filter((m) => m.status === 'completed');
    const failed = metrics.filter((m) => m.status === 'failed');
    const cancelled = metrics.filter((m) => m.status === 'cancelled');

    const durations = completed.map((m) => m.durationMs).sort((a, b) => a - b);

    return {
      totalWorkflows: metrics.length,
      successfulWorkflows: completed.length,
      failedWorkflows: failed.length,
      cancelledWorkflows: cancelled.length,
      activeWorkflows: 0, // Would need to query workflow engine
      queuedWorkflows: 0, // Would need to query workflow engine
      avgDurationMs: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      p99DurationMs: percentile(durations, 99),
      successRate: metrics.length > 0 ? completed.length / metrics.length : 0,
      timestamp: new Date().toISOString(),
      periodSeconds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to get workflow metrics');
    return defaultMetrics;
  }
}

/**
 * Gets step metrics by agent type
 */
export async function getStepMetrics(
  periodSeconds: number = 3600
): Promise<Record<AgentType, StepMetrics>> {
  const defaultMetrics: Record<AgentType, StepMetrics> = {
    claude: {
      agentType: 'claude',
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0,
      retriedSteps: 0,
      avgDurationMs: 0,
      successRate: 0,
    },
    strudel: {
      agentType: 'strudel',
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0,
      retriedSteps: 0,
      avgDurationMs: 0,
      successRate: 0,
    },
    custom: {
      agentType: 'custom',
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0,
      retriedSteps: 0,
      avgDurationMs: 0,
      successRate: 0,
    },
  };

  if (!isRedisConnected()) {
    return defaultMetrics;
  }

  try {
    const redis = getRedisClient();
    const cutoffTime = Date.now() - periodSeconds * 1000;

    const metricsData = await redis.lrange(STEP_METRICS_KEY, 0, -1);

    const metrics = metricsData
      .map((d) => JSON.parse(d) as {
        agentType: AgentType;
        status: string;
        durationMs: number;
        retryCount: number;
        timestamp: number;
      })
      .filter((m) => m.timestamp >= cutoffTime);

    // Group by agent type
    const byType: Record<AgentType, typeof metrics> = {
      claude: [],
      strudel: [],
      custom: [],
    };

    for (const m of metrics) {
      if (byType[m.agentType]) {
        byType[m.agentType].push(m);
      }
    }

    // Calculate metrics for each type
    for (const [type, typeMetrics] of Object.entries(byType) as [AgentType, typeof metrics][]) {
      if (typeMetrics.length === 0) continue;

      const completed = typeMetrics.filter((m) => m.status === 'completed');
      const failed = typeMetrics.filter((m) => m.status === 'failed');
      const retried = typeMetrics.filter((m) => m.retryCount > 0);
      const durations = completed.map((m) => m.durationMs);

      defaultMetrics[type] = {
        agentType: type,
        totalSteps: typeMetrics.length,
        successfulSteps: completed.length,
        failedSteps: failed.length,
        retriedSteps: retried.length,
        avgDurationMs: durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
        successRate: typeMetrics.length > 0 ? completed.length / typeMetrics.length : 0,
      };
    }

    return defaultMetrics;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to get step metrics');
    return defaultMetrics;
  }
}

/**
 * Gets template usage metrics
 */
export async function getTemplateMetrics(
  periodSeconds: number = 3600,
  limit: number = 10
): Promise<TemplateMetrics[]> {
  if (!isRedisConnected()) {
    return [];
  }

  try {
    const redis = getRedisClient();
    const cutoffTime = Date.now() - periodSeconds * 1000;

    const metricsData = await redis.lrange(TEMPLATE_METRICS_KEY, 0, -1);

    const metrics = metricsData
      .map((d) => JSON.parse(d) as {
        templateId: string;
        success: boolean;
        variablesUsed: number;
        timestamp: number;
      })
      .filter((m) => m.timestamp >= cutoffTime);

    // Group by template ID
    const byTemplate = new Map<string, typeof metrics>();

    for (const m of metrics) {
      if (!byTemplate.has(m.templateId)) {
        byTemplate.set(m.templateId, []);
      }
      byTemplate.get(m.templateId)!.push(m);
    }

    // Calculate metrics for each template
    const templateMetrics: TemplateMetrics[] = [];

    for (const [templateId, templateData] of byTemplate) {
      const successful = templateData.filter((m) => m.success);
      const failed = templateData.filter((m) => !m.success);
      const avgVars = templateData.reduce((a, m) => a + m.variablesUsed, 0) / templateData.length;

      templateMetrics.push({
        templateId,
        usageCount: templateData.length,
        successfulInterpolations: successful.length,
        failedInterpolations: failed.length,
        avgVariablesUsed: Math.round(avgVars * 10) / 10,
      });
    }

    // Sort by usage count and return top N
    return templateMetrics
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to get template metrics');
    return [];
  }
}

/**
 * Gets agent performance metrics
 */
export async function getAgentPerformanceMetrics(
  periodSeconds: number = 3600
): Promise<AgentMetrics[]> {
  if (!isRedisConnected()) {
    return [];
  }

  try {
    const redis = getRedisClient();
    const cutoffTime = Date.now() - periodSeconds * 1000;

    const metricsData = await redis.lrange(AGENT_METRICS_KEY, 0, -1);

    const metrics = metricsData
      .map((d) => JSON.parse(d) as {
        agentId: string;
        agentType: AgentType;
        success: boolean;
        responseTimeMs: number;
        errorType?: string;
        timestamp: number;
      })
      .filter((m) => m.timestamp >= cutoffTime);

    // Group by agent ID
    const byAgent = new Map<string, typeof metrics>();

    for (const m of metrics) {
      if (!byAgent.has(m.agentId)) {
        byAgent.set(m.agentId, []);
      }
      byAgent.get(m.agentId)!.push(m);
    }

    // Calculate metrics for each agent
    const agentMetrics: AgentMetrics[] = [];

    for (const [agentId, agentData] of byAgent) {
      const successful = agentData.filter((m) => m.success);
      const failed = agentData.filter((m) => !m.success);
      const responseTimes = successful.map((m) => m.responseTimeMs);

      agentMetrics.push({
        agentId,
        agentType: agentData[0]?.agentType ?? 'custom',
        totalExecutions: agentData.length,
        successfulExecutions: successful.length,
        failedExecutions: failed.length,
        avgResponseTimeMs: responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0,
        currentStatus: 'idle' as AgentStatus, // Would need to query registry
        uptimePercentage: agentData.length > 0 ? successful.length / agentData.length : 1,
        errorCount: failed.length,
      });
    }

    return agentMetrics.sort((a, b) => b.totalExecutions - a.totalExecutions);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to get agent metrics');
    return [];
  }
}

/**
 * Gets self-critique metrics for a time period
 */
export async function getSelfCritiqueMetrics(
  periodSeconds: number = 3600
): Promise<SelfCritiqueMetrics> {
  const defaultMetrics: SelfCritiqueMetrics = {
    totalExecutions: 0,
    avgIterations: 0,
    convergenceRate: 0,
    avgQualityImprovement: 0,
    avgDurationMs: 0,
  };

  if (!isRedisConnected()) {
    return defaultMetrics;
  }

  try {
    const redis = getRedisClient();
    const cutoffTime = Date.now() - periodSeconds * 1000;

    const metricsData = await redis.lrange(CRITIQUE_METRICS_KEY, 0, -1);

    const metrics = metricsData
      .map((d) => JSON.parse(d) as {
        executionId: string;
        iterations: number;
        converged: boolean;
        qualityImprovement: number;
        durationMs: number;
        timestamp: number;
      })
      .filter((m) => m.timestamp >= cutoffTime);

    if (metrics.length === 0) {
      return defaultMetrics;
    }

    const converged = metrics.filter((m) => m.converged);
    const totalIterations = metrics.reduce((a, m) => a + m.iterations, 0);
    const totalImprovement = metrics.reduce((a, m) => a + m.qualityImprovement, 0);
    const totalDuration = metrics.reduce((a, m) => a + m.durationMs, 0);

    return {
      totalExecutions: metrics.length,
      avgIterations: totalIterations / metrics.length,
      convergenceRate: converged.length / metrics.length,
      avgQualityImprovement: totalImprovement / metrics.length,
      avgDurationMs: totalDuration / metrics.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to get self-critique metrics');
    return defaultMetrics;
  }
}

/**
 * Gets discussion metrics for a time period
 */
export async function getDiscussionMetrics(
  periodSeconds: number = 3600
): Promise<DiscussionMetrics> {
  const defaultMetrics: DiscussionMetrics = {
    totalExecutions: 0,
    avgRounds: 0,
    convergenceRate: 0,
    avgConsensusScore: 0,
    avgParticipants: 0,
    avgDurationMs: 0,
  };

  if (!isRedisConnected()) {
    return defaultMetrics;
  }

  try {
    const redis = getRedisClient();
    const cutoffTime = Date.now() - periodSeconds * 1000;

    const metricsData = await redis.lrange(DISCUSSION_METRICS_KEY, 0, -1);

    const metrics = metricsData
      .map((d) => JSON.parse(d) as {
        executionId: string;
        rounds: number;
        participantCount: number;
        converged: boolean;
        consensusScore: number;
        durationMs: number;
        timestamp: number;
      })
      .filter((m) => m.timestamp >= cutoffTime);

    if (metrics.length === 0) {
      return defaultMetrics;
    }

    const converged = metrics.filter((m) => m.converged);
    const totalRounds = metrics.reduce((a, m) => a + m.rounds, 0);
    const totalConsensus = metrics.reduce((a, m) => a + m.consensusScore, 0);
    const totalParticipants = metrics.reduce((a, m) => a + m.participantCount, 0);
    const totalDuration = metrics.reduce((a, m) => a + m.durationMs, 0);

    return {
      totalExecutions: metrics.length,
      avgRounds: totalRounds / metrics.length,
      convergenceRate: converged.length / metrics.length,
      avgConsensusScore: totalConsensus / metrics.length,
      avgParticipants: totalParticipants / metrics.length,
      avgDurationMs: totalDuration / metrics.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to get discussion metrics');
    return defaultMetrics;
  }
}

/**
 * Gets comprehensive service metrics
 */
export async function getOrchestrationMetrics(
  periodSeconds: number = 3600
): Promise<AgentServiceMetrics> {
  const [workflowMetrics, stepsByAgent, templateMetrics, agentMetrics, critiqueMetrics, discussionMetrics] = await Promise.all([
    getWorkflowMetrics(periodSeconds),
    getStepMetrics(periodSeconds),
    getTemplateMetrics(periodSeconds),
    getAgentPerformanceMetrics(periodSeconds),
    getSelfCritiqueMetrics(periodSeconds),
    getDiscussionMetrics(periodSeconds),
  ]);

  return {
    workflows: workflowMetrics,
    stepsByAgent,
    templates: templateMetrics,
    agents: agentMetrics,
    selfCritique: critiqueMetrics,
    discussion: discussionMetrics,
    timestamp: new Date().toISOString(),
    periodSeconds,
  };
}

/**
 * Calculates percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;

  const index = (p / 100) * (sortedArr.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedArr[lower] ?? 0;
  }

  const lowerVal = sortedArr[lower] ?? 0;
  const upperVal = sortedArr[upper] ?? 0;
  const fraction = index - lower;
  return lowerVal + (upperVal - lowerVal) * fraction;
}

/**
 * Clears old metrics beyond retention period
 */
export async function cleanupOldMetrics(): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const retentionMs = serviceConfig.metricsRetentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;

    // Cleanup is handled by trimming lists, but we could implement
    // time-based cleanup here if needed
    logger.debug({ cutoffTime }, 'Metrics cleanup completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to cleanup metrics');
  }
}

/**
 * Gets service configuration
 */
export function getServiceConfig(): AgentMetricsServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<AgentMetricsServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };
  logger.info('Agent metrics service configuration updated');
}

/**
 * Shuts down the agent metrics service
 */
export async function shutdownAgentMetricsService(): Promise<void> {
  logger.info('Shutting down agent metrics service');
  // Cleanup any pending metrics operations if needed
  await cleanupOldMetrics();
  logger.info('Agent metrics service shutdown complete');
}

export default {
  initializeAgentMetricsService,
  shutdownAgentMetricsService,
  recordWorkflowMetric,
  recordStepMetric,
  recordTemplateMetric,
  recordAgentMetric,
  recordCritiqueMetric,
  recordDiscussionMetric,
  getWorkflowMetrics,
  getStepMetrics,
  getTemplateMetrics,
  getAgentPerformanceMetrics,
  getSelfCritiqueMetrics,
  getDiscussionMetrics,
  getOrchestrationMetrics,
  cleanupOldMetrics,
  getServiceConfig,
  updateServiceConfig,
};
