/**
 * Logger Module
 * Configures Pino logger with structured JSON logging for production
 * and pretty printing for development
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

import { serverConfig } from '../config/server.config.js';

import { timestamp } from './index.js';

const logLevelMap: Record<string, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

function createLoggerOptions(): LoggerOptions {
  const isDevelopment = serverConfig.env === 'development';

  const baseOptions: LoggerOptions = {
    level: logLevelMap[serverConfig.logLevel] || 'info',
    timestamp: () => `,"time":"${timestamp()}"`,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings['pid'],
        host: bindings['hostname'],
      }),
    },
    base: {
      env: serverConfig.env,
    },
  };

  if (isDevelopment) {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    };
  }

  return baseOptions;
}

// Create main logger instance
export const logger: Logger = pino(createLoggerOptions());

// Create child logger with request context
export function createRequestLogger(requestId: string): Logger {
  return logger.child({ requestId });
}

// Fastify logger options for integration
export function getFastifyLoggerOptions(): LoggerOptions | boolean {
  const isDevelopment = serverConfig.env === 'development';

  if (isDevelopment) {
    return {
      level: logLevelMap[serverConfig.logLevel] || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    };
  }

  return {
    level: logLevelMap[serverConfig.logLevel] || 'info',
    timestamp: () => `,"time":"${timestamp()}"`,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
}

export default logger;
