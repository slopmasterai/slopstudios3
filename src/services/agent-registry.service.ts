/**
 * Agent Registry Service
 * Manages agent registration, discovery, and status tracking
 */

import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import { recordAgentMetric } from './agent-metrics.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  AgentType,
  AgentStatus,
  AgentRegistration,
  AgentCapability,
  AgentExecutor,
  AgentExecutionInput,
  AgentExecutionOutput,
  AgentHealthStatus,
} from '../types/agent.types.js';

// Redis key prefixes
const AGENT_REGISTRY_KEY_PREFIX = 'agent:registry:';
const AGENT_REGISTRY_LIST_KEY = 'agent:registry:list';
const AGENT_TYPE_PREFIX = 'agent:registry:type:';
const AGENT_CAPABILITY_PREFIX = 'agent:registry:capability:';

// In-memory registry for agent executors
const agentExecutors = new Map<string, AgentExecutor>();

// Built-in agent IDs
export const BUILT_IN_AGENTS = {
  CLAUDE: 'agent_claude_default',
  STRUDEL: 'agent_strudel_default',
} as const;

// Service configuration
interface AgentRegistryServiceConfig {
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  maxAgentErrors: number;
  autoRecoverAfterMs: number;
}

let serviceConfig: AgentRegistryServiceConfig = {
  healthCheckIntervalMs: 30000, // 30 seconds
  healthCheckTimeoutMs: 5000, // 5 seconds
  maxAgentErrors: 5, // Mark as error status after 5 consecutive failures
  autoRecoverAfterMs: 300000, // Try to recover after 5 minutes
};

// Health check interval
let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Initializes the agent registry service
 */
export function initializeAgentRegistryService(
  config?: Partial<AgentRegistryServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  // Start health check interval
  startHealthCheckInterval();

  logger.info(
    {
      healthCheckIntervalMs: serviceConfig.healthCheckIntervalMs,
      maxAgentErrors: serviceConfig.maxAgentErrors,
    },
    'Agent registry service initialized'
  );
}

/**
 * Generates a unique agent ID
 */
function generateAgentId(): string {
  return generateRequestId().replace('req_', 'agent_');
}

/**
 * Starts the health check interval
 */
function startHealthCheckInterval(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(() => {
    void runHealthChecks();
  }, serviceConfig.healthCheckIntervalMs);
}

/**
 * Stops the health check interval
 */
export function stopHealthCheckInterval(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

/**
 * Runs health checks for all registered agents
 */
async function runHealthChecks(): Promise<void> {
  try {
    const agents = await listAgents();

    for (const agent of agents) {
      const executor = agentExecutors.get(agent.id);

      if (executor) {
        try {
          const health = await Promise.race([
            executor.healthCheck(),
            new Promise<AgentHealthStatus>((_, reject) =>
              setTimeout(() => { reject(new Error('Health check timeout')); }, serviceConfig.healthCheckTimeoutMs)
            ),
          ]);

          // Update agent status based on health check
          await updateAgentStatus(agent.id, health.status, health.message);

          // Reset error count on successful health check
          if (health.healthy && agent.metadata.errorCount && agent.metadata.errorCount > 0) {
            await updateAgentMetadata(agent.id, { errorCount: 0 });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(
            { agentId: agent.id, error: errorMessage },
            'Agent health check failed'
          );

          // Increment error count
          const newErrorCount = (agent.metadata.errorCount ?? 0) + 1;
          await updateAgentMetadata(agent.id, { errorCount: newErrorCount });

          // Mark as error status if too many consecutive failures
          if (newErrorCount >= serviceConfig.maxAgentErrors) {
            await updateAgentStatus(agent.id, 'error', `Health check failed: ${errorMessage}`);
          }
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Error running health checks');
  }
}

/**
 * Registers a new agent
 */
export async function registerAgent(
  type: AgentType,
  name: string,
  capabilities: AgentCapability[],
  executor: AgentExecutor,
  config?: Record<string, unknown>,
  existingId?: string
): Promise<AgentRegistration> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const agentId = existingId ?? generateAgentId();
  const now = new Date().toISOString();

  // Check if agent with this ID already exists
  const existing = await getAgent(agentId);
  if (existing && !existingId) {
    throw new Error(`Agent already registered with ID: ${agentId}`);
  }

  const registration: AgentRegistration = {
    id: agentId,
    type,
    name,
    capabilities,
    config: config ?? {},
    status: 'idle',
    metadata: {
      version: '1.0.0',
      createdAt: existing?.metadata.createdAt ?? now,
      updatedAt: now,
      lastHealthCheck: now,
      errorCount: 0,
    },
  };

  // Store registration in Redis
  await redis.set(`${AGENT_REGISTRY_KEY_PREFIX}${agentId}`, JSON.stringify(registration));

  // Add to registry list
  await redis.sadd(AGENT_REGISTRY_LIST_KEY, agentId);

  // Add to type index
  await redis.sadd(`${AGENT_TYPE_PREFIX}${type}`, agentId);

  // Add to capability indices
  for (const capability of capabilities) {
    await redis.sadd(`${AGENT_CAPABILITY_PREFIX}${capability.name}`, agentId);
  }

  // Store executor in memory
  agentExecutors.set(agentId, executor);

  logger.info({ agentId, type, name }, 'Agent registered');

  return registration;
}

/**
 * Unregisters an agent
 */
export async function unregisterAgent(agentId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const agent = await getAgent(agentId);

  if (!agent) {
    return false;
  }

  // Prevent unregistering built-in agents
  if (Object.values(BUILT_IN_AGENTS).includes(agentId as typeof BUILT_IN_AGENTS[keyof typeof BUILT_IN_AGENTS])) {
    throw new Error('Cannot unregister built-in agents');
  }

  // Remove from capability indices
  for (const capability of agent.capabilities) {
    await redis.srem(`${AGENT_CAPABILITY_PREFIX}${capability.name}`, agentId);
  }

  // Remove from type index
  await redis.srem(`${AGENT_TYPE_PREFIX}${agent.type}`, agentId);

  // Remove from registry list
  await redis.srem(AGENT_REGISTRY_LIST_KEY, agentId);

  // Delete registration
  await redis.del(`${AGENT_REGISTRY_KEY_PREFIX}${agentId}`);

  // Remove executor
  agentExecutors.delete(agentId);

  logger.info({ agentId }, 'Agent unregistered');

  return true;
}

/**
 * Gets an agent by ID
 */
export async function getAgent(agentId: string): Promise<AgentRegistration | null> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const data = await redis.get(`${AGENT_REGISTRY_KEY_PREFIX}${agentId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as AgentRegistration;
}

/**
 * Gets the default agent for a type
 */
export async function getDefaultAgent(type: AgentType): Promise<AgentRegistration | null> {
  switch (type) {
    case 'claude':
      return await getAgent(BUILT_IN_AGENTS.CLAUDE);
    case 'strudel':
      return await getAgent(BUILT_IN_AGENTS.STRUDEL);
    default:
      // For custom type, return the first available custom agent
      const customAgents = await listAgentsByType('custom');
      return customAgents.length > 0 ? customAgents[0] ?? null : null;
  }
}

/**
 * Lists all registered agents
 */
export async function listAgents(): Promise<AgentRegistration[]> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const agentIds = await redis.smembers(AGENT_REGISTRY_LIST_KEY);

  const agents: AgentRegistration[] = [];
  for (const id of agentIds) {
    const agent = await getAgent(id);
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}

/**
 * Lists agents by type
 */
export async function listAgentsByType(type: AgentType): Promise<AgentRegistration[]> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const agentIds = await redis.smembers(`${AGENT_TYPE_PREFIX}${type}`);

  const agents: AgentRegistration[] = [];
  for (const id of agentIds) {
    const agent = await getAgent(id);
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}

/**
 * Lists agents by capability
 */
export async function listAgentsByCapability(capabilityName: string): Promise<AgentRegistration[]> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const agentIds = await redis.smembers(`${AGENT_CAPABILITY_PREFIX}${capabilityName}`);

  const agents: AgentRegistration[] = [];
  for (const id of agentIds) {
    const agent = await getAgent(id);
    if (agent) {
      agents.push(agent);
    }
  }

  return agents;
}

/**
 * Gets the status of an agent
 */
export async function getAgentStatus(agentId: string): Promise<AgentHealthStatus | null> {
  const agent = await getAgent(agentId);

  if (!agent) {
    return null;
  }

  const executor = agentExecutors.get(agentId);
  let healthStatus: AgentHealthStatus;

  if (executor) {
    try {
      healthStatus = await executor.healthCheck();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      healthStatus = {
        agentId,
        healthy: false,
        status: 'error',
        message: errorMessage,
        lastCheck: new Date().toISOString(),
      };
    }
  } else {
    healthStatus = {
      agentId,
      healthy: false,
      status: 'offline',
      message: 'No executor registered',
      lastCheck: new Date().toISOString(),
    };
  }

  // Update last health check timestamp
  await updateAgentMetadata(agentId, { lastHealthCheck: healthStatus.lastCheck });

  return healthStatus;
}

/**
 * Updates an agent's status
 */
export async function updateAgentStatus(
  agentId: string,
  status: AgentStatus,
  message?: string
): Promise<void> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const agent = await getAgent(agentId);

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const updated: AgentRegistration = {
    ...agent,
    status,
    metadata: {
      ...agent.metadata,
      updatedAt: new Date().toISOString(),
      lastHealthCheck: new Date().toISOString(),
    },
  };

  if (message) {
    updated.description = message;
  }

  await redis.set(`${AGENT_REGISTRY_KEY_PREFIX}${agentId}`, JSON.stringify(updated));

  logger.debug({ agentId, status, message }, 'Agent status updated');
}

/**
 * Updates agent metadata
 */
async function updateAgentMetadata(
  agentId: string,
  metadata: Partial<AgentRegistration['metadata']>
): Promise<void> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const agent = await getAgent(agentId);

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const updated: AgentRegistration = {
    ...agent,
    metadata: {
      ...agent.metadata,
      ...metadata,
      updatedAt: new Date().toISOString(),
    },
  };

  await redis.set(`${AGENT_REGISTRY_KEY_PREFIX}${agentId}`, JSON.stringify(updated));
}

/**
 * Gets an agent executor
 */
export function getAgentExecutor(agentId: string): AgentExecutor | null {
  return agentExecutors.get(agentId) ?? null;
}

/**
 * Executes an agent
 */
export async function executeAgent(
  agentId: string,
  input: AgentExecutionInput
): Promise<AgentExecutionOutput> {
  const executor = agentExecutors.get(agentId);

  if (!executor) {
    return {
      success: false,
      error: `Agent not found or no executor registered: ${agentId}`,
      durationMs: 0,
    };
  }

  const agent = await getAgent(agentId);
  if (!agent) {
    return {
      success: false,
      error: `Agent registration not found: ${agentId}`,
      durationMs: 0,
    };
  }

  // Check if agent is available
  if (agent.status === 'offline' || agent.status === 'error') {
    return {
      success: false,
      error: `Agent is not available: ${agent.status}`,
      durationMs: 0,
    };
  }

  // Update status to busy
  await updateAgentStatus(agentId, 'busy');

  const startTime = Date.now();

  try {
    const result = await executor.execute(input);
    const durationMs = Date.now() - startTime;

    // Record agent metric
    void recordAgentMetric({
      agentId,
      agentType: agent.type,
      success: result.success,
      responseTimeMs: durationMs,
      errorType: result.error,
    });

    // Update status back to idle
    await updateAgentStatus(agentId, 'idle');

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    // Record agent metric
    void recordAgentMetric({
      agentId,
      agentType: agent.type,
      success: false,
      responseTimeMs: durationMs,
      errorType: errorMessage,
    });

    // Increment error count
    const newErrorCount = (agent.metadata.errorCount ?? 0) + 1;
    await updateAgentMetadata(agentId, { errorCount: newErrorCount });

    // Update status based on error count
    if (newErrorCount >= serviceConfig.maxAgentErrors) {
      await updateAgentStatus(agentId, 'error', errorMessage);
    } else {
      await updateAgentStatus(agentId, 'idle');
    }

    return {
      success: false,
      error: errorMessage,
      durationMs,
    };
  }
}

/**
 * Creates a Claude agent executor wrapper
 */
export function createClaudeExecutor(): AgentExecutor {
  // Lazy import to avoid circular dependencies
  return {
    async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
      const startTime = Date.now();

      try {
        // Dynamic import to avoid circular dependency
        const claudeService = await import('./claude.service.js');

        const result = await claudeService.executeClaudeCommand({
          id: generateRequestId().replace('req_', 'claude_'),
          userId: (input.context?.['userId'] as string) ?? 'system',
          prompt: input.prompt,
          systemPrompt: input.context?.['systemPrompt'] as string | undefined,
          model: input.config?.['model'] as string | undefined,
          maxTokens: input.config?.['maxTokens'] as number | undefined,
          timeoutMs: input.timeoutMs,
        });

        return {
          success: result.status === 'completed',
          result: result.parsedResponse?.content ?? result.stdout,
          error: result.error,
          durationMs: Date.now() - startTime,
          metadata: {
            processId: result.id,
            usage: result.parsedResponse?.usage,
            model: result.parsedResponse?.model,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          error: errorMessage,
          durationMs: Date.now() - startTime,
        };
      }
    },

    async healthCheck(): Promise<AgentHealthStatus> {
      try {
        const claudeService = await import('./claude.service.js');
        const health = await claudeService.getClaudeServiceHealth();

        return {
          agentId: BUILT_IN_AGENTS.CLAUDE,
          healthy: health.healthy,
          status: health.healthy ? 'idle' : 'error',
          message: health.healthy
            ? 'Claude service is healthy'
            : 'Claude service is not available',
          lastCheck: new Date().toISOString(),
          details: {
            cli: health.cli,
            apiFallback: health.apiFallbackAvailable,
            activeProcesses: health.activeProcesses,
            queueSize: health.queueSize,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          agentId: BUILT_IN_AGENTS.CLAUDE,
          healthy: false,
          status: 'error',
          message: errorMessage,
          lastCheck: new Date().toISOString(),
        };
      }
    },
  };
}

/**
 * Creates a Strudel agent executor wrapper
 */
export function createStrudelExecutor(): AgentExecutor {
  return {
    async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
      const startTime = Date.now();

      try {
        // Dynamic import to avoid circular dependency
        const strudelService = await import('./strudel.service.js');

        // The prompt is treated as a Strudel pattern
        const result = await strudelService.executeStrudelPattern({
          processId: generateRequestId().replace('req_', 'strudel_'),
          userId: (input.context?.['userId'] as string) ?? 'system',
          code: input.prompt,
          options: {
            duration: input.config?.['duration'] as number | undefined,
            sampleRate: input.config?.['sampleRate'] as number | undefined,
            channels: input.config?.['channels'] as number | undefined,
            format: 'wav',
          },
          priority: 0,
          createdAt: new Date(),
        });

        return {
          success: result.success,
          result: result.audioMetadata,
          error: result.error?.message,
          durationMs: Date.now() - startTime,
          metadata: {
            processId: result.processId,
            audioMetadata: result.audioMetadata,
            timing: result.timing,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          success: false,
          error: errorMessage,
          durationMs: Date.now() - startTime,
        };
      }
    },

    async healthCheck(): Promise<AgentHealthStatus> {
      try {
        const strudelService = await import('./strudel.service.js');
        const health = await strudelService.getStrudelServiceHealth();

        const healthy = health.status === 'healthy';

        return {
          agentId: BUILT_IN_AGENTS.STRUDEL,
          healthy,
          status: healthy ? 'idle' : health.status === 'degraded' ? 'busy' : 'error',
          message: healthy
            ? 'Strudel service is healthy'
            : `Strudel service status: ${health.status}`,
          lastCheck: new Date().toISOString(),
          details: {
            transpiler: health.transpiler,
            audioRenderer: health.audioRenderer,
            processes: health.processes,
            uptimeSeconds: health.uptimeSeconds,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          agentId: BUILT_IN_AGENTS.STRUDEL,
          healthy: false,
          status: 'error',
          message: errorMessage,
          lastCheck: new Date().toISOString(),
        };
      }
    },
  };
}

/**
 * Registers built-in agents (Claude and Strudel)
 */
export async function registerBuiltInAgents(): Promise<void> {
  // Register Claude agent
  await registerAgent(
    'claude',
    'Claude AI Assistant',
    [
      {
        name: 'text-generation',
        description: 'Generate text responses to prompts',
        inputTypes: ['text'],
        outputTypes: ['text'],
      },
      {
        name: 'code-generation',
        description: 'Generate and analyze code',
        inputTypes: ['text'],
        outputTypes: ['text', 'code'],
      },
      {
        name: 'reasoning',
        description: 'Complex reasoning and analysis',
        inputTypes: ['text'],
        outputTypes: ['text'],
      },
    ],
    createClaudeExecutor(),
    {},
    BUILT_IN_AGENTS.CLAUDE
  );

  // Register Strudel agent
  await registerAgent(
    'strudel',
    'Strudel Music Generator',
    [
      {
        name: 'pattern-execution',
        description: 'Execute Strudel music patterns',
        inputTypes: ['strudel-pattern'],
        outputTypes: ['audio'],
      },
      {
        name: 'audio-rendering',
        description: 'Render audio from patterns',
        inputTypes: ['strudel-pattern'],
        outputTypes: ['wav'],
      },
    ],
    createStrudelExecutor(),
    {},
    BUILT_IN_AGENTS.STRUDEL
  );

  logger.info('Built-in agents registered');
}

/**
 * Gets registry statistics
 */
export async function getRegistryStats(): Promise<{
  totalAgents: number;
  byType: Record<AgentType, number>;
  byStatus: Record<AgentStatus, number>;
}> {
  const agents = await listAgents();

  const byType: Record<AgentType, number> = {
    claude: 0,
    strudel: 0,
    custom: 0,
  };

  const byStatus: Record<AgentStatus, number> = {
    idle: 0,
    busy: 0,
    error: 0,
    offline: 0,
  };

  for (const agent of agents) {
    byType[agent.type]++;
    byStatus[agent.status]++;
  }

  return {
    totalAgents: agents.length,
    byType,
    byStatus,
  };
}

/**
 * Gets service configuration
 */
export function getServiceConfig(): AgentRegistryServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<AgentRegistryServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };

  // Restart health check interval with new config
  if (config.healthCheckIntervalMs) {
    startHealthCheckInterval();
  }

  logger.info('Agent registry service configuration updated');
}

/**
 * Shutdown the agent registry service
 */
export async function shutdownAgentRegistry(): Promise<void> {
  logger.info('Shutting down agent registry service...');

  // Stop health check interval
  stopHealthCheckInterval();

  // Clear in-memory executors
  agentExecutors.clear();

  logger.info('Agent registry service shutdown complete');
}

export default {
  initializeAgentRegistryService,
  registerAgent,
  unregisterAgent,
  getAgent,
  getDefaultAgent,
  listAgents,
  listAgentsByType,
  listAgentsByCapability,
  getAgentStatus,
  updateAgentStatus,
  getAgentExecutor,
  executeAgent,
  registerBuiltInAgents,
  createClaudeExecutor,
  createStrudelExecutor,
  getRegistryStats,
  stopHealthCheckInterval,
  shutdownAgentRegistry,
  getServiceConfig,
  updateServiceConfig,
  BUILT_IN_AGENTS,
};
