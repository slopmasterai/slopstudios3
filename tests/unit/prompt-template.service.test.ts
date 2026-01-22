/**
 * Prompt Template Service Unit Tests
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Redis service
const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK' as never),
  setex: jest.fn().mockResolvedValue('OK' as never),
  del: jest.fn().mockResolvedValue(1 as never),
  keys: jest.fn().mockResolvedValue([] as never),
  zadd: jest.fn().mockResolvedValue(1 as never),
  zcard: jest.fn().mockResolvedValue(1 as never),
  zrange: jest.fn().mockResolvedValue([] as never),
  zrevrange: jest.fn().mockResolvedValue([] as never),
  zrangebyscore: jest.fn().mockResolvedValue([] as never),
  zremrangebyrank: jest.fn().mockResolvedValue(0 as never),
  exists: jest.fn().mockResolvedValue(0 as never),
  sadd: jest.fn().mockResolvedValue(1 as never),
  srem: jest.fn().mockResolvedValue(1 as never),
  smembers: jest.fn().mockResolvedValue([] as never),
  sinter: jest.fn().mockResolvedValue([] as never),
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
      templateCacheTtl: 300,
    },
  },
}));

import type { PromptTemplate, CreateTemplateRequest, PromptVariable } from '../../src/types/agent.types.js';

describe('PromptTemplateService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null as never);
    mockRedis.keys.mockResolvedValue([] as never);
    mockRedis.zrevrange.mockResolvedValue([] as never);
    mockRedis.smembers.mockResolvedValue([] as never);

    // Clear template cache to prevent cross-test interference
    const { clearTemplateCache } = await import('../../src/services/prompt-template.service.js');
    clearTemplateCache();
  });

  afterEach(async () => {
    // Only reset modules when necessary, re-establish mocks afterward
  });

  describe('createTemplate', () => {
    it('should create a new template and return it directly', async () => {
      const { createTemplate } = await import('../../src/services/prompt-template.service.js');

      const request: CreateTemplateRequest = {
        name: 'Test Template',
        content: 'Hello {{name}}, welcome to {{place}}!',
        variables: [
          { name: 'name', type: 'string', required: true },
          { name: 'place', type: 'string', required: false, default: 'our app' },
        ],
        category: 'user',
        tags: ['greeting', 'welcome'],
      };

      mockRedis.exists.mockResolvedValue(0 as never);

      const result = await createTemplate(request);

      // createTemplate returns PromptTemplate directly
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Template');
      expect(result.version).toBe(1);
      expect(result.category).toBe('user');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.createdAt).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it('should throw on invalid template content', async () => {
      const { createTemplate } = await import('../../src/services/prompt-template.service.js');

      const request: CreateTemplateRequest = {
        name: 'Invalid Template',
        content: 'Unbalanced {{braces',
        variables: [],
        category: 'user',
      };

      await expect(createTemplate(request)).rejects.toThrow();
    });

    it('should throw when Redis is not connected', async () => {
      // Import redis service and temporarily mock isRedisConnected
      const redisService = await import('../../src/services/redis.service.js');
      const originalIsConnected = redisService.isRedisConnected;
      (redisService.isRedisConnected as jest.Mock).mockReturnValue(false);

      const { createTemplate } = await import('../../src/services/prompt-template.service.js');

      const request: CreateTemplateRequest = {
        name: 'Test Template',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', type: 'string', required: true }],
        category: 'user',
      };

      await expect(createTemplate(request)).rejects.toThrow('Redis not connected');

      // Restore mock
      (redisService.isRedisConnected as jest.Mock).mockReturnValue(true);
    });
  });

  describe('getTemplate', () => {
    it('should retrieve an existing template', async () => {
      const { getTemplate } = await import('../../src/services/prompt-template.service.js');

      const mockTemplate: PromptTemplate = {
        id: 'tpl_template-123',
        name: 'Test Template',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', type: 'string', required: true }],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockTemplate) as never);

      const result = await getTemplate('tpl_template-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('tpl_template-123');
      expect(result?.name).toBe('Test Template');
      expect(result?.metadata.createdAt).toBeDefined();
    });

    it('should return null for non-existent template', async () => {
      const { getTemplate } = await import('../../src/services/prompt-template.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await getTemplate('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template and return it directly', async () => {
      const { updateTemplate } = await import('../../src/services/prompt-template.service.js');

      const existingTemplate: PromptTemplate = {
        id: 'tpl_template-123',
        name: 'Test Template',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', type: 'string', required: true }],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingTemplate) as never);

      const result = await updateTemplate('tpl_template-123', {
        content: 'Updated: Hello {{name}}!',
      });

      // updateTemplate returns PromptTemplate directly
      expect(result).toBeDefined();
      expect(result.version).toBe(2);
      expect(result.content).toBe('Updated: Hello {{name}}!');
    });

    it('should throw when template does not exist', async () => {
      const { updateTemplate } = await import('../../src/services/prompt-template.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      await expect(
        updateTemplate('non-existent', {
          content: 'New content',
        })
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete an existing template', async () => {
      const { deleteTemplate } = await import('../../src/services/prompt-template.service.js');

      const existingTemplate: PromptTemplate = {
        id: 'tpl_template-123',
        name: 'Test Template',
        content: 'Hello!',
        variables: [],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(existingTemplate) as never);
      mockRedis.del.mockResolvedValue(1 as never);

      const result = await deleteTemplate('tpl_template-123');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockRedis.srem).toHaveBeenCalled();
    });

    it('should return false for non-existent template', async () => {
      const { deleteTemplate } = await import('../../src/services/prompt-template.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await deleteTemplate('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('interpolateTemplate', () => {
    it('should interpolate template by ID', async () => {
      const { interpolateTemplate } = await import('../../src/services/prompt-template.service.js');

      const mockTemplate: PromptTemplate = {
        id: 'tpl_template-123',
        name: 'Greeting',
        content: 'Hello {{name}}, your score is {{score}}!',
        variables: [
          { name: 'name', type: 'string', required: true },
          { name: 'score', type: 'number', required: true },
        ],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockTemplate) as never);

      const result = await interpolateTemplate('tpl_template-123', { name: 'Alice', score: 100 });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello Alice, your score is 100!');
    });

    it('should use default values when variable not provided', async () => {
      const { interpolateTemplate } = await import('../../src/services/prompt-template.service.js');

      const mockTemplate: PromptTemplate = {
        id: 'tpl_template-123',
        name: 'Greeting',
        content: 'Hello {{name}}, welcome to {{place}}!',
        variables: [
          { name: 'name', type: 'string', required: true },
          { name: 'place', type: 'string', required: false, default: 'our app' },
        ],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockTemplate) as never);

      const result = await interpolateTemplate('tpl_template-123', { name: 'Bob' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello Bob, welcome to our app!');
    });

    it('should fail when required variable is missing', async () => {
      const { interpolateTemplate } = await import('../../src/services/prompt-template.service.js');

      const mockTemplate: PromptTemplate = {
        id: 'tpl_template-123',
        name: 'Greeting',
        content: 'Hello {{name}}!',
        variables: [{ name: 'name', type: 'string', required: true }],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(mockTemplate) as never);

      const result = await interpolateTemplate('tpl_template-123', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
    });

    it('should return error for non-existent template', async () => {
      const { interpolateTemplate } = await import('../../src/services/prompt-template.service.js');

      mockRedis.get.mockResolvedValue(null as never);

      const result = await interpolateTemplate('non-existent', { name: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('interpolateTemplateContent', () => {
    it('should interpolate content directly with variables', async () => {
      const { interpolateTemplateContent } = await import(
        '../../src/services/prompt-template.service.js'
      );

      const variables: PromptVariable[] = [
        { name: 'name', type: 'string', required: true },
        { name: 'score', type: 'number', required: true },
      ];

      const result = interpolateTemplateContent(
        'Hello {{name}}, your score is {{score}}!',
        variables,
        { name: 'Alice', score: 100 }
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello Alice, your score is 100!');
    });

    it('should handle nested path variables', async () => {
      const { interpolateTemplateContent } = await import(
        '../../src/services/prompt-template.service.js'
      );

      const variables: PromptVariable[] = [
        { name: 'user', type: 'object', required: true },
      ];

      const result = interpolateTemplateContent(
        'User: {{user.name}}, Email: {{user.email}}',
        variables,
        { user: { name: 'Charlie', email: 'charlie@example.com' } }
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe('User: Charlie, Email: charlie@example.com');
    });
  });

  describe('listTemplates', () => {
    it('should list all templates with pagination', async () => {
      const { listTemplates, createTemplate } = await import(
        '../../src/services/prompt-template.service.js'
      );

      const template1: PromptTemplate = {
        id: 'tpl_template-1',
        name: 'Template 1',
        content: 'Content 1',
        variables: [],
        category: 'user',
        tags: ['tag1'],
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      const template2: PromptTemplate = {
        id: 'tpl_template-2',
        name: 'Template 2',
        content: 'Content 2',
        variables: [],
        category: 'system',
        tags: ['tag2'],
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.smembers.mockResolvedValue(['tpl_template-1', 'tpl_template-2'] as never);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(template1) as never)
        .mockResolvedValueOnce(JSON.stringify(template2) as never);

      const result = await listTemplates();

      // listTemplates returns paginated response
      expect(result.templates.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('should filter templates by category', async () => {
      const { listTemplates } = await import('../../src/services/prompt-template.service.js');

      const template1: PromptTemplate = {
        id: 'tpl_template-1',
        name: 'Template 1',
        content: 'Content 1',
        variables: [],
        category: 'user',
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.smembers.mockResolvedValue(['tpl_template-1'] as never);
      mockRedis.get.mockResolvedValue(JSON.stringify(template1) as never);

      const result = await listTemplates({ category: 'user' });

      expect(result.templates.length).toBe(1);
      expect(result.templates[0].category).toBe('user');
    });

    it('should filter templates by tags', async () => {
      const { listTemplates } = await import('../../src/services/prompt-template.service.js');

      const template1: PromptTemplate = {
        id: 'tpl_template-1',
        name: 'Template 1',
        content: 'Content 1',
        variables: [],
        category: 'user',
        tags: ['greeting', 'welcome'],
        version: 1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      mockRedis.smembers.mockResolvedValue(['tpl_template-1'] as never);
      mockRedis.get.mockResolvedValue(JSON.stringify(template1) as never);

      const result = await listTemplates({ tags: ['greeting'] });

      expect(result.templates.length).toBe(1);
      expect(result.templates[0].id).toBe('tpl_template-1');
    });
  });

  describe('validateTemplateContent', () => {
    it('should validate template with balanced braces', async () => {
      const { validateTemplateContent } = await import(
        '../../src/services/prompt-template.service.js'
      );

      const result = validateTemplateContent('Hello {{name}}, your score is {{score}}!');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.variables).toContain('name');
      expect(result.variables).toContain('score');
    });

    it('should detect unbalanced braces', async () => {
      const { validateTemplateContent } = await import(
        '../../src/services/prompt-template.service.js'
      );

      const result = validateTemplateContent('Hello {{name}, missing close brace');

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('brace'))).toBe(true);
    });
  });

  describe('validateVariables', () => {
    it('should validate variables with matching content variables', async () => {
      const { validateVariables } = await import('../../src/services/prompt-template.service.js');

      const variables: PromptVariable[] = [
        { name: 'name', type: 'string', required: true },
        { name: 'score', type: 'number', required: true },
      ];

      const result = validateVariables(variables, ['name', 'score']);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate variable definitions', async () => {
      const { validateVariables } = await import('../../src/services/prompt-template.service.js');

      const variables: PromptVariable[] = [
        { name: 'name', type: 'string', required: true },
        { name: 'name', type: 'string', required: false },
      ];

      const result = validateVariables(variables, ['name']);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });

    it('should warn about unused content variables', async () => {
      const { validateVariables } = await import('../../src/services/prompt-template.service.js');

      const variables: PromptVariable[] = [{ name: 'name', type: 'string', required: true }];

      const result = validateVariables(variables, ['name', 'friend']);

      expect(result.warnings?.some((w) => w.includes('friend'))).toBe(true);
    });
  });

  describe('getTemplateVersions', () => {
    it('should retrieve template versions', async () => {
      const { getTemplateVersions } = await import(
        '../../src/services/prompt-template.service.js'
      );

      const version1 = {
        templateId: 'tpl_template-123',
        version: 1,
        content: 'Version 1 content',
        variables: [],
        createdAt: new Date().toISOString(),
      };

      const version2 = {
        templateId: 'tpl_template-123',
        version: 2,
        content: 'Version 2 content',
        variables: [],
        createdAt: new Date().toISOString(),
      };

      mockRedis.zrevrange.mockResolvedValue([
        JSON.stringify(version2),
        JSON.stringify(version1),
      ] as never);

      const result = await getTemplateVersions('tpl_template-123');

      expect(result.length).toBe(2);
      expect(result[0].version).toBe(2);
      expect(result[1].version).toBe(1);
    });
  });
});
