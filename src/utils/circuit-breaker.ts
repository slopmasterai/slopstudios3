/**
 * Circuit Breaker Implementation
 * Provides fault tolerance for external service calls with automatic recovery
 */

import { logger } from './logger.js';

/**
 * Circuit breaker states
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Name for logging and metrics */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before attempting recovery */
  resetTimeoutMs: number;
  /** Number of successful calls in half-open state to close circuit */
  successThreshold: number;
  /** Timeout for individual calls in ms */
  callTimeoutMs?: number;
  /** Custom function to determine if an error should count as a failure */
  isFailure?: (error: unknown) => boolean;
  /** Callback when circuit opens */
  onOpen?: () => void;
  /** Callback when circuit closes */
  onClose?: () => void;
  /** Callback when circuit enters half-open state */
  onHalfOpen?: () => void;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime?: string;
  lastSuccessTime?: string;
  lastStateChange: string;
}

/**
 * Default failure detector - all errors count as failures
 */
function defaultIsFailure(_error: unknown): boolean {
  return true;
}

/**
 * Circuit Breaker class
 * Implements the circuit breaker pattern for fault tolerance
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private lastStateChange: Date = new Date();
  private resetTimer?: NodeJS.Timeout;
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      callTimeoutMs: 30000,
      isFailure: defaultIsFailure,
      onOpen: () => {},
      onClose: () => {},
      onHalfOpen: () => {},
      ...config,
    };

    logger.debug(
      { name: this.config.name, config: this.config },
      'Circuit breaker initialized'
    );
  }

  /**
   * Executes a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    if (this.state === 'open') {
      throw new CircuitBreakerOpenError(
        `Circuit breaker "${this.config.name}" is open`,
        this.config.name
      );
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.config.isFailure(error)) {
        this.onFailure(error);
      }
      throw error;
    }
  }

  /**
   * Executes a function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.config.callTimeoutMs) {
      return fn();
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CircuitBreakerTimeoutError(
          `Call timed out after ${this.config.callTimeoutMs}ms`,
          this.config.name
        ));
      }, this.config.callTimeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Handles successful call
   */
  private onSuccess(): void {
    this.successes++;
    this.totalSuccesses++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = new Date();

    if (this.state === 'half-open') {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.close();
      }
    }

    logger.debug(
      {
        name: this.config.name,
        state: this.state,
        consecutiveSuccesses: this.consecutiveSuccesses,
      },
      'Circuit breaker call succeeded'
    );
  }

  /**
   * Handles failed call
   */
  private onFailure(error: unknown): void {
    this.failures++;
    this.totalFailures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = new Date();

    logger.warn(
      {
        name: this.config.name,
        state: this.state,
        consecutiveFailures: this.consecutiveFailures,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Circuit breaker call failed'
    );

    if (this.state === 'half-open') {
      this.open();
    } else if (this.state === 'closed') {
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.open();
      }
    }
  }

  /**
   * Opens the circuit breaker
   */
  private open(): void {
    if (this.state === 'open') return;

    this.state = 'open';
    this.lastStateChange = new Date();

    logger.warn(
      {
        name: this.config.name,
        consecutiveFailures: this.consecutiveFailures,
        resetTimeoutMs: this.config.resetTimeoutMs,
      },
      'Circuit breaker opened'
    );

    this.config.onOpen();

    // Schedule transition to half-open
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      this.halfOpen();
    }, this.config.resetTimeoutMs);
  }

  /**
   * Transitions circuit to half-open state
   */
  private halfOpen(): void {
    if (this.state === 'half-open') return;

    this.state = 'half-open';
    this.consecutiveSuccesses = 0;
    this.consecutiveFailures = 0;
    this.lastStateChange = new Date();

    logger.info(
      { name: this.config.name },
      'Circuit breaker half-opened, testing recovery'
    );

    this.config.onHalfOpen();
  }

  /**
   * Closes the circuit breaker
   */
  private close(): void {
    if (this.state === 'closed') return;

    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastStateChange = new Date();

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    logger.info(
      { name: this.config.name },
      'Circuit breaker closed, service recovered'
    );

    this.config.onClose();
  }

  /**
   * Force opens the circuit breaker (for manual intervention)
   */
  forceOpen(): void {
    this.open();
  }

  /**
   * Force closes the circuit breaker (for manual intervention)
   */
  forceClose(): void {
    this.close();
  }

  /**
   * Force resets the circuit breaker to initial state
   */
  reset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalCalls = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.lastStateChange = new Date();

    logger.info({ name: this.config.name }, 'Circuit breaker reset');
  }

  /**
   * Gets the current state of the circuit breaker
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Checks if the circuit breaker is allowing calls
   */
  isAllowingCalls(): boolean {
    return this.state !== 'open';
  }

  /**
   * Gets metrics for the circuit breaker
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailureTime: this.lastFailureTime?.toISOString(),
      lastSuccessTime: this.lastSuccessTime?.toISOString(),
      lastStateChange: this.lastStateChange.toISOString(),
    };
  }

  /**
   * Destroys the circuit breaker and cleans up resources
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
    logger.debug({ name: this.config.name }, 'Circuit breaker destroyed');
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  readonly circuitName: string;

  constructor(message: string, circuitName: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = circuitName;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when call times out
 */
export class CircuitBreakerTimeoutError extends Error {
  readonly circuitName: string;

  constructor(message: string, circuitName: string) {
    super(message);
    this.name = 'CircuitBreakerTimeoutError';
    this.circuitName = circuitName;
    Error.captureStackTrace(this, this.constructor);
  }
}

// =============================================================================
// Circuit Breaker Registry
// =============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Creates or retrieves a circuit breaker
 */
export function getCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  const existing = circuitBreakers.get(config.name);
  if (existing) {
    return existing;
  }

  const breaker = new CircuitBreaker(config);
  circuitBreakers.set(config.name, breaker);
  return breaker;
}

/**
 * Gets an existing circuit breaker by name
 */
export function getCircuitBreakerByName(name: string): CircuitBreaker | undefined {
  return circuitBreakers.get(name);
}

/**
 * Gets all circuit breaker metrics
 */
export function getAllCircuitBreakerMetrics(): CircuitBreakerMetrics[] {
  return Array.from(circuitBreakers.values()).map((cb) => cb.getMetrics());
}

/**
 * Destroys all circuit breakers
 */
export function destroyAllCircuitBreakers(): void {
  for (const [name, breaker] of circuitBreakers) {
    breaker.destroy();
    circuitBreakers.delete(name);
  }
}

export default CircuitBreaker;
