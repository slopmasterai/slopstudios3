/**
 * Agent Registry Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service
const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK' as never),
  setex: jest.fn().mockResolvedValue('OK' as never),
  del: jest.fn().mockResolvedValue(1 as never),
  keys: jest.fn().mockResolvedValue([] as never),
  sadd: jest.fn().mockResolvedValue(1 as never),
  srem: jest.fn().mockResolvedValue(1 as never),
  smembers: jest.fn().mockResolvedValue([] as never),
  exists: jest.fn().mockResolvedValue(0 as never),
};

jest.mock('../../src/services/redis.service.js', () => ({
  getRedisClient: jest.fn(() => mockRedis),
  isRedisConnected: jest.fn(() => true),
}));

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock claude service
jest.mock('../../src/services/claude.service.js', () => ({
  executeClaudeCommand: jest.fn().mockResolvedValue({
    status: 'completed',
    stdout: 'Claude response',
    parsedResponse: { content: 'Claude response' },
  }),
  getClaudeServiceHealth: jest.fn().mockResolvedValue({
    healthy: true,
    cli: { available: true },
    apiFallbackAvailable: true,
    activeProcesses: 0,
    queueSize: 0,
  }),
}));

// Mock strudel service
jest.mock('../../src/services/strudel.service.js', () => ({
  executeStrudelPattern: jest.fn().mockResolvedValue({
    success: true,
    processId: 'strudel-123',
    audioMetadata: { duration: 10 },
  }),
  getStrudelServiceHealth: jest.fn().mockResolvedValue({
    status: 'healthy',
    transpiler: { available: true },
    audioRenderer: { available: true },
    processes: { active: 0 },
    uptimeSeconds: 100,
  }),
}));

import type {
  AgentRegistration,
  AgentCapability,
  AgentType,
  AgentExecutor,
  AgentExecutionInput,
  AgentExecutionOutput,
  AgentHealthStatus,
} from '../../src/types/agent.types.js';

describe('AgentRegistryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null as never);
    mockRedis.keys.mockResolvedValue([] as never);
    mockRedis.smembers.mockResolvedValue([] as never);
  });

  afterEach(async () => {
    // Stop health check interval to prevent timer leaks
    const service = await import('../../src/services/agent-registry.service.js');
    service.stopHealthCheckInterval();
    jest.resetModules();
  });

  describe('registerAgent', () => {
    it('should register a new agent and return AgentRegistration directly', async () => {
      const { registerAgent } = await import('../../src/services/agent-registry.service.js');

      const capabilities: AgentCapability[] = [
        {
          name: 'text-generation',
          description: 'Generate text responses',
          inputTypes: ['text'],
          outputTypes: ['text'],
        },
      ];

      const executor: AgentExecutor = {
        execute: async (input: AgentExecutionInput): Promise<AgentExecutionOutput> => ({
          success: true,
          result: input.prompt,
          durationMs: 100,
        }),
        healthCheck: async (): Promise<AgentHealthStatus> => ({
          agentId: 'test',
          healthy: true,
          status: 'idle',
          lastCheck: new Date().toISOString(),
        }),
      };

      // registerAgent takes positional parameters: (type, name, capabilities, executor, config?, existingId?)
      const result = await registerAgent('custom', 'Test Agent', capabilities, executor);

      // Returns AgentRegistration directly
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Agent');
      expect(result.type).toBe('custom');
      expect(result.status).toBe('idle'); // Status is 'idle' not 'available'
      expect(result.capabilities).toEqual(capabilities);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.createdAt).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it('should allow re-registration with explicit existingId', async () => {
      // When explicitly providing an existingId, the service allows updating
      // an existing agent registration (re-registration pattern)
      const { registerAgent } = await import(
        '../../src/services/agent-registry.service.js'
      );

      const existingAgent: AgentRegistration = {
        id: 'agent-123',
        name: 'Existing Agent',
        type: 'custom',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingAgent) as never);

      const executor: AgentExecutor = {
        execute: async (): Promise<AgentExecutionOutput> => ({
          success: true,
          durationMs: 100,
        }),
        healthCheck: async (): Promise<AgentHealthStatus> => ({
          agentId: 'test',
          healthy: true,
          status: 'idle',
          lastCheck: new Date().toISOString(),
        }),
      };

      // Providing existingId allows updating an existing agent
      const result = await registerAgent('custom', 'Updated Agent', [], executor, {}, 'agent-123');

      expect(result.id).toBe('agent-123');
      expect(result.name).toBe('Updated Agent');
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister an existing agent', async () => {
      const { unregisterAgent } = await import('../../src/services/agent-registry.service.js');

      const existingAgent: AgentRegistration = {
        id: 'agent-123',
        name: 'Test Agent',
        type: 'custom',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingAgent) as never);

      const result = await unregisterAgent('agent-123');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockRedis.srem).toHaveBeenCalled();
    });

    it('should return false for non-existent agent', async () => {
      const { unregisterAgent } = await import('../../src/services/agent-registry.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await unregisterAgent('non-existent');

      expect(result).toBe(false);
    });

    it('should throw when trying to unregister built-in agents', async () => {
      const { unregisterAgent, BUILT_IN_AGENTS } = await import(
        '../../src/services/agent-registry.service.js'
      );

      const builtInAgent: AgentRegistration = {
        id: BUILT_IN_AGENTS.CLAUDE,
        name: 'Claude AI Assistant',
        type: 'claude',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(builtInAgent) as never);

      await expect(unregisterAgent(BUILT_IN_AGENTS.CLAUDE)).rejects.toThrow('built-in');
    });
  });

  describe('getAgent', () => {
    it('should retrieve an existing agent', async () => {
      const { getAgent } = await import('../../src/services/agent-registry.service.js');

      const mockAgent: AgentRegistration = {
        id: 'agent-123',
        name: 'Test Agent',
        type: 'custom',
        status: 'idle',
        capabilities: [
          {
            name: 'capability-1',
            description: 'Test capability',
          },
        ],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockAgent) as never);

      const result = await getAgent('agent-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('agent-123');
      expect(result?.name).toBe('Test Agent');
      expect(result?.status).toBe('idle');
    });

    it('should return null for non-existent agent', async () => {
      const { getAgent } = await import('../../src/services/agent-registry.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getAgent('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listAgents', () => {
    it('should list all registered agents', async () => {
      const { listAgents } = await import('../../src/services/agent-registry.service.js');

      const agent1: AgentRegistration = {
        id: 'agent-1',
        name: 'Agent 1',
        type: 'claude',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const agent2: AgentRegistration = {
        id: 'agent-2',
        name: 'Agent 2',
        type: 'strudel',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.smembers.mockResolvedValue(['agent-1', 'agent-2'] as never);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(agent1) as never)
        .mockResolvedValueOnce(JSON.stringify(agent2) as never);

      const result = await listAgents();

      expect(result.length).toBe(2);
    });
  });

  describe('listAgentsByType', () => {
    it('should filter agents by type', async () => {
      const { listAgentsByType } = await import('../../src/services/agent-registry.service.js');

      const claudeAgent: AgentRegistration = {
        id: 'agent-1',
        name: 'Claude Agent',
        type: 'claude',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.smembers.mockResolvedValue(['agent-1'] as never);
      mockRedis.get.mockResolvedValue(JSON.stringify(claudeAgent) as never);

      const result = await listAgentsByType('claude');

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('claude');
    });
  });

  describe('listAgentsByCapability', () => {
    it('should filter agents by capability', async () => {
      const { listAgentsByCapability } = await import(
        '../../src/services/agent-registry.service.js'
      );

      const textAgent: AgentRegistration = {
        id: 'agent-1',
        name: 'Text Agent',
        type: 'custom',
        status: 'idle',
        capabilities: [{ name: 'text-generation', description: 'Generate text' }],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.smembers.mockResolvedValue(['agent-1'] as never);
      mockRedis.get.mockResolvedValue(JSON.stringify(textAgent) as never);

      const result = await listAgentsByCapability('text-generation');

      expect(result.length).toBe(1);
      expect(result[0].capabilities[0].name).toBe('text-generation');
    });
  });

  describe('executeAgent', () => {
    it('should execute a registered agent', async () => {
      const { registerAgent, executeAgent } = await import(
        '../../src/services/agent-registry.service.js'
      );

      const executor: AgentExecutor = {
        execute: async (input: AgentExecutionInput): Promise<AgentExecutionOutput> => ({
          success: true,
          result: { echo: input.prompt },
          durationMs: 50,
        }),
        healthCheck: async (): Promise<AgentHealthStatus> => ({
          agentId: 'test',
          healthy: true,
          status: 'idle',
          lastCheck: new Date().toISOString(),
        }),
      };

      // Register a test agent
      const registration = await registerAgent('custom', 'Exec Test Agent', [], executor);
      const agentId = registration.id;

      // Mock the agent lookup for executeAgent
      mockRedis.get.mockResolvedValue(JSON.stringify(registration) as never);

      const result = await executeAgent(agentId, { prompt: 'hello' });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ echo: 'hello' });
    });

    it('should fail for non-existent agent', async () => {
      const { executeAgent } = await import('../../src/services/agent-registry.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await executeAgent('non-existent', { prompt: 'hello' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle executor errors gracefully', async () => {
      const { registerAgent, executeAgent } = await import(
        '../../src/services/agent-registry.service.js'
      );

      const executor: AgentExecutor = {
        execute: async (): Promise<AgentExecutionOutput> => {
          throw new Error('Executor failed');
        },
        healthCheck: async (): Promise<AgentHealthStatus> => ({
          agentId: 'test',
          healthy: true,
          status: 'idle',
          lastCheck: new Date().toISOString(),
        }),
      };

      // Register an agent that throws
      const registration = await registerAgent('custom', 'Error Agent', [], executor);
      const agentId = registration.id;

      mockRedis.get.mockResolvedValue(JSON.stringify(registration) as never);

      const result = await executeAgent(agentId, { prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Executor failed');
    });

    it('should not execute agent with error or offline status', async () => {
      const { registerAgent, executeAgent, updateAgentStatus } = await import(
        '../../src/services/agent-registry.service.js'
      );

      // First register the agent to add executor to memory
      mockRedis.get.mockResolvedValue(null as never); // No existing agent

      const executor: AgentExecutor = {
        execute: async (): Promise<AgentExecutionOutput> => ({
          success: true,
          durationMs: 100,
        }),
        healthCheck: async (): Promise<AgentHealthStatus> => ({
          agentId: 'agent-offline',
          healthy: false,
          status: 'offline',
          lastCheck: new Date().toISOString(),
        }),
      };

      const registration = await registerAgent(
        'custom',
        'Offline Agent',
        [],
        executor,
        {},
        'agent-offline'
      );

      // Now mock the agent with offline status in Redis
      const offlineAgent: AgentRegistration = {
        ...registration,
        status: 'offline',
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(offlineAgent) as never);

      const result = await executeAgent('agent-offline', { prompt: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });
  });

  describe('updateAgentStatus', () => {
    it('should update agent status', async () => {
      const { updateAgentStatus } = await import('../../src/services/agent-registry.service.js');

      const existingAgent: AgentRegistration = {
        id: 'agent-123',
        name: 'Test Agent',
        type: 'custom',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingAgent) as never);

      // updateAgentStatus is void, throws on error
      await expect(updateAgentStatus('agent-123', 'busy')).resolves.not.toThrow();
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should throw for non-existent agent', async () => {
      const { updateAgentStatus } = await import('../../src/services/agent-registry.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      await expect(updateAgentStatus('non-existent', 'busy')).rejects.toThrow('not found');
    });
  });

  describe('getAgentStatus', () => {
    it('should return agent health status', async () => {
      const { registerAgent, getAgentStatus } = await import(
        '../../src/services/agent-registry.service.js'
      );

      const executor: AgentExecutor = {
        execute: async (): Promise<AgentExecutionOutput> => ({
          success: true,
          durationMs: 100,
        }),
        healthCheck: async (): Promise<AgentHealthStatus> => ({
          agentId: 'agent-status-test',
          healthy: true,
          status: 'idle',
          message: 'All good',
          lastCheck: new Date().toISOString(),
        }),
      };

      const registration = await registerAgent('custom', 'Status Test Agent', [], executor);

      mockRedis.get.mockResolvedValue(JSON.stringify(registration) as never);

      const result = await getAgentStatus(registration.id);

      expect(result).not.toBeNull();
      expect(result?.healthy).toBe(true);
      expect(result?.status).toBe('idle');
    });

    it('should return null for non-existent agent', async () => {
      const { getAgentStatus } = await import('../../src/services/agent-registry.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getAgentStatus('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getRegistryStats', () => {
    it('should return registry statistics', async () => {
      const { getRegistryStats } = await import('../../src/services/agent-registry.service.js');

      const agent1: AgentRegistration = {
        id: 'agent-1',
        name: 'Claude Agent',
        type: 'claude',
        status: 'idle',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const agent2: AgentRegistration = {
        id: 'agent-2',
        name: 'Strudel Agent',
        type: 'strudel',
        status: 'busy',
        capabilities: [],
        config: {},
        metadata: {
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.smembers.mockResolvedValue(['agent-1', 'agent-2'] as never);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(agent1) as never)
        .mockResolvedValueOnce(JSON.stringify(agent2) as never);

      const stats = await getRegistryStats();

      expect(stats.totalAgents).toBe(2);
      expect(stats.byType.claude).toBe(1);
      expect(stats.byType.strudel).toBe(1);
      expect(stats.byStatus.idle).toBe(1);
      expect(stats.byStatus.busy).toBe(1);
    });
  });
});
