/**
 * Claude CLI Type Definitions
 * TypeScript interfaces for Claude CLI wrapper and process management
 */

/**
 * Status of a Claude process
 */
export type ClaudeProcessStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

/**
 * Configuration for spawning Claude CLI processes
 */
export interface ClaudeProcessConfig {
  /** Unique identifier for the process */
  id: string;
  /** User ID who initiated the process */
  userId: string;
  /** The prompt/command to send to Claude */
  prompt: string;
  /** Optional working directory for the Claude CLI */
  workingDirectory?: string;
  /** Maximum time in ms before process is killed */
  timeoutMs?: number;
  /** Environment variables to pass to the process */
  env?: Record<string, string>;
  /** Whether to stream output in real-time */
  stream?: boolean;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Optional model override */
  model?: string;
  /** Optional maximum tokens */
  maxTokens?: number;
  /** Priority for queue ordering (higher = more priority) */
  priority?: number;
  /** Additional CLI arguments */
  cliArgs?: string[];
}

/**
 * Result of a Claude CLI process execution
 */
export interface ClaudeProcessResult {
  /** Process ID */
  id: string;
  /** User ID who initiated the process */
  userId: string;
  /** Final status of the process */
  status: ClaudeProcessStatus;
  /** Standard output from the process */
  stdout: string;
  /** Standard error from the process */
  stderr: string;
  /** Exit code (null if process was killed or didn't exit normally) */
  exitCode: number | null;
  /** Time when the process started */
  startedAt: string;
  /** Time when the process completed */
  completedAt: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Parsed Claude response (if JSON output mode) */
  parsedResponse?: ClaudeParsedResponse;
}

/**
 * Parsed response from Claude CLI
 */
export interface ClaudeParsedResponse {
  /** The main text response */
  content: string;
  /** Token usage information */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Model used */
  model?: string;
  /** Stop reason */
  stopReason?: string;
}

/**
 * Real-time streaming event from Claude CLI
 */
export interface ClaudeStreamEvent {
  /** Process ID */
  processId: string;
  /** Event type */
  type: 'start' | 'data' | 'error' | 'end';
  /** Timestamp of the event */
  timestamp: string;
  /** Data chunk (for 'data' events) */
  data?: string;
  /** Error message (for 'error' events) */
  error?: string;
  /** Final result (for 'end' events) */
  result?: ClaudeProcessResult;
}

/**
 * Process metrics for monitoring
 */
export interface ClaudeProcessMetrics {
  /** Process ID */
  processId: string;
  /** User ID */
  userId: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Peak memory usage in bytes (if available) */
  peakMemoryBytes?: number;
  /** CPU time in milliseconds (if available) */
  cpuTimeMs?: number;
  /** Input size in characters */
  inputSize: number;
  /** Output size in characters */
  outputSize: number;
  /** Whether the process succeeded */
  success: boolean;
  /** Timestamp */
  timestamp: string;
}

/**
 * Aggregated metrics for Claude service
 */
export interface ClaudeServiceMetrics {
  /** Total number of processes executed */
  totalProcesses: number;
  /** Number of successful processes */
  successfulProcesses: number;
  /** Number of failed processes */
  failedProcesses: number;
  /** Number of timed out processes */
  timedOutProcesses: number;
  /** Number of cancelled processes */
  cancelledProcesses: number;
  /** Currently running processes */
  activeProcesses: number;
  /** Processes in queue */
  queuedProcesses: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Minimum duration in milliseconds */
  minDurationMs: number;
  /** Maximum duration in milliseconds */
  maxDurationMs: number;
  /** 95th percentile duration in milliseconds */
  p95DurationMs: number;
  /** 99th percentile duration in milliseconds */
  p99DurationMs: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Timestamp of the metrics snapshot */
  timestamp: string;
  /** Time period covered by metrics (in seconds) */
  periodSeconds: number;
}

/**
 * Process state stored in Redis
 */
export interface ClaudeProcessState {
  /** Process configuration */
  config: ClaudeProcessConfig;
  /** Current status */
  status: ClaudeProcessStatus;
  /** PID of the spawned process (if running) */
  pid?: number;
  /** When the process was created/enqueued */
  createdAt: string;
  /** When the process started running */
  startedAt?: string;
  /** When the process completed */
  completedAt?: string;
  /** Current queue position (if queued) */
  queuePosition?: number;
  /** Accumulated stdout */
  stdout: string;
  /** Accumulated stderr */
  stderr: string;
  /** Error message */
  error?: string;
  /** Exit code */
  exitCode?: number | null;
  /** Number of retry attempts */
  retryCount: number;
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Queue item for process queue
 */
export interface ClaudeQueueItem {
  /** Process ID */
  processId: string;
  /** User ID */
  userId: string;
  /** Priority (higher = more priority) */
  priority: number;
  /** When the item was enqueued */
  enqueuedAt: string;
  /** Estimated wait time in seconds */
  estimatedWaitSeconds?: number;
}

/**
 * Claude CLI installation status
 */
export interface ClaudeInstallationStatus {
  /** Whether Claude CLI is installed */
  installed: boolean;
  /** Path to the Claude CLI executable */
  path?: string;
  /** Version of Claude CLI (if available) */
  version?: string;
  /** Error message if not installed */
  error?: string;
}

/**
 * Configuration for the Claude service
 */
export interface ClaudeServiceConfig {
  /** Path to Claude CLI executable */
  cliPath: string;
  /** Anthropic API key (for fallback) */
  apiKey?: string;
  /** Maximum concurrent processes */
  maxConcurrentProcesses: number;
  /** Default timeout in milliseconds */
  defaultTimeoutMs: number;
  /** Whether to enable queue */
  enableQueue: boolean;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Maximum retries for transient failures */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
  /** Whether to use API fallback when CLI is unavailable */
  useApiFallback: boolean;
}

/**
 * Request body for executing Claude command via HTTP
 */
export interface ClaudeExecuteRequest {
  /** The prompt to send to Claude */
  prompt: string;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Optional model override */
  model?: string;
  /** Optional maximum tokens */
  maxTokens?: number;
  /** Whether to stream the response (async mode only) */
  stream?: boolean;
  /** Optional working directory */
  workingDirectory?: string;
  /** Optional timeout override in milliseconds */
  timeoutMs?: number;
  /** Optional priority for queue */
  priority?: number;
}

/**
 * Response for async execute request
 */
export interface ClaudeAsyncExecuteResponse {
  /** Process ID for tracking */
  processId: string;
  /** Current status */
  status: ClaudeProcessStatus;
  /** Queue position if queued */
  queuePosition?: number;
  /** Estimated wait time in seconds if queued */
  estimatedWaitSeconds?: number;
  /** Message */
  message: string;
}

/**
 * Response for process status query
 */
export interface ClaudeProcessStatusResponse {
  /** Process ID */
  processId: string;
  /** Current status */
  status: ClaudeProcessStatus;
  /** Queue position if queued */
  queuePosition?: number;
  /** When the process was created */
  createdAt: string;
  /** When the process started (if started) */
  startedAt?: string;
  /** When the process completed (if completed) */
  completedAt?: string;
  /** Duration in milliseconds (if completed) */
  durationMs?: number;
  /** Result (if completed) */
  result?: ClaudeProcessResult;
}

/**
 * Response for listing user's processes
 */
export interface ClaudeProcessListResponse {
  /** List of processes */
  processes: ClaudeProcessStatusResponse[];
  /** Total count */
  total: number;
  /** Pagination info */
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Health check response for Claude service
 */
export interface ClaudeHealthResponse {
  /** Whether the service is healthy */
  healthy: boolean;
  /** CLI installation status */
  cli: ClaudeInstallationStatus;
  /** Whether API fallback is available */
  apiFallbackAvailable: boolean;
  /** Current active processes count */
  activeProcesses: number;
  /** Current queue size */
  queueSize: number;
  /** Maximum concurrent processes allowed */
  maxConcurrentProcesses: number;
}

/**
 * WebSocket event payloads for Claude operations
 */
export interface ClaudeExecutePayload {
  /** The prompt to send to Claude */
  prompt: string;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Optional model override */
  model?: string;
  /** Optional maximum tokens */
  maxTokens?: number;
  /** Optional working directory */
  workingDirectory?: string;
  /** Optional timeout override in milliseconds */
  timeoutMs?: number;
}

export interface ClaudeProgressPayload {
  /** Process ID */
  processId: string;
  /** Current status */
  status: ClaudeProcessStatus;
  /** Data chunk (incremental output) */
  data?: string;
  /** Progress percentage (0-100, if determinable) */
  progress?: number;
  /** Status message */
  message?: string;
  /** Timestamp */
  timestamp: string;
}

export interface ClaudeCompletePayload {
  /** Process ID */
  processId: string;
  /** Final result */
  result: ClaudeProcessResult;
  /** Timestamp */
  timestamp: string;
}

export interface ClaudeErrorPayload {
  /** Process ID (if applicable) */
  processId?: string;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Timestamp */
  timestamp: string;
}

export interface ClaudeQueuedPayload {
  /** Process ID */
  processId: string;
  /** Queue position */
  queuePosition: number;
  /** Message instructing client to poll */
  message: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * WebSocket callback types for Claude operations
 */
export type ClaudeExecuteCallback = (response: {
  success: boolean;
  processId?: string;
  error?: string;
}) => void;

export type ClaudeCancelCallback = (response: {
  success: boolean;
  message?: string;
  error?: string;
}) => void;
