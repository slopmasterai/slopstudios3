/**
 * Health Check Routes
 * Implements health endpoints for Kubernetes probes and monitoring
 */

import { healthCheck as redisHealthCheck, isRedisConnected } from '../services/redis.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';

import type { ApiResponse } from '../types/index.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  version: string;
  uptime: number;
}

interface ReadinessStatus extends HealthStatus {
  dependencies: {
    redis: {
      status: 'up' | 'down';
      latency?: number;
      error?: string;
    };
    database: {
      status: 'up' | 'down' | 'not_configured';
      latency?: number;
      error?: string;
    };
  };
}

interface LivenessStatus {
  status: 'alive';
  timestamp: string;
}

const startTime = Date.now();

function getUptime(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /health - Basic health check
   * Returns 200 OK if the server is running
   */
  app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const healthStatus: HealthStatus = {
      status: 'healthy',
      version: process.env['npm_package_version'] || '0.0.1',
      uptime: getUptime(),
    };

    const response: ApiResponse<HealthStatus> = {
      success: true,
      data: healthStatus,
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    return reply.status(200).send(response);
  });

  /**
   * GET /health/ready - Readiness probe
   * Checks all dependencies are ready to serve traffic
   */
  app.get('/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    const redisCheck = await redisHealthCheck();

    // Database check - placeholder for future implementation
    const databaseCheck = {
      status: 'not_configured' as const,
    };

    const allHealthy = redisCheck.healthy;
    const status = allHealthy ? 'healthy' : 'unhealthy';

    const readinessStatus: ReadinessStatus = {
      status,
      version: process.env['npm_package_version'] || '0.0.1',
      uptime: getUptime(),
      dependencies: {
        redis: {
          status: redisCheck.healthy ? 'up' : 'down',
          latency: redisCheck.latency,
          error: redisCheck.error,
        },
        database: databaseCheck,
      },
    };

    const response: ApiResponse<ReadinessStatus> = {
      success: allHealthy,
      data: readinessStatus,
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    const statusCode = allHealthy ? 200 : 503;
    return reply.status(statusCode).send(response);
  });

  /**
   * GET /health/live - Liveness probe
   * Returns 200 if the application is running (always returns success)
   */
  app.get('/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    const livenessStatus: LivenessStatus = {
      status: 'alive',
      timestamp: timestamp(),
    };

    const response: ApiResponse<LivenessStatus> = {
      success: true,
      data: livenessStatus,
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    return reply.status(200).send(response);
  });

  /**
   * GET /health/redis - Redis-specific health check
   * Returns detailed Redis connection status
   */
  app.get('/health/redis', async (request: FastifyRequest, reply: FastifyReply) => {
    const redisCheck = await redisHealthCheck();
    const connected = isRedisConnected();

    const response: ApiResponse<{
      connected: boolean;
      healthy: boolean;
      latency?: number;
      error?: string;
    }> = {
      success: redisCheck.healthy,
      data: {
        connected,
        healthy: redisCheck.healthy,
        latency: redisCheck.latency,
        error: redisCheck.error,
      },
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    const statusCode = redisCheck.healthy ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}

export default registerHealthRoutes;
