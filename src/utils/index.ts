/**
 * Utility functions for Slop Studios 3
 */

// Re-export error utilities
export * from './errors.js';

// Re-export rate limiter utilities
export * from './rate-limiter.js';

/**
 * Generates a unique request ID
 */
export function generateRequestId(): string {
  return `req_${String(Date.now())}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Safely parses JSON with error handling
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Delays execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a timestamp in ISO format
 */
export function timestamp(): string {
  return new Date().toISOString();
}
