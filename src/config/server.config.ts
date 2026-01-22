/**
 * Server Configuration Module
 * Loads and validates environment variables for the application
 */

import { config as dotenvConfig } from 'dotenv';

import type { Config } from '../types/index.js';

// Load environment variables
dotenvConfig();

export interface ServerConfig extends Config {
  host: string;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  session: {
    secret: string;
    ttl: number;
  };
  redis: {
    url: string;
    password?: string;
    tls: boolean;
    pool?: {
      minSize: number;
      maxSize: number;
      acquireTimeoutMs: number;
      idleTimeoutMs: number;
      healthCheckIntervalMs: number;
    };
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  database: {
    url: string;
    poolSize: number;
    ssl: boolean;
  };
  claude: {
    cliPath: string;
    apiKey?: string;
    maxConcurrentProcesses: number;
    processTimeoutMs: number;
    enableQueue: boolean;
    maxQueueSize: number;
    useApiFallback: boolean;
    maxRetries: number;
    retryDelayMs: number;
  };
  strudel: {
    maxConcurrentRenders: number;
    renderTimeoutMs: number;
    maxPatternLength: number;
    maxRenderDuration: number;
    defaultSampleRate: number;
    enableQueue: boolean;
    maxQueueSize: number;
    audioFormats: string[];
  };
  agent: {
    maxConcurrentWorkflows: number;
    workflowTimeoutMs: number;
    enableQueue: boolean;
    maxQueueSize: number;
    maxWorkflowSteps: number;
    contextTtlSeconds: number;
    templateCacheTtl: number;
    enableParallelExecution: boolean;
    maxParallelSteps: number;
  };
  collaboration: {
    critique: {
      maxIterations: number;
      defaultThreshold: number;
      timeoutMs: number;
    };
    discussion: {
      maxRounds: number;
      maxParticipants: number;
      convergenceThreshold: number;
      timeoutMs: number;
    };
  };
  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeoutMs: number;
    requestTimeoutMs: number;
  };
  logging: {
    samplingEnabled: boolean;
    samplingRateDebug: number;
    samplingRateInfo: number;
    correlationEnabled: boolean;
  };
  memory: {
    warningThreshold: number;
    criticalThreshold: number;
  };
}

function getEnvString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

function getLogLevel(value: string): 'debug' | 'info' | 'warn' | 'error' {
  const validLevels = ['debug', 'info', 'warn', 'error'] as const;
  if (validLevels.includes(value as (typeof validLevels)[number])) {
    return value as 'debug' | 'info' | 'warn' | 'error';
  }
  return 'info';
}

function getNodeEnv(value: string): 'development' | 'staging' | 'production' {
  const validEnvs = ['development', 'staging', 'production'] as const;
  if (validEnvs.includes(value as (typeof validEnvs)[number])) {
    return value as 'development' | 'staging' | 'production';
  }
  return 'development';
}

function parseCorsOrigin(value: string): string | string[] {
  // Check if it's a comma-separated list
  if (value.includes(',')) {
    return value.split(',').map((origin) => origin.trim());
  }
  return value;
}

function validateConfig(config: ServerConfig): void {
  const errors: string[] = [];

  // Security validations
  if (!config.jwt.secret || config.jwt.secret === 'your-jwt-secret-change-in-production') {
    if (config.env === 'production') {
      errors.push('JWT_SECRET must be set to a secure value in production');
    }
  }

  if (
    !config.session.secret ||
    config.session.secret === 'your-secret-key-here-change-in-production'
  ) {
    if (config.env === 'production') {
      errors.push('APP_SECRET must be set to a secure value in production');
    }
  }

  // Port validation
  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  // Logging validation
  if (config.logging.samplingRateDebug < 0 || config.logging.samplingRateDebug > 1) {
    errors.push('LOG_SAMPLING_RATE_DEBUG must be between 0.0 and 1.0');
  }
  if (config.logging.samplingRateInfo < 0 || config.logging.samplingRateInfo > 1) {
    errors.push('LOG_SAMPLING_RATE_INFO must be between 0.0 and 1.0');
  }

  // Memory threshold validation
  if (config.memory.warningThreshold < 0 || config.memory.warningThreshold > 100) {
    errors.push('MEMORY_WARNING_THRESHOLD must be between 0 and 100');
  }
  if (config.memory.criticalThreshold < 0 || config.memory.criticalThreshold > 100) {
    errors.push('MEMORY_CRITICAL_THRESHOLD must be between 0 and 100');
  }
  if (config.memory.warningThreshold >= config.memory.criticalThreshold) {
    errors.push('MEMORY_WARNING_THRESHOLD must be less than MEMORY_CRITICAL_THRESHOLD');
  }

  // Circuit breaker validation
  if (config.circuitBreaker.failureThreshold < 1) {
    errors.push('CIRCUIT_BREAKER_FAILURE_THRESHOLD must be at least 1');
  }
  if (config.circuitBreaker.recoveryTimeoutMs < 1000) {
    errors.push('CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS must be at least 1000ms');
  }
  if (config.circuitBreaker.requestTimeoutMs < 100) {
    errors.push('CIRCUIT_BREAKER_REQUEST_TIMEOUT_MS must be at least 100ms');
  }

  // Collaboration validation
  if (config.collaboration.critique.defaultThreshold < 0 || config.collaboration.critique.defaultThreshold > 1) {
    errors.push('AGENT_CRITIQUE_DEFAULT_THRESHOLD must be between 0.0 and 1.0');
  }
  if (config.collaboration.discussion.convergenceThreshold < 0 || config.collaboration.discussion.convergenceThreshold > 1) {
    errors.push('AGENT_DISCUSSION_CONVERGENCE_THRESHOLD must be between 0.0 and 1.0');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    env: getNodeEnv(getEnvString('NODE_ENV', 'development')),
    port: getEnvNumber('PORT', 3000),
    host: getEnvString('HOST', '0.0.0.0'),
    logLevel: getLogLevel(getEnvString('LOG_LEVEL', 'info')),
    cors: {
      origin: parseCorsOrigin(getEnvString('CORS_ORIGIN', 'http://localhost:3000')),
      credentials: getEnvBoolean('CORS_CREDENTIALS', true),
    },
    rateLimit: {
      windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
      maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
    },
    session: {
      secret: getEnvString('APP_SECRET', 'your-secret-key-here-change-in-production'),
      ttl: getEnvNumber('SESSION_TTL', 86400), // 24 hours in seconds
    },
    redis: {
      url: getEnvString('REDIS_URL', 'redis://localhost:6379'),
      password: process.env['REDIS_PASSWORD'] ?? undefined,
      tls: getEnvBoolean('REDIS_TLS', false),
      pool: {
        minSize: getEnvNumber('REDIS_POOL_MIN_SIZE', 2),
        maxSize: getEnvNumber('REDIS_POOL_MAX_SIZE', 10),
        acquireTimeoutMs: getEnvNumber('REDIS_POOL_ACQUIRE_TIMEOUT_MS', 5000),
        idleTimeoutMs: getEnvNumber('REDIS_POOL_IDLE_TIMEOUT_MS', 30000),
        healthCheckIntervalMs: getEnvNumber('REDIS_POOL_HEALTH_CHECK_INTERVAL_MS', 30000),
      },
    },
    jwt: {
      secret: getEnvString('JWT_SECRET', 'your-jwt-secret-change-in-production'),
      expiresIn: getEnvString('JWT_EXPIRES_IN', '7d'),
    },
    database: {
      url: getEnvString('DATABASE_URL', 'postgresql://user:YOUR_DB_PASSWORD@localhost:5432/slopstudios3'),
      poolSize: getEnvNumber('DATABASE_POOL_SIZE', 10),
      ssl: getEnvBoolean('DATABASE_SSL', false),
    },
    claude: {
      cliPath: getEnvString('CLAUDE_CLI_PATH', '/usr/local/bin/claude'),
      apiKey: process.env['ANTHROPIC_API_KEY'] ?? undefined,
      maxConcurrentProcesses: getEnvNumber('CLAUDE_MAX_CONCURRENT_PROCESSES', 5),
      processTimeoutMs: getEnvNumber('CLAUDE_PROCESS_TIMEOUT_MS', 300000),
      enableQueue: getEnvBoolean('CLAUDE_ENABLE_QUEUE', true),
      maxQueueSize: getEnvNumber('CLAUDE_MAX_QUEUE_SIZE', 100),
      useApiFallback: getEnvBoolean('CLAUDE_USE_API_FALLBACK', true),
      maxRetries: getEnvNumber('CLAUDE_MAX_RETRIES', 3),
      retryDelayMs: getEnvNumber('CLAUDE_RETRY_DELAY_MS', 1000),
    },
    strudel: {
      maxConcurrentRenders: getEnvNumber('STRUDEL_MAX_CONCURRENT_RENDERS', 3),
      renderTimeoutMs: getEnvNumber('STRUDEL_RENDER_TIMEOUT_MS', 120000),
      maxPatternLength: getEnvNumber('STRUDEL_MAX_PATTERN_LENGTH', 100000),
      maxRenderDuration: getEnvNumber('STRUDEL_MAX_RENDER_DURATION', 600),
      defaultSampleRate: getEnvNumber('STRUDEL_DEFAULT_SAMPLE_RATE', 44100),
      enableQueue: getEnvBoolean('STRUDEL_ENABLE_QUEUE', true),
      maxQueueSize: getEnvNumber('STRUDEL_MAX_QUEUE_SIZE', 50),
      audioFormats: getEnvString('STRUDEL_AUDIO_FORMATS', 'wav').split(','),
    },
    agent: {
      maxConcurrentWorkflows: getEnvNumber('AGENT_MAX_CONCURRENT_WORKFLOWS', 10),
      workflowTimeoutMs: getEnvNumber('AGENT_WORKFLOW_TIMEOUT_MS', 600000), // 10 minutes
      enableQueue: getEnvBoolean('AGENT_ENABLE_QUEUE', true),
      maxQueueSize: getEnvNumber('AGENT_MAX_QUEUE_SIZE', 100),
      maxWorkflowSteps: getEnvNumber('AGENT_MAX_WORKFLOW_STEPS', 50),
      contextTtlSeconds: getEnvNumber('AGENT_CONTEXT_TTL_SECONDS', 3600), // 1 hour
      templateCacheTtl: getEnvNumber('AGENT_TEMPLATE_CACHE_TTL', 300), // 5 minutes
      enableParallelExecution: getEnvBoolean('AGENT_ENABLE_PARALLEL_EXECUTION', true),
      maxParallelSteps: getEnvNumber('AGENT_MAX_PARALLEL_STEPS', 5),
    },
    collaboration: {
      critique: {
        maxIterations: getEnvNumber('AGENT_CRITIQUE_MAX_ITERATIONS', 5),
        defaultThreshold: parseFloat(getEnvString('AGENT_CRITIQUE_DEFAULT_THRESHOLD', '0.8')),
        timeoutMs: getEnvNumber('AGENT_CRITIQUE_TIMEOUT_MS', 600000), // 10 minutes
      },
      discussion: {
        maxRounds: getEnvNumber('AGENT_DISCUSSION_MAX_ROUNDS', 5),
        maxParticipants: getEnvNumber('AGENT_DISCUSSION_MAX_PARTICIPANTS', 10),
        convergenceThreshold: parseFloat(getEnvString('AGENT_DISCUSSION_CONVERGENCE_THRESHOLD', '0.85')),
        timeoutMs: getEnvNumber('AGENT_DISCUSSION_TIMEOUT_MS', 900000), // 15 minutes
      },
    },
    circuitBreaker: {
      failureThreshold: getEnvNumber('CIRCUIT_BREAKER_FAILURE_THRESHOLD', 5),
      recoveryTimeoutMs: getEnvNumber('CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS', 30000), // 30 seconds
      requestTimeoutMs: getEnvNumber('CIRCUIT_BREAKER_REQUEST_TIMEOUT_MS', 10000), // 10 seconds
    },
    logging: {
      samplingEnabled: getEnvBoolean('LOG_SAMPLING_ENABLED', false),
      samplingRateDebug: parseFloat(getEnvString('LOG_SAMPLING_RATE_DEBUG', '1.0')),
      samplingRateInfo: parseFloat(getEnvString('LOG_SAMPLING_RATE_INFO', '1.0')),
      correlationEnabled: getEnvBoolean('LOG_CORRELATION_ENABLED', true),
    },
    memory: {
      warningThreshold: getEnvNumber('MEMORY_WARNING_THRESHOLD', 85),
      criticalThreshold: getEnvNumber('MEMORY_CRITICAL_THRESHOLD', 95),
    },
  };

  validateConfig(config);

  return config;
}

// Export singleton configuration
export const serverConfig = loadConfig();

export default serverConfig;
