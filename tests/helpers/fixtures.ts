/**
 * Test Fixtures
 * Reusable test data and factory functions
 */

import type { Config, ApiResponse } from '../../src/types/index';

/**
 * Creates a test configuration
 */
export function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    env: 'development',
    port: 3000,
    logLevel: 'info',
    ...overrides,
  };
}

/**
 * Creates a successful API response
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `test_${Date.now()}`,
    },
  };
}

/**
 * Creates an error API response
 */
export function createErrorResponse(code: string, message: string): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `test_${Date.now()}`,
    },
  };
}

/**
 * Delays execution (useful for async tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a mock function that resolves after a delay
 */
export function createDelayedMock<T>(value: T, delayMs = 100): jest.Mock<Promise<T>> {
  return jest.fn().mockImplementation(async () => {
    await wait(delayMs);
    return value;
  });
}

/**
 * Common test constants
 */
export const TEST_CONSTANTS = {
  VALID_EMAIL: 'test@example.com',
  INVALID_EMAIL: 'not-an-email',
  VALID_PASSWORD: 'SecureP@ssw0rd!',
  WEAK_PASSWORD: '123',
  TEST_USER_ID: 'user_test_123',
  TEST_REQUEST_ID: 'req_test_456',
} as const;
