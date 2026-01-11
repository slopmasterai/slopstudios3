/**
 * Strudel Test Fixtures
 * Sample patterns, mock audio buffers, and process states for testing
 */

import type {
  StrudelValidationResult,
  StrudelProcessConfig,
  StrudelProcessResult,
  StrudelRedisState,
  StrudelRenderOptions,
  StrudelProcessStatus,
} from '../../src/types/strudel.types.js';

// Sample valid Strudel patterns
export const validPatterns = {
  simple: {
    code: 'note("c3").s("sawtooth")',
    description: 'Simple note pattern with sawtooth synth',
  },
  miniNotation: {
    code: '"c3 e3 g3 c4"',
    description: 'Mini-notation pattern',
  },
  withEffects: {
    code: 's("bd sd hh sd").gain(0.8).room(0.3)',
    description: 'Drum pattern with gain and reverb',
  },
  melodic: {
    code: 'note("c3 e3 g3 c4").fast(2).s("piano")',
    description: 'Fast melodic pattern',
  },
  layered: {
    code: 'stack(s("bd*4"), s("hh*8").gain(0.5))',
    description: 'Layered drum pattern',
  },
  euclidean: {
    code: 's("bd").euclid(3, 8)',
    description: 'Euclidean rhythm pattern',
  },
  withPan: {
    code: 'note("c3 e3 g3").pan(sine)',
    description: 'Pattern with panning automation',
  },
  complex: {
    code: `
      $: s("bd sd hh sd")
        .gain(0.8)
        .room(0.2)
        .delay(0.25)
        .delaytime(0.125)
        .delayfeedback(0.3)
    `,
    description: 'Complex pattern with multiple effects',
  },
};

// Sample invalid Strudel patterns
export const invalidPatterns = {
  syntaxError: {
    code: 'note("c3"',
    expectedError: 'Syntax error',
    description: 'Missing closing parenthesis',
  },
  emptyPattern: {
    code: '',
    expectedError: 'empty',
    description: 'Empty pattern',
  },
  infiniteLoop: {
    code: 'while(true) {}',
    expectedError: 'infinite loop',
    description: 'Contains infinite loop',
  },
  tooLong: {
    code: 'a'.repeat(100001),
    expectedError: 'exceeds maximum length',
    description: 'Pattern exceeds max length',
  },
  malformedMiniNotation: {
    code: '"[c3 e3 g3"',
    expectedError: 'brackets',
    description: 'Unmatched brackets in mini-notation',
  },
};

// Mock validation results
export const mockValidationResults = {
  valid: {
    isValid: true,
    errors: [],
    warnings: [],
    transpiledCode: 'note("c3").s("sawtooth")',
    validationTimeMs: 15,
  } as StrudelValidationResult,

  invalid: {
    isValid: false,
    errors: [
      {
        message: 'Unexpected token (1:10)',
        line: 1,
        column: 10,
        code: 'SYNTAX_ERROR',
        suggestion: 'Check for missing brackets or quotes',
      },
    ],
    warnings: [],
    validationTimeMs: 5,
  } as StrudelValidationResult,

  withWarnings: {
    isValid: true,
    errors: [],
    warnings: [
      {
        message: 'Pattern is very short and may not produce meaningful output',
        code: 'SHORT_PATTERN',
      },
    ],
    transpiledCode: '"c3"',
    validationTimeMs: 10,
  } as StrudelValidationResult,
};

// Mock audio buffers
export function createMockAudioBuffer(
  sampleCount: number = 44100,
  channels: number = 2
): Float32Array {
  const buffer = new Float32Array(sampleCount * channels);
  const frequency = 440;
  const sampleRate = 44100;

  for (let i = 0; i < sampleCount; i++) {
    const sample = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5;
    for (let ch = 0; ch < channels; ch++) {
      buffer[i * channels + ch] = sample;
    }
  }

  return buffer;
}

// Mock render options
export const defaultRenderOptions: StrudelRenderOptions = {
  duration: 10,
  sampleRate: 44100,
  channels: 2,
  format: 'wav',
};

export const customRenderOptions: StrudelRenderOptions = {
  duration: 30,
  sampleRate: 48000,
  channels: 1,
  format: 'mp3',
  tempo: 120,
};

// Mock process configs
export function createMockProcessConfig(
  overrides: Partial<StrudelProcessConfig> = {}
): StrudelProcessConfig {
  return {
    processId: 'strudel_test_001',
    userId: 'user-test-123',
    code: validPatterns.simple.code,
    options: defaultRenderOptions,
    priority: 0,
    requestId: 'req_test_001',
    socketId: 'socket_test_001',
    createdAt: new Date(),
    ...overrides,
  };
}

// Mock process results
export function createMockProcessResult(
  status: StrudelProcessStatus = 'complete',
  overrides: Partial<StrudelProcessResult> = {}
): StrudelProcessResult {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 5000);

  return {
    processId: 'strudel_test_001',
    success: status === 'complete',
    status,
    validation: mockValidationResults.valid,
    audioBuffer: status === 'complete' ? Array.from(createMockAudioBuffer(1000)) : undefined,
    audioMetadata:
      status === 'complete'
        ? {
            duration: 10,
            sampleRate: 44100,
            channels: 2,
            format: 'wav',
            fileSize: 882044,
          }
        : undefined,
    error:
      status === 'failed'
        ? {
            code: 'RENDER_ERROR',
            message: 'Mock render error',
          }
        : undefined,
    timing: {
      startedAt,
      completedAt: now,
      validationTimeMs: 15,
      renderTimeMs: 4985,
      totalTimeMs: 5000,
    },
    ...overrides,
  };
}

// Mock Redis states
export function createMockRedisState(
  status: StrudelProcessStatus = 'pending',
  overrides: Partial<StrudelRedisState> = {}
): StrudelRedisState {
  const now = new Date().toISOString();

  return {
    processId: 'strudel_test_001',
    userId: 'user-test-123',
    status,
    code: validPatterns.simple.code,
    options: defaultRenderOptions,
    priority: 0,
    requestId: 'req_test_001',
    socketId: 'socket_test_001',
    progress: status === 'complete' ? 100 : status === 'rendering' ? 50 : 0,
    createdAt: now,
    startedAt: ['rendering', 'complete', 'failed', 'cancelled'].includes(status) ? now : undefined,
    completedAt: ['complete', 'failed', 'cancelled'].includes(status) ? now : undefined,
    ...overrides,
  };
}

// Mock queue items
export function createMockQueueItem(
  processId: string = 'strudel_test_001',
  priority: number = 0
): { processId: string; userId: string; priority: number; enqueuedAt: string } {
  return {
    processId,
    userId: 'user-test-123',
    priority,
    enqueuedAt: new Date().toISOString(),
  };
}

// Test user IDs
export const testUsers = {
  user1: 'user-test-123',
  user2: 'user-test-456',
  admin: 'admin-test-001',
};

// Mock JWT tokens for testing
export const mockTokens = {
  valid:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXItdGVzdC0xMjMiLCJpYXQiOjE2MDk0NTkyMDB9.mock',
  expired: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXItdGVzdC0xMjMiLCJleHAiOjF9.mock',
  invalid: 'invalid-token',
};

// Mock error payloads
export const mockErrors = {
  rateLimit: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded. Please wait before making more requests.',
  },
  unauthorized: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
  },
  notFound: {
    code: 'NOT_FOUND',
    message: 'Process not found',
  },
  forbidden: {
    code: 'FORBIDDEN',
    message: 'Access denied to this process',
  },
  validationError: {
    code: 'VALIDATION_ERROR',
    message: 'Pattern validation failed',
  },
  renderError: {
    code: 'RENDER_ERROR',
    message: 'Audio rendering failed',
  },
  timeout: {
    code: 'TIMEOUT',
    message: 'Operation timed out',
  },
};

// Expected HTTP status codes for different scenarios
export const expectedStatusCodes = {
  success: 200,
  created: 201,
  accepted: 202,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  tooManyRequests: 429,
  internalError: 500,
  serviceUnavailable: 503,
};

export default {
  validPatterns,
  invalidPatterns,
  mockValidationResults,
  createMockAudioBuffer,
  defaultRenderOptions,
  customRenderOptions,
  createMockProcessConfig,
  createMockProcessResult,
  createMockRedisState,
  createMockQueueItem,
  testUsers,
  mockTokens,
  mockErrors,
  expectedStatusCodes,
};
