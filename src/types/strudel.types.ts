/**
 * Strudel Type Definitions
 * Types for Strudel pattern validation and audio rendering
 */

/**
 * Supported audio output formats
 * Currently only WAV is supported for audio rendering
 */
export type StrudelAudioFormat = 'wav';

/**
 * Strudel process status
 */
export type StrudelProcessStatus =
  | 'pending'
  | 'queued'
  | 'validating'
  | 'rendering'
  | 'complete'
  | 'failed'
  | 'cancelled';

/**
 * Represents a validated Strudel pattern
 */
export interface StrudelPattern {
  /** Original pattern code */
  code: string;
  /** Transpiled JavaScript code */
  transpiledCode: string;
  /** Whether the pattern is valid */
  isValid: boolean;
  /** Pattern AST (if available) */
  ast?: unknown;
  /** Pattern duration hint in seconds */
  durationHint?: number;
  /** Detected tempo/BPM */
  tempo?: number;
}

/**
 * Validation result for a Strudel pattern
 */
export interface StrudelValidationResult {
  /** Whether the pattern is valid */
  isValid: boolean;
  /** Validation errors */
  errors: StrudelValidationError[];
  /** Validation warnings */
  warnings: StrudelValidationWarning[];
  /** Transpiled code if valid */
  transpiledCode?: string;
  /** Validation duration in milliseconds */
  validationTimeMs: number;
}

/**
 * Validation error structure
 */
export interface StrudelValidationError {
  /** Error message */
  message: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Error code */
  code?: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validation warning structure
 */
export interface StrudelValidationWarning {
  /** Warning message */
  message: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Warning code */
  code?: string;
}

/**
 * WebSocket/HTTP request payload for pattern execution
 */
export interface StrudelExecutePayload {
  /** Strudel pattern code */
  code: string;
  /** Render options */
  options?: StrudelRenderOptions;
  /** Priority (higher = processed first) */
  priority?: number;
  /** Client-provided request ID for correlation */
  requestId?: string;
}

/**
 * Progress event payload for real-time updates
 */
export interface StrudelProgressPayload {
  /** Process ID */
  processId: string;
  /** Current status */
  status: StrudelProcessStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current render time in seconds */
  currentTime?: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
  /** Events processed count */
  eventsProcessed?: number;
  /** Message */
  message?: string;
}

/**
 * Completion event payload
 */
export interface StrudelCompletePayload {
  /** Process ID */
  processId: string;
  /** Success status */
  success: boolean;
  /** Audio data as base64 string */
  audioData?: string;
  /** Audio format */
  format?: StrudelAudioFormat;
  /** Audio duration in seconds */
  duration?: number;
  /** Sample rate */
  sampleRate?: number;
  /** Number of channels */
  channels?: number;
  /** File size in bytes */
  fileSize?: number;
  /** Render time in milliseconds */
  renderTimeMs?: number;
  /** Total processing time in milliseconds */
  totalTimeMs?: number;
}

/**
 * Error event payload
 */
export interface StrudelErrorPayload {
  /** Process ID (if available) */
  processId?: string;
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Detailed error information */
  details?: {
    line?: number;
    column?: number;
    suggestion?: string;
    stack?: string;
  };
}

/**
 * Queued event payload
 */
export interface StrudelQueuedPayload {
  /** Process ID */
  processId: string;
  /** Position in queue */
  position: number;
  /** Estimated wait time in seconds */
  estimatedWaitTime?: number;
  /** Queue length */
  queueLength: number;
}

/**
 * Validated event payload (after successful validation)
 */
export interface StrudelValidatedPayload {
  /** Process ID */
  processId: string;
  /** Validation result */
  validation: StrudelValidationResult;
  /** Pattern info */
  pattern?: {
    tempo?: number;
    durationHint?: number;
  };
}

/**
 * Process configuration for pattern execution
 */
export interface StrudelProcessConfig {
  /** Unique process ID */
  processId: string;
  /** User ID */
  userId: string;
  /** Pattern code */
  code: string;
  /** Render options */
  options: StrudelRenderOptions;
  /** Priority level */
  priority: number;
  /** Client request ID for correlation */
  requestId?: string;
  /** Socket ID for WebSocket responses */
  socketId?: string;
  /** Created timestamp */
  createdAt: Date;
}

/**
 * Process result after execution
 */
export interface StrudelProcessResult {
  /** Process ID */
  processId: string;
  /** Success status */
  success: boolean;
  /** Process status */
  status: StrudelProcessStatus;
  /** Validation result */
  validation?: StrudelValidationResult;
  /** Audio buffer (as Float32Array serialized) */
  audioBuffer?: number[];
  /** Exported audio data as base64-encoded WAV */
  audioData?: string;
  /** Audio metadata */
  audioMetadata?: {
    duration: number;
    sampleRate: number;
    channels: number;
    format: StrudelAudioFormat;
    fileSize: number;
  };
  /** Error if failed */
  error?: StrudelErrorPayload;
  /** Timing information */
  timing: {
    startedAt: Date;
    completedAt: Date;
    validationTimeMs: number;
    renderTimeMs: number;
    totalTimeMs: number;
  };
}

/**
 * Render options for audio output
 */
export interface StrudelRenderOptions {
  /** Duration in seconds (default: 10) */
  duration?: number;
  /** Sample rate in Hz (default: 44100) */
  sampleRate?: number;
  /** Number of audio channels (default: 2) */
  channels?: number;
  /** Output format (only 'wav' is currently supported) */
  format?: StrudelAudioFormat;
  /** Tempo/BPM override */
  tempo?: number;
}

/**
 * Health check response for Strudel service
 */
export interface StrudelHealthResponse {
  /** Service status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Service version */
  version: string;
  /** Transpiler status */
  transpiler: {
    available: boolean;
    version?: string;
  };
  /** Audio renderer status */
  audioRenderer: {
    available: boolean;
  };
  /** Current process counts */
  processes: {
    active: number;
    queued: number;
    maxConcurrent: number;
  };
  /** Uptime in seconds */
  uptimeSeconds: number;
  /** Last health check timestamp */
  lastCheck: string;
}

/**
 * Service metrics for monitoring
 */
export interface StrudelServiceMetrics {
  /** Time period for metrics in seconds */
  periodSeconds: number;
  /** Validation metrics */
  validation: {
    total: number;
    successful: number;
    failed: number;
    averageTimeMs: number;
  };
  /** Render metrics */
  render: {
    total: number;
    successful: number;
    failed: number;
    cancelled: number;
    averageTimeMs: number;
    averageDurationSeconds: number;
    totalAudioSeconds: number;
  };
  /** Queue metrics */
  queue: {
    currentDepth: number;
    peakDepth: number;
    averageWaitTimeMs: number;
    rejected: number;
  };
  /** Error breakdown */
  errors: {
    validationErrors: number;
    renderErrors: number;
    timeoutErrors: number;
    systemErrors: number;
  };
}

/**
 * Redis state for a Strudel process
 */
export interface StrudelRedisState {
  /** Process ID */
  processId: string;
  /** User ID */
  userId: string;
  /** Current status */
  status: StrudelProcessStatus;
  /** Pattern code */
  code: string;
  /** Render options */
  options: StrudelRenderOptions;
  /** Priority */
  priority: number;
  /** Request ID */
  requestId?: string;
  /** Socket ID */
  socketId?: string;
  /** Queue position (if queued) */
  queuePosition?: number;
  /** Progress (0-100) */
  progress: number;
  /** Validation result */
  validation?: StrudelValidationResult;
  /** Error info */
  error?: StrudelErrorPayload;
  /** Created timestamp */
  createdAt: string;
  /** Started timestamp */
  startedAt?: string;
  /** Completed timestamp */
  completedAt?: string;
  /** Render result (stored upon completion for async/queued retrieval) */
  result?: {
    /** Audio data as base64 string */
    audioData?: string;
    /** Audio metadata */
    audioMetadata?: {
      duration: number;
      sampleRate: number;
      channels: number;
      format: StrudelAudioFormat;
      fileSize: number;
    };
    /** Timing information */
    timing?: {
      startedAt: string;
      completedAt: string;
      validationTimeMs: number;
      renderTimeMs: number;
      totalTimeMs: number;
    };
  };
}

/**
 * WebSocket callback types
 */
export type StrudelExecuteCallback = (response: {
  success: boolean;
  processId?: string;
  status?: StrudelProcessStatus;
  audioMetadata?: {
    duration: number;
    sampleRate: number;
    channels: number;
    format: StrudelAudioFormat;
    fileSize: number;
  };
  timing?: {
    startedAt: Date;
    completedAt: Date;
    validationTimeMs: number;
    renderTimeMs: number;
    totalTimeMs: number;
  };
  error?: { code: string; message: string } | string;
}) => void;

export type StrudelCancelCallback = (response: {
  success: boolean;
  cancelled?: boolean;
  message?: string;
  error?: string;
}) => void;

export type StrudelValidateCallback = (response: {
  success: boolean;
  isValid?: boolean;
  errors?: StrudelValidationError[];
  warnings?: StrudelValidationWarning[];
  validationTimeMs?: number;
  validation?: StrudelValidationResult;
  error?: { code: string; message: string } | string;
}) => void;

export type StrudelStatusCallback = (response: {
  success: boolean;
  status?: {
    status: StrudelProcessStatus;
    progress?: number;
    queuePosition?: number;
  } | null;
  progress?: number;
  queuePosition?: number;
  error?: string;
}) => void;
