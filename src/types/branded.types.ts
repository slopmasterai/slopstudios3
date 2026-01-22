/**
 * Branded Types
 * Type-safe identifiers and primitive wrappers using TypeScript's nominal typing
 *
 * Branded types prevent accidental mixing of different ID types at compile time,
 * even though they're all strings at runtime.
 */

// =============================================================================
// Brand Symbol
// =============================================================================

/**
 * Unique symbol for branding types
 */
declare const __brand: unique symbol;

/**
 * Generic brand type
 */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// =============================================================================
// ID Types
// =============================================================================

/**
 * User identifier
 * @example const userId: UserId = createUserId('user_123');
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * Agent identifier
 * @example const agentId: AgentId = createAgentId('agent_claude_123');
 */
export type AgentId = Brand<string, 'AgentId'>;

/**
 * Workflow identifier
 * @example const workflowId: WorkflowId = createWorkflowId('wf_123');
 */
export type WorkflowId = Brand<string, 'WorkflowId'>;

/**
 * Workflow execution identifier
 * @example const executionId: WorkflowExecutionId = createWorkflowExecutionId('exec_123');
 */
export type WorkflowExecutionId = Brand<string, 'WorkflowExecutionId'>;

/**
 * Prompt template identifier
 * @example const templateId: TemplateId = createTemplateId('tpl_123');
 */
export type TemplateId = Brand<string, 'TemplateId'>;

/**
 * Session identifier
 * @example const sessionId: SessionId = createSessionId('sess_123');
 */
export type SessionId = Brand<string, 'SessionId'>;

/**
 * Process identifier (for Claude CLI processes)
 * @example const processId: ProcessId = createProcessId('proc_123');
 */
export type ProcessId = Brand<string, 'ProcessId'>;

/**
 * Discussion identifier
 * @example const discussionId: DiscussionId = createDiscussionId('disc_123');
 */
export type DiscussionId = Brand<string, 'DiscussionId'>;

/**
 * Critique identifier
 * @example const critiqueId: CritiqueId = createCritiqueId('crit_123');
 */
export type CritiqueId = Brand<string, 'CritiqueId'>;

/**
 * Request identifier (correlation ID)
 * @example const requestId: RequestId = createRequestId('req_123');
 */
export type RequestId = Brand<string, 'RequestId'>;

/**
 * Strudel render job identifier
 */
export type RenderJobId = Brand<string, 'RenderJobId'>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generates a unique ID with a given prefix
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Creates a UserId from a string
 */
export function createUserId(id?: string): UserId {
  return (id ?? generateId('user')) as UserId;
}

/**
 * Creates an AgentId from a string
 */
export function createAgentId(id?: string): AgentId {
  return (id ?? generateId('agent')) as AgentId;
}

/**
 * Creates a WorkflowId from a string
 */
export function createWorkflowId(id?: string): WorkflowId {
  return (id ?? generateId('wf')) as WorkflowId;
}

/**
 * Creates a WorkflowExecutionId from a string
 */
export function createWorkflowExecutionId(id?: string): WorkflowExecutionId {
  return (id ?? generateId('exec')) as WorkflowExecutionId;
}

/**
 * Creates a TemplateId from a string
 */
export function createTemplateId(id?: string): TemplateId {
  return (id ?? generateId('tpl')) as TemplateId;
}

/**
 * Creates a SessionId from a string
 */
export function createSessionId(id?: string): SessionId {
  return (id ?? generateId('sess')) as SessionId;
}

/**
 * Creates a ProcessId from a string
 */
export function createProcessId(id?: string): ProcessId {
  return (id ?? generateId('proc')) as ProcessId;
}

/**
 * Creates a DiscussionId from a string
 */
export function createDiscussionId(id?: string): DiscussionId {
  return (id ?? generateId('disc')) as DiscussionId;
}

/**
 * Creates a CritiqueId from a string
 */
export function createCritiqueId(id?: string): CritiqueId {
  return (id ?? generateId('crit')) as CritiqueId;
}

/**
 * Creates a RequestId from a string
 */
export function createRequestId(id?: string): RequestId {
  return (id ?? generateId('req')) as RequestId;
}

/**
 * Creates a RenderJobId from a string
 */
export function createRenderJobId(id?: string): RenderJobId {
  return (id ?? generateId('render')) as RenderJobId;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Checks if a string looks like a valid UserId
 */
export function isUserId(value: string): value is UserId {
  return typeof value === 'string' && value.startsWith('user_');
}

/**
 * Checks if a string looks like a valid AgentId
 */
export function isAgentId(value: string): value is AgentId {
  return typeof value === 'string' && (
    value.startsWith('agent_') ||
    value.startsWith('claude_') ||
    value.startsWith('strudel_')
  );
}

/**
 * Checks if a string looks like a valid WorkflowId
 */
export function isWorkflowId(value: string): value is WorkflowId {
  return typeof value === 'string' && value.startsWith('wf_');
}

/**
 * Checks if a string looks like a valid TemplateId
 */
export function isTemplateId(value: string): value is TemplateId {
  return typeof value === 'string' && value.startsWith('tpl_');
}

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Extracts the raw string value from a branded type
 */
export function toRawId<T extends string>(id: T): string {
  return id as string;
}

/**
 * Casts a string to a branded type (unsafe, use with caution)
 */
export function unsafeCastId<T extends string>(value: string, _type: T): T {
  return value as T;
}

// =============================================================================
// Branded Primitive Types
// =============================================================================

/**
 * Positive integer (> 0)
 */
export type PositiveInt = Brand<number, 'PositiveInt'>;

/**
 * Non-negative integer (>= 0)
 */
export type NonNegativeInt = Brand<number, 'NonNegativeInt'>;

/**
 * Percentage (0-100)
 */
export type Percentage = Brand<number, 'Percentage'>;

/**
 * Ratio (0-1)
 */
export type Ratio = Brand<number, 'Ratio'>;

/**
 * Duration in milliseconds
 */
export type DurationMs = Brand<number, 'DurationMs'>;

/**
 * Timestamp in ISO 8601 format
 */
export type ISOTimestamp = Brand<string, 'ISOTimestamp'>;

/**
 * Email address
 */
export type Email = Brand<string, 'Email'>;

/**
 * URL string
 */
export type URL = Brand<string, 'URL'>;

// =============================================================================
// Branded Primitive Factory Functions
// =============================================================================

/**
 * Creates a PositiveInt (throws if invalid)
 */
export function createPositiveInt(value: number): PositiveInt {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected positive integer, got ${value}`);
  }
  return value as PositiveInt;
}

/**
 * Creates a NonNegativeInt (throws if invalid)
 */
export function createNonNegativeInt(value: number): NonNegativeInt {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Expected non-negative integer, got ${value}`);
  }
  return value as NonNegativeInt;
}

/**
 * Creates a Percentage (throws if invalid)
 */
export function createPercentage(value: number): Percentage {
  if (value < 0 || value > 100) {
    throw new Error(`Expected percentage (0-100), got ${value}`);
  }
  return value as Percentage;
}

/**
 * Creates a Ratio (throws if invalid)
 */
export function createRatio(value: number): Ratio {
  if (value < 0 || value > 1) {
    throw new Error(`Expected ratio (0-1), got ${value}`);
  }
  return value as Ratio;
}

/**
 * Creates a DurationMs (throws if invalid)
 */
export function createDurationMs(value: number): DurationMs {
  if (value < 0) {
    throw new Error(`Expected non-negative duration, got ${value}`);
  }
  return value as DurationMs;
}

/**
 * Creates an ISOTimestamp from a Date or ISO string
 */
export function createISOTimestamp(value?: Date | string): ISOTimestamp {
  if (!value) {
    return new Date().toISOString() as ISOTimestamp;
  }
  if (value instanceof Date) {
    return value.toISOString() as ISOTimestamp;
  }
  // Validate ISO string
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${value}`);
  }
  return value as ISOTimestamp;
}

/**
 * Creates an Email (throws if invalid)
 */
export function createEmail(value: string): Email {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new Error(`Invalid email address: ${value}`);
  }
  return value.toLowerCase() as Email;
}

/**
 * Creates a URL (throws if invalid)
 */
export function createURL(value: string): URL {
  try {
    new globalThis.URL(value);
    return value as URL;
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
}

// =============================================================================
// Optional Branded Primitive Factory Functions
// =============================================================================

/**
 * Creates a PositiveInt or returns undefined
 */
export function tryCreatePositiveInt(value: number): PositiveInt | undefined {
  try {
    return createPositiveInt(value);
  } catch {
    return undefined;
  }
}

/**
 * Creates a Ratio or returns undefined
 */
export function tryCreateRatio(value: number): Ratio | undefined {
  try {
    return createRatio(value);
  } catch {
    return undefined;
  }
}

/**
 * Creates an Email or returns undefined
 */
export function tryCreateEmail(value: string): Email | undefined {
  try {
    return createEmail(value);
  } catch {
    return undefined;
  }
}

export default {
  // ID factories
  createUserId,
  createAgentId,
  createWorkflowId,
  createWorkflowExecutionId,
  createTemplateId,
  createSessionId,
  createProcessId,
  createDiscussionId,
  createCritiqueId,
  createRequestId,
  createRenderJobId,

  // Type guards
  isUserId,
  isAgentId,
  isWorkflowId,
  isTemplateId,

  // Conversion
  toRawId,
  unsafeCastId,

  // Primitive factories
  createPositiveInt,
  createNonNegativeInt,
  createPercentage,
  createRatio,
  createDurationMs,
  createISOTimestamp,
  createEmail,
  createURL,

  // Try factories
  tryCreatePositiveInt,
  tryCreateRatio,
  tryCreateEmail,
};
