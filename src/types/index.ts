/**
 * Core type definitions for Slop Studios 3
 */

// Re-export branded types
export * from './branded.types.js';

// Re-export utility types
export * from './utility.types.js';

export interface Config {
  env: 'development' | 'staging' | 'production';
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    category?: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
