/**
 * Workflow Context Service
 * Manages shared state between workflow steps with Redis storage
 */

import { logger } from '../utils/logger.js';

import { getRedisClient, isRedisConnected } from './redis.service.js';

import type { WorkflowContext, ContextResolutionResult } from '../types/agent.types.js';

// Redis key prefixes
const CONTEXT_KEY_PREFIX = 'workflow:context:';
const CONTEXT_SNAPSHOT_PREFIX = 'workflow:context:snapshot:';

// Service configuration
interface WorkflowContextServiceConfig {
  defaultTtlSeconds: number;
  maxContextSize: number;
  maxNestingDepth: number;
  enableSnapshots: boolean;
  maxSnapshots: number;
}

let serviceConfig: WorkflowContextServiceConfig = {
  defaultTtlSeconds: parseInt(process.env['AGENT_CONTEXT_TTL_SECONDS'] ?? '3600', 10),
  maxContextSize: 10 * 1024 * 1024, // 10MB
  maxNestingDepth: 10,
  enableSnapshots: true,
  maxSnapshots: 10,
};

/**
 * Initializes the workflow context service
 */
export function initializeWorkflowContextService(
  config?: Partial<WorkflowContextServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  logger.info(
    {
      defaultTtlSeconds: serviceConfig.defaultTtlSeconds,
      maxContextSize: serviceConfig.maxContextSize,
    },
    'Workflow context service initialized'
  );
}

/**
 * Creates a new workflow context
 */
export async function createContext(
  workflowId: string,
  initialData?: Record<string, unknown>,
  ttlSeconds?: number
): Promise<WorkflowContext> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const now = new Date().toISOString();
  const ttl = ttlSeconds ?? serviceConfig.defaultTtlSeconds;

  const context: WorkflowContext = {
    workflowId,
    data: initialData ?? {},
    metadata: {
      createdAt: now,
      updatedAt: now,
      ttlSeconds: ttl,
    },
  };

  // Validate size
  const serialized = JSON.stringify(context);
  if (serialized.length > serviceConfig.maxContextSize) {
    throw new Error(
      `Context size ${serialized.length} exceeds maximum of ${serviceConfig.maxContextSize} bytes`
    );
  }

  await redis.set(`${CONTEXT_KEY_PREFIX}${workflowId}`, serialized, 'EX', ttl);

  logger.debug({ workflowId, ttlSeconds: ttl }, 'Workflow context created');

  return context;
}

/**
 * Gets a workflow context
 */
export async function getContext(workflowId: string): Promise<WorkflowContext | null> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const data = await redis.get(`${CONTEXT_KEY_PREFIX}${workflowId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as WorkflowContext;
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

    // Handle array indexing
    const arrayMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrayName = arrayMatch[1] ?? '';
      const indexStr = arrayMatch[2] ?? '0';
      const index = parseInt(indexStr, 10);

      if (typeof current !== 'object' || !arrayName) {
        return undefined;
      }

      const arrayValue = (current as Record<string, unknown>)[arrayName];
      if (!Array.isArray(arrayValue)) {
        return undefined;
      }

      current = arrayValue[index];
    } else {
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Sets a value at a nested path in an object
 */
function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
  depth: number = 0
): boolean {
  if (depth > serviceConfig.maxNestingDepth) {
    throw new Error(`Maximum nesting depth of ${serviceConfig.maxNestingDepth} exceeded`);
  }

  const parts = path.split('.');

  if (parts.length === 1) {
    // Handle array indexing at leaf
    const firstPart = parts[0] ?? '';
    const arrayMatch = firstPart.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    if (arrayMatch) {
      const arrayName = arrayMatch[1] ?? '';
      const indexStr = arrayMatch[2] ?? '0';
      const index = parseInt(indexStr, 10);

      if (!arrayName) {
        return false;
      }

      if (!Array.isArray(obj[arrayName])) {
        obj[arrayName] = [];
      }

      (obj[arrayName] as unknown[])[index] = value;
    } else {
      obj[firstPart] = value;
    }
    return true;
  }

  const currentPart = parts[0] ?? '';
  const remainingPath = parts.slice(1).join('.');

  if (!currentPart) {
    return false;
  }

  // Handle array indexing in path
  const arrayMatch = currentPart.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
  if (arrayMatch) {
    const arrayName = arrayMatch[1] ?? '';
    const indexStr = arrayMatch[2] ?? '0';
    const index = parseInt(indexStr, 10);

    if (!arrayName) {
      return false;
    }

    if (!Array.isArray(obj[arrayName])) {
      obj[arrayName] = [];
    }

    const arr = obj[arrayName] as unknown[];
    if (arr[index] === undefined || arr[index] === null) {
      arr[index] = {};
    }

    return setPath(arr[index] as Record<string, unknown>, remainingPath, value, depth + 1);
  }

  if (obj[currentPart] === undefined || obj[currentPart] === null) {
    obj[currentPart] = {};
  }

  if (typeof obj[currentPart] !== 'object' || Array.isArray(obj[currentPart])) {
    // Can't set nested path on non-object
    obj[currentPart] = {};
  }

  return setPath(obj[currentPart] as Record<string, unknown>, remainingPath, value, depth + 1);
}

/**
 * Gets a value from workflow context
 */
export async function getContextValue(
  workflowId: string,
  path: string
): Promise<ContextResolutionResult> {
  const context = await getContext(workflowId);

  if (!context) {
    return {
      success: false,
      error: `Context not found for workflow: ${workflowId}`,
      path,
    };
  }

  try {
    const value = resolvePath(context.data, path);

    if (value === undefined) {
      return {
        success: false,
        error: `Path not found: ${path}`,
        path,
      };
    }

    return {
      success: true,
      value,
      path,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      path,
    };
  }
}

/**
 * Sets a value in workflow context
 */
export async function setContextValue(
  workflowId: string,
  path: string,
  value: unknown
): Promise<boolean> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const context = await getContext(workflowId);

  if (!context) {
    throw new Error(`Context not found for workflow: ${workflowId}`);
  }

  try {
    setPath(context.data, path, value);

    context.metadata.updatedAt = new Date().toISOString();

    // Validate size after update
    const serialized = JSON.stringify(context);
    if (serialized.length > serviceConfig.maxContextSize) {
      throw new Error(
        `Context size ${serialized.length} exceeds maximum of ${serviceConfig.maxContextSize} bytes`
      );
    }

    // Get remaining TTL
    const ttl = await redis.ttl(`${CONTEXT_KEY_PREFIX}${workflowId}`);

    await redis.set(`${CONTEXT_KEY_PREFIX}${workflowId}`, serialized, 'EX', ttl > 0 ? ttl : serviceConfig.defaultTtlSeconds);

    logger.debug({ workflowId, path }, 'Context value set');

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ workflowId, path, error: errorMessage }, 'Failed to set context value');
    throw error;
  }
}

/**
 * Merges data into workflow context
 */
export async function mergeContext(
  workflowId: string,
  data: Record<string, unknown>,
  deep: boolean = true
): Promise<WorkflowContext> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const context = await getContext(workflowId);

  if (!context) {
    throw new Error(`Context not found for workflow: ${workflowId}`);
  }

  if (deep) {
    context.data = deepMerge(context.data, data);
  } else {
    context.data = { ...context.data, ...data };
  }

  context.metadata.updatedAt = new Date().toISOString();

  // Validate size after merge
  const serialized = JSON.stringify(context);
  if (serialized.length > serviceConfig.maxContextSize) {
    throw new Error(
      `Context size ${serialized.length} exceeds maximum of ${serviceConfig.maxContextSize} bytes`
    );
  }

  // Get remaining TTL
  const ttl = await redis.ttl(`${CONTEXT_KEY_PREFIX}${workflowId}`);

  await redis.set(`${CONTEXT_KEY_PREFIX}${workflowId}`, serialized, 'EX', ttl > 0 ? ttl : serviceConfig.defaultTtlSeconds);

  logger.debug({ workflowId, keys: Object.keys(data) }, 'Context merged');

  return context;
}

/**
 * Deep merges two objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  depth: number = 0
): Record<string, unknown> {
  if (depth > serviceConfig.maxNestingDepth) {
    throw new Error(`Maximum nesting depth of ${serviceConfig.maxNestingDepth} exceeded during merge`);
  }

  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
        depth + 1
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Clears workflow context
 */
export async function clearContext(workflowId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const result = await redis.del(`${CONTEXT_KEY_PREFIX}${workflowId}`);

  // Also clear snapshots
  const snapshotKeys = await redis.keys(`${CONTEXT_SNAPSHOT_PREFIX}${workflowId}:*`);
  if (snapshotKeys.length > 0) {
    await redis.del(...snapshotKeys);
  }

  logger.debug({ workflowId }, 'Context cleared');

  return result > 0;
}

/**
 * Creates a snapshot of the current context
 */
export async function createSnapshot(
  workflowId: string,
  label?: string
): Promise<string> {
  if (!serviceConfig.enableSnapshots) {
    throw new Error('Snapshots are disabled');
  }

  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const context = await getContext(workflowId);

  if (!context) {
    throw new Error(`Context not found for workflow: ${workflowId}`);
  }

  const snapshotId = `${Date.now()}-${label ?? 'auto'}`;
  const snapshotKey = `${CONTEXT_SNAPSHOT_PREFIX}${workflowId}:${snapshotId}`;

  // Get remaining TTL
  const ttl = await redis.ttl(`${CONTEXT_KEY_PREFIX}${workflowId}`);

  await redis.set(snapshotKey, JSON.stringify(context), 'EX', ttl > 0 ? ttl : serviceConfig.defaultTtlSeconds);

  // Trim old snapshots
  const snapshotKeys = await redis.keys(`${CONTEXT_SNAPSHOT_PREFIX}${workflowId}:*`);
  if (snapshotKeys.length > serviceConfig.maxSnapshots) {
    // Sort by timestamp (in key) and remove oldest
    const sortedKeys = snapshotKeys.sort();
    const toDelete = sortedKeys.slice(0, snapshotKeys.length - serviceConfig.maxSnapshots);
    if (toDelete.length > 0) {
      await redis.del(...toDelete);
    }
  }

  logger.debug({ workflowId, snapshotId }, 'Context snapshot created');

  return snapshotId;
}

/**
 * Restores context from a snapshot
 */
export async function restoreSnapshot(
  workflowId: string,
  snapshotId: string
): Promise<WorkflowContext> {
  if (!serviceConfig.enableSnapshots) {
    throw new Error('Snapshots are disabled');
  }

  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const snapshotKey = `${CONTEXT_SNAPSHOT_PREFIX}${workflowId}:${snapshotId}`;

  const data = await redis.get(snapshotKey);

  if (!data) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const snapshot = JSON.parse(data) as WorkflowContext;

  // Update metadata
  snapshot.metadata.updatedAt = new Date().toISOString();

  // Get remaining TTL from snapshot
  const ttl = await redis.ttl(snapshotKey);

  await redis.set(
    `${CONTEXT_KEY_PREFIX}${workflowId}`,
    JSON.stringify(snapshot),
    'EX',
    ttl > 0 ? ttl : serviceConfig.defaultTtlSeconds
  );

  logger.debug({ workflowId, snapshotId }, 'Context restored from snapshot');

  return snapshot;
}

/**
 * Lists available snapshots for a workflow
 */
export async function listSnapshots(
  workflowId: string
): Promise<Array<{ id: string; createdAt: string }>> {
  if (!serviceConfig.enableSnapshots) {
    return [];
  }

  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const pattern = `${CONTEXT_SNAPSHOT_PREFIX}${workflowId}:*`;
  const keys = await redis.keys(pattern);

  const snapshots: Array<{ id: string; createdAt: string }> = [];

  for (const key of keys) {
    const snapshotId = key.replace(`${CONTEXT_SNAPSHOT_PREFIX}${workflowId}:`, '');
    const timestampStr = snapshotId.split('-')[0] ?? '0';
    const timestamp = parseInt(timestampStr, 10);

    snapshots.push({
      id: snapshotId,
      createdAt: new Date(timestamp).toISOString(),
    });
  }

  // Sort by creation time (newest first)
  snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return snapshots;
}

/**
 * Resolves variables in a string from context
 * Supports syntax: {{context.path.to.value}}
 */
export async function resolveVariables(
  workflowId: string,
  template: string
): Promise<{ success: boolean; result: string; errors: string[] }> {
  const context = await getContext(workflowId);

  if (!context) {
    return {
      success: false,
      result: template,
      errors: [`Context not found for workflow: ${workflowId}`],
    };
  }

  return resolveVariablesWithData(template, context.data);
}

/**
 * Resolves variables in a string from provided data
 */
export function resolveVariablesWithData(
  template: string,
  data: Record<string, unknown>
): { success: boolean; result: string; errors: string[] } {
  const errors: string[] = [];
  const variablePattern = /\{\{\s*context\.([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\s*\}\}/g;

  let result = template;
  let match;

  // Reset pattern
  variablePattern.lastIndex = 0;

  while ((match = variablePattern.exec(template)) !== null) {
    const path = match[1] ?? '';

    if (!path) {
      continue;
    }

    try {
      const value = resolvePath(data, path);

      if (value === undefined) {
        errors.push(`Variable not found: context.${path}`);
        result = result.replace(match[0], '');
      } else {
        const stringValue = valueToString(value);
        result = result.replace(match[0], stringValue);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Error resolving context.${path}: ${errorMessage}`);
      result = result.replace(match[0], '');
    }
  }

  return {
    success: errors.length === 0,
    result,
    errors,
  };
}

/**
 * Converts a value to string
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
 * Extends the TTL of a context
 */
export async function extendContextTtl(
  workflowId: string,
  additionalSeconds: number
): Promise<boolean> {
  if (!isRedisConnected()) {
    throw new Error('Redis not connected');
  }

  const redis = getRedisClient();
  const currentTtl = await redis.ttl(`${CONTEXT_KEY_PREFIX}${workflowId}`);

  if (currentTtl < 0) {
    return false; // Key doesn't exist or has no TTL
  }

  const newTtl = currentTtl + additionalSeconds;
  await redis.expire(`${CONTEXT_KEY_PREFIX}${workflowId}`, newTtl);

  logger.debug({ workflowId, newTtl }, 'Context TTL extended');

  return true;
}

/**
 * Gets service configuration
 */
export function getServiceConfig(): WorkflowContextServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<WorkflowContextServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };
  logger.info('Workflow context service configuration updated');
}

export default {
  initializeWorkflowContextService,
  createContext,
  getContext,
  getContextValue,
  setContextValue,
  mergeContext,
  clearContext,
  createSnapshot,
  restoreSnapshot,
  listSnapshots,
  resolveVariables,
  resolveVariablesWithData,
  extendContextTtl,
  getServiceConfig,
  updateServiceConfig,
};
