/**
 * Workflow Context Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service
const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK' as never),
  setex: jest.fn().mockResolvedValue('OK' as never),
  del: jest.fn().mockResolvedValue(1 as never),
  expire: jest.fn().mockResolvedValue(1 as never),
  ttl: jest.fn().mockResolvedValue(3600 as never),
  keys: jest.fn().mockResolvedValue([] as never),
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

// Mock config
jest.mock('../../src/config/server.config.js', () => ({
  serverConfig: {
    agent: {
      contextTtlSeconds: 3600,
    },
  },
}));

import type { WorkflowContext } from '../../src/types/agent.types.js';

describe('WorkflowContextService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null as never);
    mockRedis.ttl.mockResolvedValue(3600 as never);
    mockRedis.keys.mockResolvedValue([] as never);
  });

  afterEach(async () => {
    jest.resetModules();
  });

  describe('createContext', () => {
    it('should create a new workflow context', async () => {
      const { createContext } = await import('../../src/services/workflow-context.service.js');

      // createContext(workflowId, initialData?, ttlSeconds?)
      const result = await createContext('workflow-123', { initialValue: 'test' });

      // Returns WorkflowContext with data (not variables) and metadata
      expect(result).not.toBeNull();
      expect(result.workflowId).toBe('workflow-123');
      expect(result.data['initialValue']).toBe('test');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.createdAt).toBeDefined();
      expect(result.metadata.updatedAt).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should create context with empty initial data', async () => {
      const { createContext } = await import('../../src/services/workflow-context.service.js');

      const result = await createContext('workflow-456');

      expect(result).not.toBeNull();
      expect(result.workflowId).toBe('workflow-456');
      expect(Object.keys(result.data)).toHaveLength(0);
    });

    it('should include TTL in metadata', async () => {
      const { createContext } = await import('../../src/services/workflow-context.service.js');

      const result = await createContext('workflow-789', { key: 'value' }, 7200);

      expect(result.metadata?.ttlSeconds).toBe(7200);
    });
  });

  describe('getContext', () => {
    it('should retrieve an existing context', async () => {
      const { getContext } = await import('../../src/services/workflow-context.service.js');

      const mockContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { key: 'value' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockContext) as never);

      const result = await getContext('workflow-123');

      expect(result).not.toBeNull();
      expect(result?.workflowId).toBe('workflow-123');
      expect(result?.data['key']).toBe('value');
    });

    it('should return null for non-existent context', async () => {
      const { getContext } = await import('../../src/services/workflow-context.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getContext('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('setContextValue', () => {
    it('should set a simple value in context', async () => {
      const { setContextValue } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { existing: 'data' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const result = await setContextValue('workflow-123', 'newKey', 'newValue');

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should set a nested path value in context', async () => {
      const { setContextValue } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { user: { name: 'Alice' } },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const result = await setContextValue('workflow-123', 'user.email', 'alice@example.com');

      expect(result).toBe(true);
    });

    it('should throw for non-existent context', async () => {
      const { setContextValue } = await import('../../src/services/workflow-context.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      await expect(setContextValue('non-existent', 'key', 'value')).rejects.toThrow('not found');
    });
  });

  describe('getContextValue', () => {
    it('should get a value from context', async () => {
      const { getContextValue } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { user: { name: 'Alice', email: 'alice@test.com' } },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const result = await getContextValue('workflow-123', 'user.name');

      expect(result.success).toBe(true);
      expect(result.value).toBe('Alice');
      expect(result.path).toBe('user.name');
    });

    it('should return error for missing path', async () => {
      const { getContextValue } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { existing: 'value' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const result = await getContextValue('workflow-123', 'missing.path');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('mergeContext', () => {
    it('should merge new data into existing context', async () => {
      const { mergeContext } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { a: 1, b: 2 },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const result = await mergeContext('workflow-123', { b: 3, c: 4 });

      expect(result).not.toBeNull();
      expect(result?.data['a']).toBe(1);
      expect(result?.data['b']).toBe(3);
      expect(result?.data['c']).toBe(4);
    });

    it('should throw for non-existent context', async () => {
      const { mergeContext } = await import('../../src/services/workflow-context.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      await expect(mergeContext('non-existent', { key: 'value' })).rejects.toThrow('not found');
    });

    it('should deep merge nested objects', async () => {
      const { mergeContext } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { user: { name: 'Alice', settings: { theme: 'light' } } },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const result = await mergeContext('workflow-123', {
        user: { settings: { language: 'en' } },
      });

      expect(result.data.user).toBeDefined();
      const user = result.data.user as Record<string, any>;
      expect(user.name).toBe('Alice');
      expect(user.settings.theme).toBe('light');
      expect(user.settings.language).toBe('en');
    });
  });

  describe('createSnapshot', () => {
    it('should create a snapshot of current context', async () => {
      const { createSnapshot } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { key: 'value' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const snapshotId = await createSnapshot('workflow-123');

      expect(snapshotId).toBeDefined();
      expect(typeof snapshotId).toBe('string');
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should throw for non-existent context', async () => {
      const { createSnapshot } = await import('../../src/services/workflow-context.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      await expect(createSnapshot('non-existent')).rejects.toThrow('not found');
    });

    it('should create snapshot with label', async () => {
      const { createSnapshot } = await import('../../src/services/workflow-context.service.js');

      const existingContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { key: 'value' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingContext) as never);

      const snapshotId = await createSnapshot('workflow-123', 'before-step-2');

      expect(snapshotId).toContain('before-step-2');
    });
  });

  describe('restoreSnapshot', () => {
    it('should restore context from snapshot', async () => {
      const { restoreSnapshot } = await import('../../src/services/workflow-context.service.js');

      const snapshotContext: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { restored: 'data' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(snapshotContext) as never);

      const result = await restoreSnapshot('workflow-123', 'snapshot-1');

      expect(result).not.toBeNull();
      expect(result?.data['restored']).toBe('data');
    });

    it('should throw for non-existent snapshot', async () => {
      const { restoreSnapshot } = await import('../../src/services/workflow-context.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      await expect(restoreSnapshot('workflow-123', 'non-existent')).rejects.toThrow('not found');
    });
  });

  describe('listSnapshots', () => {
    it('should list all snapshots for a workflow', async () => {
      const { listSnapshots } = await import('../../src/services/workflow-context.service.js');

      mockRedis.keys.mockResolvedValue([
        'workflow:context:snapshot:workflow-123:1234567890-auto',
        'workflow:context:snapshot:workflow-123:1234567891-before-step',
      ] as never);

      const result = await listSnapshots('workflow-123');

      expect(result.length).toBe(2);
      expect(result[0].id).toBeDefined();
      expect(result[0].createdAt).toBeDefined();
    });
  });

  describe('resolveVariables', () => {
    it('should resolve context variables in template string', async () => {
      const { resolveVariables } = await import('../../src/services/workflow-context.service.js');

      const context: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { name: 'Alice', greeting: 'Hello' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(context) as never);

      // resolveVariables takes workflowId and template string
      // Uses {{context.path}} syntax
      const result = await resolveVariables(
        'workflow-123',
        '{{context.greeting}} {{context.name}}!'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello Alice!');
    });

    it('should resolve nested variable references', async () => {
      const { resolveVariables } = await import('../../src/services/workflow-context.service.js');

      const context: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { user: { name: 'Bob', email: 'bob@example.com' } },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(context) as never);

      const result = await resolveVariables(
        'workflow-123',
        'Name: {{context.user.name}}, Email: {{context.user.email}}'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('Name: Bob, Email: bob@example.com');
    });

    it('should handle missing variables with errors', async () => {
      const { resolveVariables } = await import('../../src/services/workflow-context.service.js');

      const context: WorkflowContext = {
        workflowId: 'workflow-123',
        data: { existing: 'value' },
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(context) as never);

      const result = await resolveVariables(
        'workflow-123',
        'Existing: {{context.existing}}, Missing: {{context.missing}}'
      );

      expect(result.result).toContain('Existing: value');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('missing');
    });

    it('should return error for non-existent context', async () => {
      const { resolveVariables } = await import('../../src/services/workflow-context.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await resolveVariables('non-existent', '{{context.any}}');

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });
  });

  describe('resolveVariablesWithData', () => {
    it('should resolve variables from provided data synchronously', async () => {
      const { resolveVariablesWithData } = await import(
        '../../src/services/workflow-context.service.js'
      );

      const data = { x: '10', y: '20' };
      const result = resolveVariablesWithData('{{context.x}} + {{context.y}}', data);

      expect(result.success).toBe(true);
      expect(result.result).toBe('10 + 20');
    });

    it('should handle arrays in context data', async () => {
      const { resolveVariablesWithData } = await import(
        '../../src/services/workflow-context.service.js'
      );

      const data = { items: ['first', 'second', 'third'] };
      const result = resolveVariablesWithData('First: {{context.items[0]}}', data);

      expect(result.success).toBe(true);
      expect(result.result).toBe('First: first');
    });
  });

  describe('clearContext', () => {
    it('should clear an existing context', async () => {
      const { clearContext } = await import('../../src/services/workflow-context.service.js');

      mockRedis.del.mockResolvedValue(1 as never);
      mockRedis.keys.mockResolvedValue([] as never);

      const result = await clearContext('workflow-123');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should return false for non-existent context', async () => {
      const { clearContext } = await import('../../src/services/workflow-context.service.js');

      mockRedis.del.mockResolvedValue(0 as never);
      mockRedis.keys.mockResolvedValue([] as never);

      const result = await clearContext('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('extendContextTtl', () => {
    it('should extend the TTL of a context', async () => {
      const { extendContextTtl } = await import('../../src/services/workflow-context.service.js');

      mockRedis.ttl.mockResolvedValue(1800 as never);
      mockRedis.expire.mockResolvedValue(1 as never);

      const result = await extendContextTtl('workflow-123', 3600);

      expect(result).toBe(true);
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('should return false for non-existent context', async () => {
      const { extendContextTtl } = await import('../../src/services/workflow-context.service.js');

      mockRedis.ttl.mockResolvedValue(-2 as never); // Key doesn't exist

      const result = await extendContextTtl('non-existent', 3600);

      expect(result).toBe(false);
    });
  });
});
