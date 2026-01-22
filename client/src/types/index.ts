// Common types used across the application

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

// Process status types
export type ProcessStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

// Claude types
export interface ClaudeCommand {
  command: string;
  options?: ClaudeOptions;
}

export interface ClaudeOptions {
  timeout?: number;
  model?: string;
  maxTokens?: number;
}

export interface ClaudeProcess {
  id: string;
  command: string;
  status: ProcessStatus;
  output: string;
  error?: string;
  exitCode?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ClaudeMetrics {
  totalCommands: number;
  activeProcesses: number;
  completedProcesses: number;
  failedProcesses: number;
  avgExecutionTime: number;
}

// Strudel types
export interface StrudelPattern {
  code: string;
  options?: StrudelOptions;
}

export interface StrudelOptions {
  duration?: number;
  sampleRate?: number;
  format?: 'wav' | 'mp3';
}

export interface StrudelProcess {
  id: string;
  code: string;
  status: ProcessStatus;
  progress: number;
  audioUrl?: string;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface StrudelValidationError {
  message: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface StrudelValidationWarning {
  message: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface StrudelValidationResult {
  isValid: boolean;
  errors: StrudelValidationError[];
  warnings: StrudelValidationWarning[];
  transpiledCode?: string;
  validationTimeMs: number;
}

export interface StrudelMetrics {
  totalPatterns: number;
  activeProcesses: number;
  completedProcesses: number;
  failedProcesses: number;
  avgRenderTime: number;
}

// Agent types
export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  config: AgentConfig;
  status: 'active' | 'inactive' | 'busy';
  createdAt: string;
  updatedAt: string;
}

export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: TemplateVariable[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  required: boolean;
  defaultValue?: unknown;
}

// Workflow types
export type WorkflowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Workflow {
  id: string;
  name: string;
  type: 'sequential' | 'parallel' | 'self-critique' | 'discussion';
  agents: string[];
  status: WorkflowStatus;
  currentStep: number;
  totalSteps: number;
  results: WorkflowStepResult[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface WorkflowStepResult {
  step: number;
  agentId: string;
  input?: unknown;
  output?: unknown;
  result?: unknown;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowExecution {
  workflowId: string;
  type: 'sequential' | 'parallel' | 'self-critique' | 'discussion';
  agents: string[];
  input: unknown;
  options?: WorkflowOptions;
}

export interface WorkflowOptions {
  timeout?: number;
  maxIterations?: number;
  maxRounds?: number;
}

export interface AgentMetrics {
  totalAgents: number;
  activeAgents: number;
  totalWorkflows: number;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  avgWorkflowTime: number;
}

// Health types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  services: ServiceHealth[];
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: unknown;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Generic response types
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
  statusCode: number;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Re-export collaboration types from backend for frontend use
export type {
  ConsensusStrategy,
  DiscussionParticipant,
  DiscussionConfig,
  DiscussionContribution,
  DiscussionRound,
  DiscussionResult,
  QualityCriterion,
  SelfCritiqueConfig,
  CritiqueEvaluation,
  CritiqueIteration,
  SelfCritiqueResult,
  DiscussionMetrics,
  SelfCritiqueMetrics,
} from '@backend/types/agent.types';
