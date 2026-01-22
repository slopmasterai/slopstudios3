/**
 * Agent Orchestration Type Definitions
 * Types for multi-agent workflows, prompt templates, and orchestration
 */

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Types of agents available in the system
 */
export type AgentType = 'claude' | 'strudel' | 'custom';

/**
 * Agent operational status
 */
export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';

/**
 * Agent capability descriptors
 */
export interface AgentCapability {
  /** Unique capability identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Input types this capability accepts */
  inputTypes?: string[];
  /** Output types this capability produces */
  outputTypes?: string[];
}

/**
 * Agent registration in the registry
 */
export interface AgentRegistration {
  /** Unique agent identifier */
  id: string;
  /** Agent type */
  type: AgentType;
  /** Human-readable name */
  name: string;
  /** Agent description */
  description?: string;
  /** List of capabilities */
  capabilities: AgentCapability[];
  /** Agent-specific configuration */
  config: Record<string, unknown>;
  /** Current operational status */
  status: AgentStatus;
  /** Metadata (version, created, etc.) */
  metadata: {
    version: string;
    createdAt: string;
    updatedAt: string;
    lastHealthCheck?: string;
    errorCount?: number;
  };
}

/**
 * Agent execution interface
 */
export interface AgentExecutor {
  /** Execute agent with given input */
  execute(input: AgentExecutionInput): Promise<AgentExecutionOutput>;
  /** Check agent health */
  healthCheck(): Promise<AgentHealthStatus>;
}

/**
 * Input for agent execution
 */
export interface AgentExecutionInput {
  /** The prompt or command to execute */
  prompt: string;
  /** Optional context from workflow */
  context?: Record<string, unknown>;
  /** Optional configuration overrides */
  config?: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Output from agent execution
 */
export interface AgentExecutionOutput {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent health status
 */
export interface AgentHealthStatus {
  /** Agent ID */
  agentId: string;
  /** Whether agent is healthy */
  healthy: boolean;
  /** Current status */
  status: AgentStatus;
  /** Status message */
  message?: string;
  /** Last check timestamp */
  lastCheck: string;
  /** Additional health details */
  details?: Record<string, unknown>;
}

// ============================================================================
// Prompt Template Types
// ============================================================================

/**
 * Variable types supported in templates
 */
export type PromptVariableType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/**
 * Template variable definition
 */
export interface PromptVariable {
  /** Variable name (used in {{name}} syntax) */
  name: string;
  /** Variable type */
  type: PromptVariableType;
  /** Whether the variable is required */
  required: boolean;
  /** Default value if not provided */
  default?: unknown;
  /** Human-readable description */
  description?: string;
  /** Validation pattern (regex for strings) */
  validation?: string;
}

/**
 * Template category for organization
 */
export type PromptTemplateCategory = 'system' | 'user' | 'workflow' | 'helper' | 'evaluation' | 'generation' | 'collaboration';

/**
 * Prompt template definition
 */
export interface PromptTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Template description */
  description?: string;
  /** Template content with variable placeholders */
  content: string;
  /** Variable definitions */
  variables: PromptVariable[];
  /** Template category */
  category: PromptTemplateCategory;
  /** Tags for search/filtering */
  tags?: string[];
  /** Current version number */
  version: number;
  /** Version history metadata */
  metadata: {
    createdAt: string;
    createdBy?: string;
    updatedAt: string;
    updatedBy?: string;
  };
}

/**
 * Template version for history tracking
 */
export interface PromptTemplateVersion {
  /** Template ID */
  templateId: string;
  /** Version number */
  version: number;
  /** Template content at this version */
  content: string;
  /** Variables at this version */
  variables: PromptVariable[];
  /** When this version was created */
  createdAt: string;
  /** Who created this version */
  createdBy?: string;
  /** Change description */
  changeDescription?: string;
}

/**
 * Template interpolation result
 */
export interface TemplateInterpolationResult {
  /** Whether interpolation succeeded */
  success: boolean;
  /** Interpolated content */
  content?: string;
  /** Error message if failed */
  error?: string;
  /** Variables that were used */
  usedVariables?: string[];
  /** Variables that were missing (used defaults or errored) */
  missingVariables?: string[];
}

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Workflow status
 */
export type WorkflowStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Workflow step status
 */
export type WorkflowStepStatus =
  | 'pending'
  | 'waiting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Retry policy for workflow steps
 */
export interface RetryPolicy {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Retryable error codes */
  retryableErrors?: string[];
}

/**
 * Step input mapping
 */
export interface StepInputMapping {
  /** Variable name in this step */
  variable: string;
  /** Source of the value */
  source: 'context' | 'step' | 'literal';
  /** Path or value depending on source */
  value: string | unknown;
  /** Step ID if source is 'step' */
  stepId?: string;
}

/**
 * Step output mapping
 */
export interface StepOutputMapping {
  /** Output field name */
  field: string;
  /** Context path to store the value */
  contextPath: string;
}

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  /** Unique step identifier within workflow */
  id: string;
  /** Human-readable name */
  name: string;
  /** Step description */
  description?: string;
  /** Agent type to execute this step */
  agentType: AgentType;
  /** Specific agent ID (optional, uses default if not specified) */
  agentId?: string;
  /** Prompt template ID to use */
  promptTemplateId?: string;
  /** Direct prompt (if not using template) */
  prompt?: string;
  /** Input mappings */
  inputs: StepInputMapping[];
  /** Output mappings */
  outputs: StepOutputMapping[];
  /** Step IDs that must complete before this step */
  dependencies: string[];
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Retry policy for this step */
  retryPolicy?: RetryPolicy;
  /** Condition for executing this step (JS expression) */
  condition?: string;
  /** Whether to continue workflow on step failure */
  continueOnError?: boolean;
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Workflow description */
  description?: string;
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Initial context variables */
  initialContext?: Record<string, unknown>;
  /** Global timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum parallel steps */
  maxParallelSteps?: number;
  /** Default retry policy for all steps */
  defaultRetryPolicy?: RetryPolicy;
  /** Metadata */
  metadata: {
    createdAt: string;
    createdBy?: string;
    updatedAt: string;
    updatedBy?: string;
    version: number;
    tags?: string[];
  };
}

/**
 * Workflow step execution state
 */
export interface WorkflowStepState {
  /** Step ID */
  stepId: string;
  /** Current status */
  status: WorkflowStepStatus;
  /** When step started */
  startedAt?: string;
  /** When step completed */
  completedAt?: string;
  /** Step result */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Retry count */
  retryCount: number;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Workflow execution state
 */
export interface WorkflowState {
  /** Workflow execution ID */
  id: string;
  /** Workflow definition ID */
  workflowId: string;
  /** User who initiated the workflow */
  userId: string;
  /** Current status */
  status: WorkflowStatus;
  /** Step states */
  steps: Record<string, WorkflowStepState>;
  /** Current step IDs being executed */
  currentSteps: string[];
  /** When workflow was created */
  createdAt: string;
  /** When workflow started */
  startedAt?: string;
  /** When workflow completed */
  completedAt?: string;
  /** Overall error message */
  error?: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Queue position if queued */
  queuePosition?: number;
}

// ============================================================================
// Workflow Context Types
// ============================================================================

/**
 * Workflow context for shared state between steps
 */
export interface WorkflowContext {
  /** Workflow execution ID */
  workflowId: string;
  /** Context data (key-value pairs) */
  data: Record<string, unknown>;
  /** Metadata */
  metadata: {
    createdAt: string;
    updatedAt: string;
    ttlSeconds?: number;
  };
}

/**
 * Context variable resolution result
 */
export interface ContextResolutionResult {
  /** Whether resolution succeeded */
  success: boolean;
  /** Resolved value */
  value?: unknown;
  /** Error message if failed */
  error?: string;
  /** Path that was resolved */
  path: string;
}

// ============================================================================
// Orchestration Types
// ============================================================================

/**
 * Orchestration status
 */
export type OrchestrationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Orchestration pattern types
 */
export type OrchestrationPattern = 'sequential' | 'parallel' | 'conditional' | 'map-reduce' | 'self-critique' | 'discussion';

/**
 * Orchestration request for simple patterns
 */
export interface OrchestrationRequest {
  /** Request ID */
  id?: string;
  /** User ID */
  userId: string;
  /** Orchestration pattern */
  pattern: OrchestrationPattern;
  /** Agent tasks to execute */
  tasks: OrchestrationTask[];
  /** Initial context */
  context?: Record<string, unknown>;
  /** Global timeout in milliseconds */
  timeoutMs?: number;
  /** Options specific to the pattern */
  options?: Record<string, unknown>;
}

/**
 * Individual task in orchestration
 */
export interface OrchestrationTask {
  /** Task ID */
  id: string;
  /** Agent type */
  agentType: AgentType;
  /** Agent ID (optional) */
  agentId?: string;
  /** Prompt template ID */
  promptTemplateId?: string;
  /** Direct prompt */
  prompt?: string;
  /** Variables for template interpolation */
  variables?: Record<string, unknown>;
  /** Timeout for this task */
  timeoutMs?: number;
  /** Condition for conditional pattern */
  condition?: string;
  /** Input data for map pattern */
  input?: unknown;
}

/**
 * Orchestration result
 */
export interface OrchestrationResult {
  /** Request ID */
  id: string;
  /** Final status */
  status: OrchestrationStatus;
  /** Pattern used */
  pattern: OrchestrationPattern;
  /** Results from each task */
  taskResults: OrchestrationTaskResult[];
  /** Aggregated result (for map-reduce) */
  aggregatedResult?: unknown;
  /** Error message if failed */
  error?: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Timestamps */
  startedAt: string;
  completedAt: string;
}

/**
 * Individual task result
 */
export interface OrchestrationTaskResult {
  /** Task ID */
  taskId: string;
  /** Whether task succeeded */
  success: boolean;
  /** Task result */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// WebSocket Payload Types
// ============================================================================

/**
 * Workflow execute payload (client -> server)
 */
export interface AgentWorkflowExecutePayload {
  /** Workflow definition (inline, required) */
  workflow: WorkflowDefinition;
  /** Initial context variables */
  context?: Record<string, unknown>;
  /** Priority (0-100) */
  priority?: number;
}

/**
 * Workflow status payload (client -> server)
 */
export interface AgentWorkflowStatusPayload {
  /** Workflow execution ID */
  executionId: string;
}

/**
 * Workflow cancel payload (client -> server)
 */
export interface AgentWorkflowCancelPayload {
  /** Workflow execution ID */
  executionId: string;
}

/**
 * Orchestrate payload (client -> server)
 */
export interface AgentOrchestratePayload {
  /** Orchestration request */
  request: OrchestrationRequest;
}

/**
 * Workflow queued payload (server -> client)
 */
export interface AgentWorkflowQueuedPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Queue position */
  queuePosition: number;
  /** Estimated wait time in seconds */
  estimatedWaitSeconds?: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow started payload (server -> client)
 */
export interface AgentWorkflowStartedPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Workflow ID */
  workflowId: string;
  /** Total steps count */
  totalSteps: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow step started payload (server -> client)
 */
export interface AgentWorkflowStepStartedPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Step ID */
  stepId: string;
  /** Step name */
  stepName: string;
  /** Agent type */
  agentType: AgentType;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow step progress payload (server -> client)
 */
export interface AgentWorkflowStepProgressPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Step ID */
  stepId: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Progress message */
  message?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow step completed payload (server -> client)
 */
export interface AgentWorkflowStepCompletedPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Step ID */
  stepId: string;
  /** Step result */
  result?: unknown;
  /** Duration in milliseconds */
  durationMs: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow step failed payload (server -> client)
 */
export interface AgentWorkflowStepFailedPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Step ID */
  stepId: string;
  /** Error message */
  error: string;
  /** Whether workflow will continue */
  willContinue: boolean;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow completed payload (server -> client)
 */
export interface AgentWorkflowCompletedPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Final results */
  results: Record<string, unknown>;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Step results */
  stepResults: Record<string, WorkflowStepState>;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow failed payload (server -> client)
 */
export interface AgentWorkflowFailedPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Error message */
  error: string;
  /** Failed step ID (if applicable) */
  failedStepId?: string;
  /** Completed steps count */
  completedSteps: number;
  /** Total steps count */
  totalSteps: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Workflow cancelled payload (server -> client)
 */
export interface AgentWorkflowCancelledPayload {
  /** Workflow execution ID */
  executionId: string;
  /** Completed steps count before cancellation */
  completedSteps: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Agent error payload (server -> client)
 */
export interface AgentErrorPayload {
  /** Execution ID (if applicable) */
  executionId?: string;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// WebSocket Callback Types
// ============================================================================

export type AgentWorkflowExecuteCallback = (response: {
  success: boolean;
  executionId?: string;
  status?: WorkflowStatus;
  queuePosition?: number;
  error?: string;
}) => void;

export type AgentWorkflowCancelCallback = (response: {
  success: boolean;
  cancelled?: boolean;
  error?: string;
}) => void;

export type AgentWorkflowStatusCallback = (response: {
  success: boolean;
  status?: WorkflowState;
  error?: string;
}) => void;

export type AgentOrchestrateCallback = (response: {
  success: boolean;
  result?: OrchestrationResult;
  error?: string;
}) => void;

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Workflow execution metrics
 */
export interface WorkflowMetrics {
  /** Total workflows executed */
  totalWorkflows: number;
  /** Successful workflows */
  successfulWorkflows: number;
  /** Failed workflows */
  failedWorkflows: number;
  /** Cancelled workflows */
  cancelledWorkflows: number;
  /** Currently running workflows */
  activeWorkflows: number;
  /** Queued workflows */
  queuedWorkflows: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** 50th percentile duration */
  p50DurationMs: number;
  /** 95th percentile duration */
  p95DurationMs: number;
  /** 99th percentile duration */
  p99DurationMs: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Metrics timestamp */
  timestamp: string;
  /** Period covered in seconds */
  periodSeconds: number;
}

/**
 * Step execution metrics
 */
export interface StepMetrics {
  /** Agent type */
  agentType: AgentType;
  /** Total steps executed */
  totalSteps: number;
  /** Successful steps */
  successfulSteps: number;
  /** Failed steps */
  failedSteps: number;
  /** Retried steps */
  retriedSteps: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Template usage metrics
 */
export interface TemplateMetrics {
  /** Template ID */
  templateId: string;
  /** Usage count */
  usageCount: number;
  /** Successful interpolations */
  successfulInterpolations: number;
  /** Failed interpolations */
  failedInterpolations: number;
  /** Average variables per usage */
  avgVariablesUsed: number;
}

/**
 * Agent metrics
 */
export interface AgentMetrics {
  /** Agent ID */
  agentId: string;
  /** Agent type */
  agentType: AgentType;
  /** Total executions */
  totalExecutions: number;
  /** Successful executions */
  successfulExecutions: number;
  /** Failed executions */
  failedExecutions: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
  /** Current status */
  currentStatus: AgentStatus;
  /** Uptime percentage */
  uptimePercentage: number;
  /** Error count in period */
  errorCount: number;
}

/**
 * Aggregated agent service metrics
 */
export interface AgentServiceMetrics {
  /** Workflow metrics */
  workflows: WorkflowMetrics;
  /** Step metrics by agent type */
  stepsByAgent: Record<AgentType, StepMetrics>;
  /** Template metrics */
  templates: TemplateMetrics[];
  /** Agent metrics */
  agents: AgentMetrics[];
  /** Self-critique metrics */
  selfCritique?: SelfCritiqueMetrics;
  /** Discussion metrics */
  discussion?: DiscussionMetrics;
  /** Metrics timestamp */
  timestamp: string;
  /** Period covered in seconds */
  periodSeconds: number;
}

// ============================================================================
// HTTP Request/Response Types
// ============================================================================

/**
 * Create template request
 */
export interface CreateTemplateRequest {
  name: string;
  description?: string;
  content: string;
  variables: PromptVariable[];
  category: PromptTemplateCategory;
  tags?: string[];
}

/**
 * Update template request
 */
export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  content?: string;
  variables?: PromptVariable[];
  category?: PromptTemplateCategory;
  tags?: string[];
  changeDescription?: string;
}

/**
 * Interpolate template request
 */
export interface InterpolateTemplateRequest {
  variables: Record<string, unknown>;
}

/**
 * Execute workflow request
 */
export interface ExecuteWorkflowRequest {
  /** Workflow definition (inline, required) */
  workflow: WorkflowDefinition;
  /** Initial context variables */
  context?: Record<string, unknown>;
  /** Priority (0-100) */
  priority?: number;
}

/**
 * Orchestrate request body
 */
export interface OrchestrateRequestBody {
  pattern: OrchestrationPattern;
  tasks: OrchestrationTask[];
  context?: Record<string, unknown>;
  timeoutMs?: number;
  options?: Record<string, unknown>;
}

/**
 * Agent health response
 */
export interface AgentSystemHealthResponse {
  /** Overall system health */
  healthy: boolean;
  /** Services status */
  services: {
    promptTemplates: boolean;
    agentRegistry: boolean;
    workflowEngine: boolean;
    orchestration: boolean;
  };
  /** Registered agents */
  agents: {
    total: number;
    healthy: number;
    degraded: number;
    offline: number;
  };
  /** Active workflows */
  workflows: {
    active: number;
    queued: number;
    maxConcurrent: number;
  };
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Self-Critique Types
// ============================================================================

/**
 * Quality criterion for evaluating agent outputs
 */
export interface QualityCriterion {
  /** Unique criterion name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Prompt for evaluation */
  evaluationPrompt: string;
  /** Weight for this criterion (0-1) */
  weight: number;
  /** Minimum threshold score (0-1) */
  threshold: number;
}

/**
 * Configuration for self-critique pattern
 */
export interface SelfCritiqueConfig {
  /** Maximum number of improvement iterations */
  maxIterations: number;
  /** Quality criteria for evaluation */
  qualityCriteria: QualityCriterion[];
  /** Custom evaluation prompt template */
  evaluationPromptTemplate?: string;
  /** Custom improvement prompt template */
  improvementPromptTemplate?: string;
  /** Stop when overall score meets this threshold (0-1) */
  stopOnQualityThreshold?: number;
}

/**
 * Evaluation result from critique
 */
export interface CritiqueEvaluation {
  /** Overall quality score (0-1) */
  overallScore: number;
  /** Scores for each criterion */
  criteriaScores: Record<string, number>;
  /** Textual feedback */
  feedback: string;
  /** Whether quality threshold is met */
  meetsThreshold: boolean;
}

/**
 * Single iteration of self-critique
 */
export interface CritiqueIteration {
  /** Iteration number (1-based) */
  iteration: number;
  /** Output produced in this iteration */
  output: unknown;
  /** Critique evaluation of the output */
  critique: CritiqueEvaluation;
  /** Duration of this iteration in milliseconds */
  durationMs: number;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Result from self-critique orchestration
 */
export interface SelfCritiqueResult extends Omit<OrchestrationResult, 'pattern'> {
  /** Pattern identifier */
  pattern: 'self-critique';
  /** All critique iterations */
  iterations: CritiqueIteration[];
  /** Final refined output */
  finalOutput: unknown;
  /** Final quality score */
  finalScore: number;
  /** Whether quality threshold was achieved */
  converged: boolean;
}

// ============================================================================
// Discussion Types
// ============================================================================

/**
 * Consensus strategy for discussion resolution
 */
export type ConsensusStrategy = 'unanimous' | 'majority' | 'weighted' | 'facilitator';

/**
 * Participant in a discussion
 */
export interface DiscussionParticipant {
  /** Optional unique participant identifier (preserved in responses for client correlation) */
  id?: string;
  /** Agent ID to use */
  agentId: string;
  /** Role in the discussion (e.g., 'critic', 'supporter', 'expert') */
  role: string;
  /** Weight for weighted consensus (0-1) */
  weight?: number;
  /** Specific perspective to take */
  perspective?: string;
}

/**
 * Configuration for discussion pattern
 */
export interface DiscussionConfig {
  /** Maximum number of discussion rounds */
  maxRounds: number;
  /** Participants in the discussion */
  participants: DiscussionParticipant[];
  /** Template for participant prompts (legacy, use contributionPromptTemplate) */
  discussionPromptTemplate?: string;
  /** Template for participant contribution prompts */
  contributionPromptTemplate?: string;
  /** Template for facilitator synthesis prompts */
  synthesisPromptTemplate?: string;
  /** Strategy for reaching consensus */
  consensusStrategy: ConsensusStrategy;
  /** Agent ID for facilitator (required for 'facilitator' strategy) */
  facilitatorAgentId?: string;
  /** Convergence threshold (0-1) */
  convergenceThreshold?: number;
}

/**
 * Individual contribution from a participant
 */
export interface DiscussionContribution {
  /** Participant's agent ID */
  participantId: string;
  /** Participant's role */
  role: string;
  /** Content of the contribution */
  content: string;
  /** Agreement score with previous round synthesis (0-1) */
  agreementScore?: number;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Single round of discussion
 */
export interface DiscussionRound {
  /** Round number (1-based) */
  round: number;
  /** Contributions from all participants */
  contributions: DiscussionContribution[];
  /** Synthesized outcome from facilitator */
  synthesis?: string;
  /** Consensus score for this round (0-1) */
  consensusScore?: number;
  /** Duration of this round in milliseconds */
  durationMs: number;
  /** ISO timestamp */
  timestamp: string;
}

/**
 * Result from discussion orchestration
 */
export interface DiscussionResult extends Omit<OrchestrationResult, 'pattern'> {
  /** Pattern identifier */
  pattern: 'discussion';
  /** All discussion rounds */
  rounds: DiscussionRound[];
  /** Final consensus output */
  finalConsensus: string;
  /** Final consensus score (0-1) */
  consensusScore: number;
  /** Whether convergence threshold was achieved */
  converged: boolean;
  /** Summary of each participant's involvement */
  participantSummaries: Record<string, { contributions: number; agreementRate: number }>;
}

// ============================================================================
// Self-Critique WebSocket Payload Types
// ============================================================================

/**
 * Execute self-critique payload (client -> server)
 */
export interface AgentCritiqueExecutePayload {
  /** Task to execute and critique */
  task: OrchestrationTask;
  /** Self-critique configuration */
  config: SelfCritiqueConfig;
  /** Initial context */
  context?: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Critique iteration payload (server -> client)
 */
export interface AgentCritiqueIterationPayload {
  /** Execution ID */
  executionId: string;
  /** Iteration number */
  iteration: number;
  /** Quality scores */
  scores: {
    overall: number;
    criteria: Record<string, number>;
  };
  /** Feedback text */
  feedback: string;
  /** Whether threshold is met */
  meetsThreshold: boolean;
  /** Timestamp */
  timestamp: string;
}

/**
 * Critique converged payload (server -> client)
 */
export interface AgentCritiqueConvergedPayload {
  /** Execution ID */
  executionId: string;
  /** Final iteration count */
  iterations: number;
  /** Final score */
  finalScore: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Critique completed payload (server -> client)
 */
export interface AgentCritiqueCompletedPayload {
  /** Execution ID */
  executionId: string;
  /** Full result */
  result: SelfCritiqueResult;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Discussion WebSocket Payload Types
// ============================================================================

/**
 * Execute discussion payload (client -> server)
 */
export interface AgentDiscussionExecutePayload {
  /** Topic or initial prompt for discussion */
  topic: string;
  /** Discussion configuration */
  config: DiscussionConfig;
  /** Initial context */
  context?: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Discussion round started payload (server -> client)
 */
export interface AgentDiscussionRoundStartedPayload {
  /** Execution ID */
  executionId: string;
  /** Round number */
  round: number;
  /** Number of participants */
  participantCount: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Discussion contribution payload (server -> client)
 */
export interface AgentDiscussionContributionPayload {
  /** Execution ID */
  executionId: string;
  /** Round number */
  round: number;
  /** Participant ID */
  participantId: string;
  /** Participant role */
  role: string;
  /** Contribution content */
  content: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Discussion round completed payload (server -> client)
 */
export interface AgentDiscussionRoundCompletedPayload {
  /** Execution ID */
  executionId: string;
  /** Round number */
  round: number;
  /** Synthesis from facilitator */
  synthesis?: string;
  /** Consensus score for this round */
  consensusScore: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Discussion converged payload (server -> client)
 */
export interface AgentDiscussionConvergedPayload {
  /** Execution ID */
  executionId: string;
  /** Final round count */
  rounds: number;
  /** Final consensus score */
  consensusScore: number;
  /** Timestamp */
  timestamp: string;
}

/**
 * Discussion completed payload (server -> client)
 */
export interface AgentDiscussionCompletedPayload {
  /** Execution ID */
  executionId: string;
  /** Full result */
  result: DiscussionResult;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Collaboration WebSocket Callback Types
// ============================================================================

export type AgentCritiqueExecuteCallback = (response: {
  success: boolean;
  executionId?: string;
  error?: string;
}) => void;

export type AgentDiscussionExecuteCallback = (response: {
  success: boolean;
  executionId?: string;
  error?: string;
}) => void;

// ============================================================================
// Collaboration HTTP Request/Response Types
// ============================================================================

/**
 * Self-critique request body
 */
export interface SelfCritiqueRequestBody {
  /** Task to execute and critique */
  task: OrchestrationTask;
  /** Self-critique configuration */
  config: SelfCritiqueConfig;
  /** Initial context */
  context?: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Discussion request body
 */
export interface DiscussionRequestBody {
  /** Topic or initial prompt for discussion */
  topic: string;
  /** Discussion configuration */
  config: DiscussionConfig;
  /** Initial context */
  context?: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Collaboration metrics for self-critique pattern
 */
export interface SelfCritiqueMetrics {
  /** Total self-critique executions */
  totalExecutions: number;
  /** Average number of iterations */
  avgIterations: number;
  /** Rate of convergence (0-1) */
  convergenceRate: number;
  /** Average quality improvement per iteration */
  avgQualityImprovement: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
}

/**
 * Collaboration metrics for discussion pattern
 */
export interface DiscussionMetrics {
  /** Total discussion executions */
  totalExecutions: number;
  /** Average number of rounds */
  avgRounds: number;
  /** Rate of convergence (0-1) */
  convergenceRate: number;
  /** Average consensus score */
  avgConsensusScore: number;
  /** Average participants per discussion */
  avgParticipants: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
}
