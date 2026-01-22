/**
 * Health Check Routes
 * Implements health endpoints for Kubernetes probes and monitoring
 */

import v8 from 'v8';
import { getRegistryStats } from '../services/agent-registry.service.js';
import { getEngineStats } from '../services/workflow-engine.service.js';
import { listTemplates } from '../services/prompt-template.service.js';
import { healthCheck as redisHealthCheck, isRedisConnected, getPoolMetrics } from '../services/redis.service.js';
import type { RedisPoolMetrics } from '../services/redis.service.js';
import { timestamp, generateRequestId } from '../utils/index.js';
import { getMemoryUsage } from '../utils/logger.js';
import { getAllErrorRates } from '../middleware/error.middleware.js';
import { getAllCircuitBreakerMetrics } from '../utils/circuit-breaker.js';

import type { AgentType, AgentStatus } from '../types/agent.types.js';
import type { ApiResponse } from '../types/index.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface MemoryInfo {
  heapUsedMB: number;
  heapTotalMB: number;
  heapUsedPercent: number;
  rssMB: number;
  externalMB: number;
}

interface PerformanceMetrics {
  errorRates: Record<string, number>;
  circuitBreakers: Record<string, {
    state: string;
    failures: number;
    successes: number;
  }>;
}

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  version: string;
  uptime: number;
  nodeVersion: string;
  environment: string;
}

interface AgentSystemHealth {
  registry: {
    status: 'up' | 'down';
    totalAgents: number;
    byType: Record<AgentType, number>;
    byStatus: Record<AgentStatus, number>;
    error?: string;
  };
  workflowEngine: {
    status: 'up' | 'down';
    activeWorkflows: number;
    queuedWorkflows: number;
    maxConcurrent: number;
    error?: string;
  };
  templateService: {
    status: 'up' | 'down';
    available: boolean;
    error?: string;
  };
}

interface ReadinessStatus extends HealthStatus {
  memory: MemoryInfo;
  performance: PerformanceMetrics;
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
    agentSystem?: AgentSystemHealth;
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

function getMemoryInfo(): MemoryInfo {
  const mem = getMemoryUsage();
  return {
    heapUsedMB: mem.heapUsedMB,
    heapTotalMB: mem.heapTotalMB,
    heapUsedPercent: mem.heapUsedPercent,
    rssMB: mem.rssMB,
    externalMB: mem.externalMB,
  };
}

function getPerformanceMetrics(): PerformanceMetrics {
  const errorRates = getAllErrorRates();
  const circuitBreakers = getAllCircuitBreakerMetrics();

  const cbMetrics: PerformanceMetrics['circuitBreakers'] = {};
  for (const [name, metrics] of Object.entries(circuitBreakers)) {
    cbMetrics[name] = {
      state: metrics.state,
      failures: metrics.failures,
      successes: metrics.successes,
    };
  }

  return {
    errorRates,
    circuitBreakers: cbMetrics,
  };
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
      nodeVersion: process.version,
      environment: process.env['NODE_ENV'] || 'development',
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

    // Agent system health check (only if Redis is connected)
    let agentSystemHealth: AgentSystemHealth | undefined;
    let agentSystemHealthy = true;

    if (redisCheck.healthy) {
      try {
        // Check agent registry
        const registryStats = await getRegistryStats();
        const registryHealth: AgentSystemHealth['registry'] = {
          status: 'up',
          totalAgents: registryStats.totalAgents,
          byType: registryStats.byType,
          byStatus: registryStats.byStatus,
        };

        // Check workflow engine
        const engineStats = await getEngineStats();
        const engineHealth: AgentSystemHealth['workflowEngine'] = {
          status: 'up',
          activeWorkflows: engineStats.activeWorkflows,
          queuedWorkflows: engineStats.queuedWorkflows,
          maxConcurrent: engineStats.maxConcurrent,
        };

        // Check template service availability
        let templateServiceAvailable = true;
        let templateServiceError: string | undefined;
        try {
          // Simple availability check - list templates with minimal load
          await listTemplates({ page: 1, pageSize: 1 });
        } catch (error) {
          templateServiceAvailable = false;
          templateServiceError = error instanceof Error ? error.message : 'Unknown error';
        }

        const templateHealth: AgentSystemHealth['templateService'] = {
          status: templateServiceAvailable ? 'up' : 'down',
          available: templateServiceAvailable,
          error: templateServiceError,
        };

        agentSystemHealth = {
          registry: registryHealth,
          workflowEngine: engineHealth,
          templateService: templateHealth,
        };

        // Agent system is considered unhealthy if any error agents or template service is down
        agentSystemHealthy = registryStats.byStatus.error === 0 && templateServiceAvailable;
      } catch (error) {
        // If agent system check fails, report it but don't fail the entire readiness check
        agentSystemHealth = {
          registry: {
            status: 'down',
            totalAgents: 0,
            byType: { claude: 0, strudel: 0, custom: 0 },
            byStatus: { idle: 0, busy: 0, error: 0, offline: 0 },
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          workflowEngine: {
            status: 'down',
            activeWorkflows: 0,
            queuedWorkflows: 0,
            maxConcurrent: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          templateService: {
            status: 'down',
            available: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        };
        agentSystemHealthy = false;
      }
    }

    // Get memory and performance metrics
    const memoryInfo = getMemoryInfo();
    const performanceMetrics = getPerformanceMetrics();

    // Check memory pressure
    const memoryPressure = memoryInfo.heapUsedPercent > 90;

    const allHealthy = redisCheck.healthy;
    // Use 'degraded' status if Redis is healthy but agent system has issues or memory pressure
    const status = allHealthy
      ? (agentSystemHealthy && !memoryPressure ? 'healthy' : 'degraded')
      : 'unhealthy';

    const readinessStatus: ReadinessStatus = {
      status,
      version: process.env['npm_package_version'] || '0.0.1',
      uptime: getUptime(),
      nodeVersion: process.version,
      environment: process.env['NODE_ENV'] || 'development',
      memory: memoryInfo,
      performance: performanceMetrics,
      dependencies: {
        redis: {
          status: redisCheck.healthy ? 'up' : 'down',
          latency: redisCheck.latency,
          error: redisCheck.error,
        },
        database: databaseCheck,
        agentSystem: agentSystemHealth,
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
   * Returns detailed Redis connection status and pool metrics
   */
  app.get('/health/redis', async (request: FastifyRequest, reply: FastifyReply) => {
    const redisCheck = await redisHealthCheck();
    const connected = isRedisConnected();
    const poolMetrics = getPoolMetrics();

    const response: ApiResponse<{
      connected: boolean;
      healthy: boolean;
      latency?: number;
      error?: string;
      pool: RedisPoolMetrics;
    }> = {
      success: redisCheck.healthy,
      data: {
        connected,
        healthy: redisCheck.healthy,
        latency: redisCheck.latency,
        error: redisCheck.error,
        pool: poolMetrics,
      },
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    const statusCode = redisCheck.healthy ? 200 : 503;
    return reply.status(statusCode).send(response);
  });

  /**
   * GET /health/metrics - Detailed performance metrics
   * Returns memory usage, error rates, circuit breaker status, and Redis pool metrics
   */
  app.get('/health/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const memoryInfo = getMemoryInfo();
    const performanceMetrics = getPerformanceMetrics();
    const memoryUsage = process.memoryUsage();
    const poolMetrics = getPoolMetrics();

    const response: ApiResponse<{
      memory: MemoryInfo & {
        arrayBuffersMB: number;
        nodeHeapSizeLimit: number;
      };
      errorRates: Record<string, number>;
      circuitBreakers: Record<string, {
        state: string;
        failures: number;
        successes: number;
      }>;
      redisPool: RedisPoolMetrics;
      process: {
        pid: number;
        uptime: number;
        cpuUsage: NodeJS.CpuUsage;
      };
    }> = {
      success: true,
      data: {
        memory: {
          ...memoryInfo,
          arrayBuffersMB: Math.round(memoryUsage.arrayBuffers / 1024 / 1024 * 100) / 100,
          nodeHeapSizeLimit: Math.round((v8.getHeapStatistics().heap_size_limit || 0) / 1024 / 1024),
        },
        errorRates: performanceMetrics.errorRates,
        circuitBreakers: performanceMetrics.circuitBreakers,
        redisPool: poolMetrics,
        process: {
          pid: process.pid,
          uptime: getUptime(),
          cpuUsage: process.cpuUsage(),
        },
      },
      meta: {
        timestamp: timestamp(),
        requestId: request.id || generateRequestId(),
      },
    };

    return reply.status(200).send(response);
  });

  /**
   * GET /health/agent - Agent system health check
   * Returns aggregated health status of agent registry, workflow engine, and template service
   */
  app.get('/health/agent', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check Redis first - agent system requires Redis
    const redisCheck = await redisHealthCheck();

    if (!redisCheck.healthy) {
      const response: ApiResponse<{
        status: 'unhealthy';
        message: string;
        redis: { status: 'down'; error?: string };
      }> = {
        success: false,
        data: {
          status: 'unhealthy',
          message: 'Agent system unavailable: Redis connection required',
          redis: {
            status: 'down',
            error: redisCheck.error,
          },
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      return reply.status(503).send(response);
    }

    try {
      // Fetch all agent system health information
      const registryStats = await getRegistryStats();
      const engineStats = await getEngineStats();

      // Check template service availability
      let templateServiceAvailable = true;
      let templateServiceError: string | undefined;
      let templateCount = 0;
      try {
        const templates = await listTemplates({ page: 1, pageSize: 1 });
        templateCount = templates.total;
      } catch (error) {
        templateServiceAvailable = false;
        templateServiceError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Determine overall health
      const hasErrorAgents = registryStats.byStatus.error > 0;
      const hasOfflineAgents = registryStats.byStatus.offline > 0;
      const queueNearCapacity = engineStats.queuedWorkflows > engineStats.maxConcurrent * 2;

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      const issues: string[] = [];

      if (!templateServiceAvailable) {
        overallStatus = 'unhealthy';
        issues.push('Template service unavailable');
      }

      if (hasErrorAgents) {
        overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
        issues.push(`${registryStats.byStatus.error} agent(s) in error state`);
      }

      if (hasOfflineAgents) {
        overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
        issues.push(`${registryStats.byStatus.offline} agent(s) offline`);
      }

      if (queueNearCapacity) {
        overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
        issues.push('Workflow queue near capacity');
      }

      const response: ApiResponse<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        issues: string[];
        registry: {
          status: 'up';
          totalAgents: number;
          byType: Record<AgentType, number>;
          byStatus: Record<AgentStatus, number>;
        };
        workflowEngine: {
          status: 'up';
          activeWorkflows: number;
          queuedWorkflows: number;
          maxConcurrent: number;
          queueUtilization: number;
        };
        templateService: {
          status: 'up' | 'down';
          available: boolean;
          templateCount: number;
          error?: string;
        };
      }> = {
        success: overallStatus === 'healthy',
        data: {
          status: overallStatus,
          issues,
          registry: {
            status: 'up',
            totalAgents: registryStats.totalAgents,
            byType: registryStats.byType,
            byStatus: registryStats.byStatus,
          },
          workflowEngine: {
            status: 'up',
            activeWorkflows: engineStats.activeWorkflows,
            queuedWorkflows: engineStats.queuedWorkflows,
            maxConcurrent: engineStats.maxConcurrent,
            queueUtilization: engineStats.maxConcurrent > 0
              ? Math.round((engineStats.activeWorkflows / engineStats.maxConcurrent) * 100)
              : 0,
          },
          templateService: {
            status: templateServiceAvailable ? 'up' : 'down',
            available: templateServiceAvailable,
            templateCount,
            error: templateServiceError,
          },
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      return reply.status(statusCode).send(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const response: ApiResponse<{
        status: 'unhealthy';
        message: string;
        error: string;
      }> = {
        success: false,
        data: {
          status: 'unhealthy',
          message: 'Failed to check agent system health',
          error: errorMessage,
        },
        meta: {
          timestamp: timestamp(),
          requestId: request.id || generateRequestId(),
        },
      };

      return reply.status(503).send(response);
    }
  });
}

export default registerHealthRoutes;
