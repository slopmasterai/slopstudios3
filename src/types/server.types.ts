/**
 * Server Type Definitions
 * TypeScript interfaces for server configuration, sessions, JWT, and more
 */

/**
 * Extended server configuration
 */
export interface ServerConfig {
  env: 'development' | 'staging' | 'production';
  port: number;
  host: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
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
}

/**
 * Session data stored in Redis (custom session service)
 */
export interface SessionData {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastActivityAt: string;
  ipAddress?: string;
  userAgent?: string;
  data: Record<string, unknown>;
}

/**
 * JWT token payload
 */
export interface JWTPayload {
  userId: string;
  email?: string;
  roles?: string[];
  iat: number;
  exp: number;
  iss?: string;
  sub?: string;
}

/**
 * User data attached to authenticated requests
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  roles?: string[];
}

/**
 * Health check response data
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  version: string;
  uptime: number;
  timestamp: string;
}

/**
 * Readiness check response data
 */
export interface ReadinessCheckResponse extends HealthCheckResponse {
  dependencies: {
    redis: DependencyStatus;
    database: DependencyStatus;
  };
}

/**
 * Dependency status for health checks
 */
export interface DependencyStatus {
  status: 'up' | 'down' | 'not_configured';
  latency?: number;
  error?: string;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
}

/**
 * Error details for API responses
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

// Fastify type extensions
declare module 'fastify' {
  // Extend Session interface for @fastify/session custom data
  interface Session {
    userId?: string;
    sessionId?: string;
    email?: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: AuthenticatedUser;
  }
}
