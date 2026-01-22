/**
 * Prompt Template Service
 * Manages prompt templates with versioning, variable interpolation, and Redis storage
 */

import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import { recordTemplateMetric } from './agent-metrics.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  PromptTemplate,
  PromptTemplateVersion,
  PromptVariable,
  PromptTemplateCategory,
  TemplateInterpolationResult,
  CreateTemplateRequest,
  UpdateTemplateRequest,
} from '../types/agent.types.js';

// Redis key prefixes
const TEMPLATE_KEY_PREFIX = 'prompt:template:';
const TEMPLATE_VERSIONS_KEY_PREFIX = 'prompt:template:versions:';
const TEMPLATE_LIST_KEY = 'prompt:templates';
const TEMPLATE_CATEGORY_PREFIX = 'prompt:templates:category:';
const TEMPLATE_TAGS_PREFIX = 'prompt:templates:tag:';

// In-memory cache for frequently used templates
const templateCache = new Map<string, { template: PromptTemplate; cachedAt: number }>();

// Service configuration
interface PromptTemplateServiceConfig {
  cacheTtlMs: number;
  maxVersions: number;
  maxTemplateContentLength: number;
  maxVariables: number;
}

let serviceConfig: PromptTemplateServiceConfig = {
  cacheTtlMs: parseInt(process.env['AGENT_TEMPLATE_CACHE_TTL'] ?? '300', 10) * 1000,
  maxVersions: 100,
  maxTemplateContentLength: 100000,
  maxVariables: 50,
};

// Built-in template IDs
export const BUILTIN_TEMPLATE_IDS = {
  SELF_CRITIQUE_EVALUATION: 'builtin:self-critique:evaluation',
  SELF_CRITIQUE_IMPROVEMENT: 'builtin:self-critique:improvement',
  DISCUSSION_PARTICIPANT: 'builtin:discussion:participant',
  DISCUSSION_FACILITATOR: 'builtin:discussion:facilitator',
} as const;

// Default self-critique evaluation template
const DEFAULT_SELF_CRITIQUE_EVALUATION_TEMPLATE = `You are evaluating the quality of an output based on specific criteria.

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

// Default self-critique improvement template
const DEFAULT_SELF_CRITIQUE_IMPROVEMENT_TEMPLATE = `You are improving content based on critique feedback.

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

// Default discussion participant template
const DEFAULT_DISCUSSION_PARTICIPANT_TEMPLATE = `You are participating in a collaborative discussion as a {{role}}.
Your perspective: {{perspective}}

Topic: {{topic}}

{{#if previousRound}}
Previous round synthesis:
{{previousRound.synthesis}}

Previous contributions from other participants:
{{#each previousRound.contributions}}
- {{this.role}}: {{this.content}}
{{/each}}
{{else}}
This is the first round of discussion.
{{/if}}

Provide your contribution considering:
1. The topic and overall goal
2. Previous participants' points (if any)
3. Your unique perspective as {{role}}
4. Areas of agreement and disagreement

Be constructive, specific, and aim to advance the discussion toward consensus.
End your contribution with a brief statement of your agreement level (1-10) with the current direction.`;

// Default discussion facilitator template
const DEFAULT_DISCUSSION_FACILITATOR_TEMPLATE = `You are the facilitator synthesizing contributions from multiple participants.

Topic: {{topic}}

Round {{round}} contributions:
{{#each contributions}}
Participant ({{this.role}}): {{this.content}}
{{/each}}

Your task:
1. Identify common themes and areas of agreement
2. Note key disagreements and differing perspectives
3. Synthesize a coherent position that addresses all viewpoints
4. Assess the overall consensus level

Respond with:
1. A synthesis that incorporates the best ideas from all participants
2. A consensus score from 0 to 1 indicating the level of agreement
3. Key points that need further discussion (if any)

Format your response as JSON:
{
  "synthesis": "Your synthesized position...",
  "consensusScore": 0.75,
  "agreements": ["point 1", "point 2"],
  "disagreements": ["point 1"],
  "nextSteps": ["suggestion 1"]
}`;

// In-memory fallback templates (used when Redis is unavailable)
const builtinTemplates: Map<string, PromptTemplate> = new Map();

/**
 * Creates a built-in template object
 */
function createBuiltinTemplate(
  id: string,
  name: string,
  description: string,
  content: string,
  category: PromptTemplateCategory,
  tags: string[],
  variables: PromptVariable[]
): PromptTemplate {
  const now = new Date().toISOString();
  return {
    id,
    name,
    description,
    content,
    variables,
    category,
    tags,
    version: 1,
    metadata: {
      createdAt: now,
      createdBy: 'system',
      updatedAt: now,
      updatedBy: 'system',
    },
  };
}

/**
 * Initializes the built-in templates in memory
 */
function initializeBuiltinTemplates(): void {
  // Self-critique evaluation template
  builtinTemplates.set(
    BUILTIN_TEMPLATE_IDS.SELF_CRITIQUE_EVALUATION,
    createBuiltinTemplate(
      BUILTIN_TEMPLATE_IDS.SELF_CRITIQUE_EVALUATION,
      'Self-Critique Evaluation',
      'Evaluates output quality against specified criteria and provides scores, feedback, and improvement suggestions.',
      DEFAULT_SELF_CRITIQUE_EVALUATION_TEMPLATE,
      'evaluation',
      ['self-critique', 'evaluation', 'quality', 'builtin'],
      [
        { name: 'output', type: 'string', required: true, description: 'The output to evaluate' },
        { name: 'criteria', type: 'string', required: true, description: 'Formatted criteria for evaluation' },
      ]
    )
  );

  // Self-critique improvement template
  builtinTemplates.set(
    BUILTIN_TEMPLATE_IDS.SELF_CRITIQUE_IMPROVEMENT,
    createBuiltinTemplate(
      BUILTIN_TEMPLATE_IDS.SELF_CRITIQUE_IMPROVEMENT,
      'Self-Critique Improvement',
      'Generates an improved version of content based on critique feedback and suggestions.',
      DEFAULT_SELF_CRITIQUE_IMPROVEMENT_TEMPLATE,
      'generation',
      ['self-critique', 'improvement', 'generation', 'builtin'],
      [
        { name: 'output', type: 'string', required: true, description: 'The original output to improve' },
        { name: 'feedback', type: 'string', required: true, description: 'Critique feedback' },
        { name: 'suggestions', type: 'string', required: true, description: 'Specific improvement suggestions' },
        { name: 'scores', type: 'string', required: true, description: 'Quality scores from evaluation' },
      ]
    )
  );

  // Discussion participant template
  builtinTemplates.set(
    BUILTIN_TEMPLATE_IDS.DISCUSSION_PARTICIPANT,
    createBuiltinTemplate(
      BUILTIN_TEMPLATE_IDS.DISCUSSION_PARTICIPANT,
      'Discussion Participant',
      'Guides a participant in a multi-agent discussion to provide constructive contributions.',
      DEFAULT_DISCUSSION_PARTICIPANT_TEMPLATE,
      'collaboration',
      ['discussion', 'participant', 'collaboration', 'builtin'],
      [
        { name: 'role', type: 'string', required: true, description: 'The participant role' },
        { name: 'perspective', type: 'string', required: false, description: 'The participant perspective', default: 'General perspective' },
        { name: 'topic', type: 'string', required: true, description: 'The discussion topic' },
        { name: 'previousRound', type: 'object', required: false, description: 'Previous round data including synthesis and contributions' },
      ]
    )
  );

  // Discussion facilitator template
  builtinTemplates.set(
    BUILTIN_TEMPLATE_IDS.DISCUSSION_FACILITATOR,
    createBuiltinTemplate(
      BUILTIN_TEMPLATE_IDS.DISCUSSION_FACILITATOR,
      'Discussion Facilitator',
      'Synthesizes contributions from multiple discussion participants and assesses consensus.',
      DEFAULT_DISCUSSION_FACILITATOR_TEMPLATE,
      'collaboration',
      ['discussion', 'facilitator', 'synthesis', 'consensus', 'builtin'],
      [
        { name: 'topic', type: 'string', required: true, description: 'The discussion topic' },
        { name: 'round', type: 'number', required: true, description: 'The current round number' },
        { name: 'contributions', type: 'array', required: true, description: 'Array of participant contributions' },
      ]
    )
  );

  logger.debug(
    { templateCount: builtinTemplates.size },
    'Built-in templates initialized in memory'
  );
}

/**
 * Registers built-in templates to Redis storage
 * This allows them to be listed, queried, and overridden
 */
export async function registerBuiltinTemplates(): Promise<void> {
  if (!isRedisConnected()) {
    logger.warn('Redis not connected, built-in templates available in memory only');
    return;
  }

  const redis = getRedisClient();

  for (const [id, template] of builtinTemplates) {
    try {
      // Check if template already exists in Redis
      const existing = await redis.get(`${TEMPLATE_KEY_PREFIX}${id}`);
      if (existing) {
        logger.debug({ templateId: id }, 'Built-in template already registered');
        continue;
      }

      // Store template
      await redis.set(`${TEMPLATE_KEY_PREFIX}${id}`, JSON.stringify(template));

      // Add to template list
      await redis.sadd(TEMPLATE_LIST_KEY, id);

      // Add to category index
      await redis.sadd(`${TEMPLATE_CATEGORY_PREFIX}${template.category}`, id);

      // Add to tag indices
      if (template.tags) {
        for (const tag of template.tags) {
          await redis.sadd(`${TEMPLATE_TAGS_PREFIX}${tag}`, id);
        }
      }

      logger.debug({ templateId: id }, 'Built-in template registered');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ templateId: id, error: errorMessage }, 'Failed to register built-in template');
    }
  }

  logger.info(
    { templateCount: builtinTemplates.size },
    'Built-in templates registration completed'
  );
}

/**
 * Gets a built-in template by ID (in-memory fallback)
 */
export function getBuiltinTemplate(templateId: string): PromptTemplate | null {
  return builtinTemplates.get(templateId) ?? null;
}

/**
 * Lists all built-in template IDs
 */
export function listBuiltinTemplateIds(): string[] {
  return Array.from(builtinTemplates.keys());
}

/**
 * Initializes the prompt template service
 */
export function initializePromptTemplateService(
  config?: Partial<PromptTemplateServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  // Initialize built-in templates in memory
  initializeBuiltinTemplates();

  logger.info(
    {
      cacheTtlMs: serviceConfig.cacheTtlMs,
      maxVersions: serviceConfig.maxVersions,
      builtinTemplates: builtinTemplates.size,
    },
    'Prompt template service initialized'
  );
}

/**
 * Generates a unique template ID
 */
function generateTemplateId(): string {
  return generateRequestId().replace('req_', 'tpl_');
}

/**
 * Gets a template from cache if valid
 */
function getFromCache(templateId: string): PromptTemplate | null {
  const cached = templateCache.get(templateId);
  if (cached && Date.now() - cached.cachedAt < serviceConfig.cacheTtlMs) {
    return cached.template;
  }
  if (cached) {
    templateCache.delete(templateId);
  }
  return null;
}

/**
 * Sets a template in cache
 */
function setInCache(template: PromptTemplate): void {
  templateCache.set(template.id, { template, cachedAt: Date.now() });
}

/**
 * Clears a template from cache
 */
function clearFromCache(templateId: string): void {
  templateCache.delete(templateId);
}

/**
 * Validates template content for proper variable syntax
 */
export function validateTemplateContent(content: string): {
  valid: boolean;
  errors: string[];
  variables: string[];
} {
  const errors: string[] = [];
  const variables: string[] = [];

  // Check for unbalanced braces
  const openBraces = (content.match(/\{\{/g) ?? []).length;
  const closeBraces = (content.match(/\}\}/g) ?? []).length;

  if (openBraces !== closeBraces) {
    errors.push('Unbalanced template braces: {{ and }} counts do not match');
  }

  // Extract variable names
  const variablePattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
  let match;
  while ((match = variablePattern.exec(content)) !== null) {
    const varName = match[1] ?? '';
    if (varName && !variables.includes(varName)) {
      variables.push(varName);
    }
  }

  // Check for invalid variable names
  const invalidPattern = /\{\{\s*([^}]*[^a-zA-Z0-9_.\s][^}]*)\s*\}\}/g;
  while ((match = invalidPattern.exec(content)) !== null) {
    errors.push(`Invalid variable syntax: {{${match[1] ?? ''}}}`);
  }

  // Check content length
  if (content.length > serviceConfig.maxTemplateContentLength) {
    errors.push(
      `Template content exceeds maximum length of ${serviceConfig.maxTemplateContentLength} characters`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    variables,
  };
}

/**
 * Validates variable definitions
 */
export function validateVariables(
  variables: PromptVariable[],
  contentVariables: string[]
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const definedNames = new Set<string>();

  if (variables.length > serviceConfig.maxVariables) {
    errors.push(`Too many variables: ${variables.length} exceeds maximum of ${serviceConfig.maxVariables}`);
  }

  for (const variable of variables) {
    // Check for duplicates
    if (definedNames.has(variable.name)) {
      errors.push(`Duplicate variable definition: ${variable.name}`);
    }
    definedNames.add(variable.name);

    // Validate variable name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable.name)) {
      errors.push(`Invalid variable name format: ${variable.name}`);
    }

    // Check if required variable has default
    if (variable.required && variable.default !== undefined) {
      warnings.push(
        `Variable "${variable.name}" is marked as required but has a default value`
      );
    }

    // Validate default value type matches declared type
    if (variable.default !== undefined) {
      const defaultType = Array.isArray(variable.default)
        ? 'array'
        : typeof variable.default;
      if (defaultType !== variable.type && !(variable.type === 'object' && defaultType === 'object')) {
        errors.push(
          `Variable "${variable.name}" default value type (${defaultType}) does not match declared type (${variable.type})`
        );
      }
    }
  }

  // Check for variables used in content but not defined
  for (const contentVar of contentVariables) {
    // Handle nested paths - only check the root variable
    const rootVar = contentVar.split('.')[0] ?? '';
    if (rootVar && !definedNames.has(rootVar)) {
      warnings.push(
        `Variable "${rootVar}" used in template content but not defined in variables list`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Creates a new prompt template
 */
export async function createTemplate(
  request: CreateTemplateRequest,
  createdBy?: string
): Promise<PromptTemplate> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const templateId = generateTemplateId();
  const now = new Date().toISOString();

  // Validate content
  const contentValidation = validateTemplateContent(request.content);
  if (!contentValidation.valid) {
    throw new Error(`Invalid template content: ${contentValidation.errors.join(', ')}`);
  }

  // Validate variables
  const variableValidation = validateVariables(request.variables, contentValidation.variables);
  if (!variableValidation.valid) {
    throw new Error(`Invalid variables: ${variableValidation.errors.join(', ')}`);
  }

  const template: PromptTemplate = {
    id: templateId,
    name: request.name,
    description: request.description,
    content: request.content,
    variables: request.variables,
    category: request.category,
    tags: request.tags ?? [],
    version: 1,
    metadata: {
      createdAt: now,
      createdBy,
      updatedAt: now,
      updatedBy: createdBy,
    },
  };

  // Store template
  await redis.set(`${TEMPLATE_KEY_PREFIX}${templateId}`, JSON.stringify(template));

  // Add to template list
  await redis.sadd(TEMPLATE_LIST_KEY, templateId);

  // Add to category index
  await redis.sadd(`${TEMPLATE_CATEGORY_PREFIX}${request.category}`, templateId);

  // Add to tag indices
  if (request.tags) {
    for (const tag of request.tags) {
      await redis.sadd(`${TEMPLATE_TAGS_PREFIX}${tag}`, templateId);
    }
  }

  // Store initial version
  const version: PromptTemplateVersion = {
    templateId,
    version: 1,
    content: request.content,
    variables: request.variables,
    createdAt: now,
    createdBy,
    changeDescription: 'Initial version',
  };
  await redis.zadd(`${TEMPLATE_VERSIONS_KEY_PREFIX}${templateId}`, 1, JSON.stringify(version));

  // Cache the template
  setInCache(template);

  logger.info({ templateId, name: request.name }, 'Template created');

  return template;
}

/**
 * Gets a template by ID
 * Checks Redis first, then falls back to built-in templates
 */
export async function getTemplate(templateId: string): Promise<PromptTemplate | null> {
  // Check cache first
  const cached = getFromCache(templateId);
  if (cached) {
    return cached;
  }

  // Try Redis if connected
  if (isRedisConnected()) {
    const redis = getRedisClient();
    const data = await redis.get(`${TEMPLATE_KEY_PREFIX}${templateId}`);

    if (data) {
      const template = JSON.parse(data) as PromptTemplate;
      setInCache(template);
      return template;
    }
  }

  // Fall back to built-in templates
  const builtinTemplate = getBuiltinTemplate(templateId);
  if (builtinTemplate) {
    setInCache(builtinTemplate);
    return builtinTemplate;
  }

  return null;
}

/**
 * Updates an existing template
 */
export async function updateTemplate(
  templateId: string,
  request: UpdateTemplateRequest,
  updatedBy?: string
): Promise<PromptTemplate> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const existing = await getTemplate(templateId);

  if (!existing) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const now = new Date().toISOString();

  // Validate new content if provided
  const newContent = request.content ?? existing.content;
  const contentValidation = validateTemplateContent(newContent);
  if (!contentValidation.valid) {
    throw new Error(`Invalid template content: ${contentValidation.errors.join(', ')}`);
  }

  // Validate new variables if provided
  const newVariables = request.variables ?? existing.variables;
  const variableValidation = validateVariables(newVariables, contentValidation.variables);
  if (!variableValidation.valid) {
    throw new Error(`Invalid variables: ${variableValidation.errors.join(', ')}`);
  }

  // Check if content or variables changed (requires new version)
  const contentChanged = request.content !== undefined && request.content !== existing.content;
  const variablesChanged =
    request.variables !== undefined &&
    JSON.stringify(request.variables) !== JSON.stringify(existing.variables);
  const newVersion = contentChanged || variablesChanged ? existing.version + 1 : existing.version;

  // Update category index if changed
  if (request.category && request.category !== existing.category) {
    await redis.srem(`${TEMPLATE_CATEGORY_PREFIX}${existing.category}`, templateId);
    await redis.sadd(`${TEMPLATE_CATEGORY_PREFIX}${request.category}`, templateId);
  }

  // Update tag indices if changed
  if (request.tags) {
    // Remove from old tags
    if (existing.tags) {
      for (const tag of existing.tags) {
        if (!request.tags.includes(tag)) {
          await redis.srem(`${TEMPLATE_TAGS_PREFIX}${tag}`, templateId);
        }
      }
    }
    // Add to new tags
    for (const tag of request.tags) {
      if (!existing.tags?.includes(tag)) {
        await redis.sadd(`${TEMPLATE_TAGS_PREFIX}${tag}`, templateId);
      }
    }
  }

  const updated: PromptTemplate = {
    ...existing,
    name: request.name ?? existing.name,
    description: request.description ?? existing.description,
    content: newContent,
    variables: newVariables,
    category: request.category ?? existing.category,
    tags: request.tags ?? existing.tags,
    version: newVersion,
    metadata: {
      ...existing.metadata,
      updatedAt: now,
      updatedBy,
    },
  };

  // Store updated template
  await redis.set(`${TEMPLATE_KEY_PREFIX}${templateId}`, JSON.stringify(updated));

  // Store new version if content/variables changed
  if (contentChanged || variablesChanged) {
    const version: PromptTemplateVersion = {
      templateId,
      version: newVersion,
      content: newContent,
      variables: newVariables,
      createdAt: now,
      createdBy: updatedBy,
      changeDescription: request.changeDescription,
    };
    await redis.zadd(
      `${TEMPLATE_VERSIONS_KEY_PREFIX}${templateId}`,
      newVersion,
      JSON.stringify(version)
    );

    // Trim old versions if exceeding max
    const versionCount = await redis.zcard(`${TEMPLATE_VERSIONS_KEY_PREFIX}${templateId}`);
    if (versionCount > serviceConfig.maxVersions) {
      await redis.zremrangebyrank(
        `${TEMPLATE_VERSIONS_KEY_PREFIX}${templateId}`,
        0,
        versionCount - serviceConfig.maxVersions - 1
      );
    }
  }

  // Update cache
  clearFromCache(templateId);
  setInCache(updated);

  logger.info({ templateId, version: newVersion }, 'Template updated');

  return updated;
}

/**
 * Deletes a template
 */
export async function deleteTemplate(templateId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const existing = await getTemplate(templateId);

  if (!existing) {
    return false;
  }

  // Remove from category index
  await redis.srem(`${TEMPLATE_CATEGORY_PREFIX}${existing.category}`, templateId);

  // Remove from tag indices
  if (existing.tags) {
    for (const tag of existing.tags) {
      await redis.srem(`${TEMPLATE_TAGS_PREFIX}${tag}`, templateId);
    }
  }

  // Remove from template list
  await redis.srem(TEMPLATE_LIST_KEY, templateId);

  // Delete versions
  await redis.del(`${TEMPLATE_VERSIONS_KEY_PREFIX}${templateId}`);

  // Delete template
  await redis.del(`${TEMPLATE_KEY_PREFIX}${templateId}`);

  // Clear cache
  clearFromCache(templateId);

  logger.info({ templateId }, 'Template deleted');

  return true;
}

/**
 * Lists templates with optional filtering
 */
export async function listTemplates(options?: {
  category?: PromptTemplateCategory;
  tags?: string[];
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{
  templates: PromptTemplate[];
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

  let templateIds: string[];

  // Get template IDs based on filters
  if (options?.category) {
    templateIds = await redis.smembers(`${TEMPLATE_CATEGORY_PREFIX}${options.category}`);
  } else if (options?.tags && options.tags.length > 0) {
    // Intersection of all tag sets
    const tagKeys = options.tags.map((tag) => `${TEMPLATE_TAGS_PREFIX}${tag}`);
    const firstTagKey = tagKeys[0];
    if (tagKeys.length === 1 && firstTagKey) {
      templateIds = await redis.smembers(firstTagKey);
    } else {
      templateIds = await redis.sinter(...tagKeys);
    }
  } else {
    templateIds = await redis.smembers(TEMPLATE_LIST_KEY);
  }

  // Fetch templates
  const templates: PromptTemplate[] = [];
  for (const id of templateIds) {
    const template = await getTemplate(id);
    if (template) {
      // Apply search filter if provided
      if (options?.search) {
        const searchLower = options.search.toLowerCase();
        if (
          template.name.toLowerCase().includes(searchLower) ||
          template.description?.toLowerCase().includes(searchLower) ||
          template.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
        ) {
          templates.push(template);
        }
      } else {
        templates.push(template);
      }
    }
  }

  // Sort by updatedAt (most recent first)
  templates.sort(
    (a, b) =>
      new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
  );

  // Paginate
  const total = templates.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const paginatedTemplates = templates.slice(start, start + pageSize);

  return {
    templates: paginatedTemplates,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Gets template versions
 */
export async function getTemplateVersions(
  templateId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<PromptTemplateVersion[]> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;

  // Get versions sorted by version number (descending)
  const versionsData = await redis.zrevrange(
    `${TEMPLATE_VERSIONS_KEY_PREFIX}${templateId}`,
    offset,
    offset + limit - 1
  );

  return versionsData.map((data) => JSON.parse(data) as PromptTemplateVersion);
}

/**
 * Gets a specific template version
 */
export async function getTemplateVersion(
  templateId: string,
  version: number
): Promise<PromptTemplateVersion | null> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();

  // Get versions with the specific score
  const versionsData = await redis.zrangebyscore(
    `${TEMPLATE_VERSIONS_KEY_PREFIX}${templateId}`,
    version,
    version
  );

  const firstVersion = versionsData[0];
  if (versionsData.length === 0 || !firstVersion) {
    return null;
  }

  return JSON.parse(firstVersion) as PromptTemplateVersion;
}

/**
 * Rolls back a template to a previous version
 */
export async function rollbackTemplate(
  templateId: string,
  targetVersion: number,
  rolledBackBy?: string
): Promise<PromptTemplate> {
  const version = await getTemplateVersion(templateId, targetVersion);

  if (!version) {
    throw new Error(`Version ${targetVersion} not found for template ${templateId}`);
  }

  return await updateTemplate(
    templateId,
    {
      content: version.content,
      variables: version.variables,
      changeDescription: `Rolled back to version ${targetVersion}`,
    },
    rolledBackBy
  );
}

/**
 * Resolves a value from a nested path in an object
 */
function resolveNestedPath(obj: Record<string, unknown>, path: string): unknown {
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
 * Converts a value to string for template interpolation
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Interpolates template variables with provided values
 */
export async function interpolateTemplate(
  templateId: string,
  variables: Record<string, unknown>
): Promise<TemplateInterpolationResult> {
  const startTime = Date.now();
  const template = await getTemplate(templateId);

  if (!template) {
    // Record failed template metric
    void recordTemplateMetric({
      templateId,
      success: false,
      variablesUsed: Object.keys(variables).length,
      interpolationTimeMs: Date.now() - startTime,
    });

    return {
      success: false,
      error: `Template not found: ${templateId}`,
    };
  }

  const result = interpolateTemplateContent(template.content, template.variables, variables);

  // Record template usage metric
  void recordTemplateMetric({
    templateId,
    success: result.success,
    variablesUsed: result.usedVariables?.length ?? 0,
    interpolationTimeMs: Date.now() - startTime,
  });

  return result;
}

/**
 * Interpolates template content directly
 */
export function interpolateTemplateContent(
  content: string,
  templateVariables: PromptVariable[],
  providedValues: Record<string, unknown>
): TemplateInterpolationResult {
  const usedVariables: string[] = [];
  const missingVariables: string[] = [];
  const variableDefaults = new Map<string, unknown>();

  // Build defaults map
  for (const v of templateVariables) {
    if (v.default !== undefined) {
      variableDefaults.set(v.name, v.default);
    }
  }

  // Find all variable references in content
  const variablePattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
  let interpolated = content;
  let match;
  const errors: string[] = [];

  // Reset lastIndex for fresh matching
  variablePattern.lastIndex = 0;

  while ((match = variablePattern.exec(content)) !== null) {
    const fullPath = match[1] ?? '';
    const rootVar = fullPath.split('.')[0] ?? '';

    if (!fullPath || !rootVar) {
      continue;
    }

    // Try to resolve the value
    let value: unknown;
    let resolved = false;

    // Check if value is provided
    if (fullPath in providedValues) {
      value = providedValues[fullPath];
      resolved = true;
    } else if (rootVar in providedValues) {
      // Try resolving nested path
      const rootValue = providedValues[rootVar];
      if (rootVar === fullPath) {
        value = rootValue;
        resolved = true;
      } else if (typeof rootValue === 'object' && rootValue !== null) {
        const nestedPath = fullPath.substring(rootVar.length + 1);
        value = resolveNestedPath(rootValue as Record<string, unknown>, nestedPath);
        resolved = value !== undefined;
      }
    }

    // Check defaults if not resolved
    if (!resolved && variableDefaults.has(rootVar)) {
      const defaultValue = variableDefaults.get(rootVar);
      if (rootVar === fullPath) {
        value = defaultValue;
        resolved = true;
      } else if (typeof defaultValue === 'object' && defaultValue !== null) {
        const nestedPath = fullPath.substring(rootVar.length + 1);
        value = resolveNestedPath(defaultValue as Record<string, unknown>, nestedPath);
        resolved = value !== undefined;
      }
    }

    if (resolved) {
      if (!usedVariables.includes(fullPath)) {
        usedVariables.push(fullPath);
      }
      // Replace this occurrence
      interpolated = interpolated.replace(match[0], valueToString(value));
    } else {
      // Check if variable is required
      const variableDef = templateVariables.find((v) => v.name === rootVar);
      if (variableDef?.required) {
        errors.push(`Required variable "${fullPath}" not provided`);
      }
      missingVariables.push(fullPath);
      // Replace with empty string for non-required missing variables
      interpolated = interpolated.replace(match[0], '');
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: errors.join('; '),
      usedVariables,
      missingVariables,
    };
  }

  return {
    success: true,
    content: interpolated,
    usedVariables,
    missingVariables,
  };
}

/**
 * Clears the template cache
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  logger.debug('Template cache cleared');
}

/**
 * Gets service configuration
 */
export function getServiceConfig(): PromptTemplateServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<PromptTemplateServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };
  logger.info('Prompt template service configuration updated');
}

export default {
  initializePromptTemplateService,
  registerBuiltinTemplates,
  getBuiltinTemplate,
  listBuiltinTemplateIds,
  BUILTIN_TEMPLATE_IDS,
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  listTemplates,
  getTemplateVersions,
  getTemplateVersion,
  rollbackTemplate,
  interpolateTemplate,
  interpolateTemplateContent,
  validateTemplateContent,
  validateVariables,
  clearTemplateCache,
  getServiceConfig,
  updateServiceConfig,
};
