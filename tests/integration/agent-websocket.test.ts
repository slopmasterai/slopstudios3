/**
 * Agent Orchestration WebSocket Integration Tests
 * End-to-end tests for Agent WebSocket handlers
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable import/order */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-floating-promises */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Create mock event emitters
const mockWorkflowEmitter = new EventEmitter();

// Mock the services before importing anything else
jest.mock('../../src/services/workflow-engine.service.js', () => ({
  executeWorkflow: jest.fn(),
  cancelWorkflow: jest.fn(),
  pauseWorkflow: jest.fn(),
  resumeWorkflow: jest.fn(),
  getWorkflowStatus: jest.fn(),
  getWorkflowEmitter: jest.fn(() => mockWorkflowEmitter),
}));

jest.mock('../../src/services/orchestration.service.js', () => ({
  orchestrate: jest.fn(),
}));

jest.mock('../../src/services/agent-registry.service.js', () => ({
  getAgent: jest.fn(),
  listAgents: jest.fn(),
  executeAgent: jest.fn(),
}));

jest.mock('../../src/services/prompt-template.service.js', () => ({
  getTemplate: jest.fn(),
  interpolateTemplate: jest.fn(),
}));

jest.mock('../../src/services/agent-metrics.service.js', () => ({
  recordWorkflowMetric: jest.fn(),
  recordStepMetric: jest.fn(),
  recordCritiqueMetric: jest.fn(),
  recordDiscussionMetric: jest.fn(),
}));

// Create mock event emitters for critique and discussion services
const mockCritiqueEmitter = new EventEmitter();
const mockDiscussionEmitter = new EventEmitter();

jest.mock('../../src/services/self-critique.service.js', () => ({
  executeSelfCritique: jest.fn(),
  critiqueEvents: mockCritiqueEmitter,
}));

jest.mock('../../src/services/discussion.service.js', () => ({
  executeDiscussion: jest.fn(),
  discussionEvents: mockDiscussionEmitter,
}));

// Mock Redis
jest.mock('../../src/services/redis.service.js', () => {
  const mockRedis = {
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    hset: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  };

  return {
    getRedisClient: jest.fn(() => mockRedis),
    isRedisConnected: jest.fn(() => true),
  };
});

// Mock utils
jest.mock('../../src/utils/index.js', () => ({
  generateRequestId: jest.fn(() => 'test-request-id'),
}));

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server as HttpServer } from 'http';

import {
  executeWorkflow,
  cancelWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  getWorkflowStatus,
} from '../../src/services/workflow-engine.service.js';
import { orchestrate } from '../../src/services/orchestration.service.js';
import {
  executeSelfCritique,
  critiqueEvents,
} from '../../src/services/self-critique.service.js';
import {
  executeDiscussion,
  discussionEvents,
} from '../../src/services/discussion.service.js';

describe('Agent WebSocket Integration Tests', () => {
  let httpServer: HttpServer;
  let io: Server;
  let clientSocket: ClientSocket;
  const PORT = 3099;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Set up connection handler
    io.on('connection', async (socket) => {
      // Mock authenticated user data on socket.data
      (socket as any).data = {
        authenticated: true,
        userId: 'test-user-id',
        requestId: 'test-request-id',
      };

      // Import and register handler
      const { registerAgentHandler } = await import(
        '../../src/websocket/handlers/agent.handler.js'
      );
      registerAgentHandler(socket as any);
    });

    httpServer.listen(PORT, () => {
      clientSocket = ioClient(`http://localhost:${PORT}`, {
        transports: ['websocket'],
        autoConnect: true,
      });

      clientSocket.on('connect', () => {
        done();
      });
    });
  });

  afterAll((done) => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    io.close();
    httpServer.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('agent:workflow:execute', () => {
    it('should execute a workflow and return result', (done) => {
      (executeWorkflow as jest.Mock).mockResolvedValue({
        id: 'execution-123',
        workflowId: 'workflow-123',
        status: 'queued',
        queuePosition: 1,
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:execute',
        {
          workflow: {
            id: 'workflow-123',
            name: 'Test Workflow',
            steps: [
              {
                id: 'step-1',
                name: 'Step 1',
                agentType: 'claude',
                prompt: 'Test prompt',
                inputs: [],
                outputs: ['result'],
                dependencies: [],
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(true);
          expect(response.executionId).toBe('execution-123');
          expect(response.status).toBe('queued');
          done();
        }
      );
    });

    it('should return error for invalid workflow - missing workflow', (done) => {
      clientSocket.emit('agent:workflow:execute', {}, (response: any) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('workflow');
        done();
      });
    });

    it('should return error for invalid workflow - missing steps', (done) => {
      clientSocket.emit(
        'agent:workflow:execute',
        {
          workflow: {
            id: 'invalid-workflow',
            name: 'Invalid',
            steps: [],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('steps');
          done();
        }
      );
    });

    it('should handle execution errors', (done) => {
      (executeWorkflow as jest.Mock).mockRejectedValue(new Error('Execution failed'));

      clientSocket.emit(
        'agent:workflow:execute',
        {
          workflow: {
            id: 'workflow-error',
            name: 'Error Workflow',
            steps: [
              {
                id: 'step-1',
                name: 'Step',
                agentType: 'claude',
                prompt: 'Test',
                inputs: [],
                outputs: [],
                dependencies: [],
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('failed');
          done();
        }
      );
    });
  });

  describe('agent:workflow:status', () => {
    it('should return workflow status', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'execution-123',
        workflowId: 'workflow-123',
        status: 'running',
        userId: 'test-user-id',
        steps: {
          'step-1': { status: 'completed', result: { data: 'result' } },
          'step-2': { status: 'running' },
        },
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:status',
        { executionId: 'execution-123' },
        (response: any) => {
          expect(response.success).toBe(true);
          expect(response.status.status).toBe('running');
          expect(response.status.id).toBe('execution-123');
          done();
        }
      );
    });

    it('should return error for non-existent workflow', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue(null);

      clientSocket.emit(
        'agent:workflow:status',
        { executionId: 'non-existent' },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('not found');
          done();
        }
      );
    });

    it('should return error for missing executionId', (done) => {
      clientSocket.emit('agent:workflow:status', {}, (response: any) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('required');
        done();
      });
    });
  });

  describe('agent:workflow:cancel', () => {
    it('should cancel a running workflow', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'execution-123',
        workflowId: 'workflow-123',
        status: 'running',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });
      (cancelWorkflow as jest.Mock).mockResolvedValue(true);

      clientSocket.emit(
        'agent:workflow:cancel',
        { executionId: 'execution-123' },
        (response: any) => {
          expect(response.success).toBe(true);
          expect(response.cancelled).toBe(true);
          done();
        }
      );
    });

    it('should return error when cancel fails', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'execution-456',
        workflowId: 'workflow-456',
        status: 'running',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });
      (cancelWorkflow as jest.Mock).mockResolvedValue(false);

      clientSocket.emit(
        'agent:workflow:cancel',
        { executionId: 'execution-456' },
        (response: any) => {
          expect(response.success).toBe(false);
          done();
        }
      );
    });

    it('should return error for workflow not found', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue(null);

      clientSocket.emit(
        'agent:workflow:cancel',
        { executionId: 'non-existent' },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('not found');
          done();
        }
      );
    });
  });

  describe('agent:workflow:pause', () => {
    it('should pause a running workflow', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'execution-123',
        workflowId: 'workflow-123',
        status: 'running',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });
      (pauseWorkflow as jest.Mock).mockResolvedValue(true);

      clientSocket.emit(
        'agent:workflow:pause',
        { executionId: 'execution-123' },
        (response: any) => {
          expect(response.success).toBe(true);
          done();
        }
      );
    });

    it('should return error when pause fails', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'completed-execution',
        workflowId: 'completed-workflow',
        status: 'completed',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });
      (pauseWorkflow as jest.Mock).mockResolvedValue(false);

      clientSocket.emit(
        'agent:workflow:pause',
        { executionId: 'completed-execution' },
        (response: any) => {
          expect(response.success).toBe(false);
          done();
        }
      );
    });
  });

  describe('agent:workflow:resume', () => {
    it('should resume a paused workflow', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'paused-execution',
        workflowId: 'paused-workflow',
        status: 'paused',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });
      (resumeWorkflow as jest.Mock).mockResolvedValue(true);

      clientSocket.emit(
        'agent:workflow:resume',
        { executionId: 'paused-execution' },
        (response: any) => {
          expect(response.success).toBe(true);
          done();
        }
      );
    });

    it('should return error when resume fails', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'running-execution',
        workflowId: 'running-workflow',
        status: 'running',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });
      (resumeWorkflow as jest.Mock).mockResolvedValue(false);

      clientSocket.emit(
        'agent:workflow:resume',
        { executionId: 'running-execution' },
        (response: any) => {
          expect(response.success).toBe(false);
          done();
        }
      );
    });
  });

  describe('agent:orchestrate', () => {
    it('should orchestrate with sequential pattern', (done) => {
      (orchestrate as jest.Mock).mockResolvedValue({
        id: 'orch-123',
        status: 'completed',
        taskResults: [
          { taskId: 'task-1', status: 'completed', result: { step: 1 } },
          { taskId: 'task-2', status: 'completed', result: { step: 2 } },
        ],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:orchestrate',
        {
          request: {
            pattern: 'sequential',
            tasks: [
              { id: 'task-1', agentType: 'claude', prompt: 'Task 1', inputs: {} },
              { id: 'task-2', agentType: 'claude', prompt: 'Task 2', inputs: {} },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(true);
          expect(response.result.taskResults).toHaveLength(2);
          done();
        }
      );
    });

    it('should orchestrate with parallel pattern', (done) => {
      (orchestrate as jest.Mock).mockResolvedValue({
        id: 'orch-456',
        status: 'completed',
        taskResults: [
          { taskId: 'task-a', status: 'completed', result: { task: 'a' } },
          { taskId: 'task-b', status: 'completed', result: { task: 'b' } },
        ],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:orchestrate',
        {
          request: {
            pattern: 'parallel',
            tasks: [
              { id: 'task-a', agentType: 'claude', prompt: 'Task A', inputs: {} },
              { id: 'task-b', agentType: 'claude', prompt: 'Task B', inputs: {} },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(true);
          done();
        }
      );
    });

    it('should handle orchestration errors', (done) => {
      (orchestrate as jest.Mock).mockRejectedValue(new Error('Orchestration failed'));

      clientSocket.emit(
        'agent:orchestrate',
        {
          request: {
            pattern: 'sequential',
            tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Task', inputs: {} }],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toBeDefined();
          done();
        }
      );
    });

    it('should return error for missing request', (done) => {
      clientSocket.emit(
        'agent:orchestrate',
        {},
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('request');
          done();
        }
      );
    });

    it('should return error for invalid pattern', (done) => {
      clientSocket.emit(
        'agent:orchestrate',
        {
          request: {
            pattern: 'invalid-pattern',
            tasks: [{ id: 'task-1', agentType: 'claude', prompt: 'Task', inputs: {} }],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('pattern');
          done();
        }
      );
    });

    it('should return error for empty tasks', (done) => {
      clientSocket.emit(
        'agent:orchestrate',
        {
          request: {
            pattern: 'sequential',
            tasks: [],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('tasks');
          done();
        }
      );
    });
  });

  describe('workflow events', () => {
    it('should emit workflow:started event via workflow emitter', (done) => {
      clientSocket.once('agent:workflow:started', (data: any) => {
        expect(data.executionId).toBeDefined();
        expect(data.workflowId).toBe('workflow-event-1');
        done();
      });

      // First execute a workflow to set up subscription
      (executeWorkflow as jest.Mock).mockResolvedValue({
        id: 'execution-event-1',
        workflowId: 'workflow-event-1',
        status: 'queued',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:execute',
        {
          workflow: {
            id: 'workflow-event-1',
            name: 'Test Workflow',
            steps: [
              {
                id: 'step-1',
                name: 'Step 1',
                agentType: 'claude',
                prompt: 'Test',
                inputs: [],
                outputs: [],
                dependencies: [],
              },
            ],
          },
        },
        () => {
          // After subscription is set up, emit the event
          setTimeout(() => {
            mockWorkflowEmitter.emit('workflow', {
              type: 'started',
              executionId: 'execution-event-1',
              workflowId: 'workflow-event-1',
              totalSteps: 1,
              timestamp: new Date().toISOString(),
            });
          }, 100);
        }
      );
    });

    it('should emit workflow:step:completed event', (done) => {
      clientSocket.once('agent:workflow:step:completed', (data: any) => {
        expect(data.executionId).toBe('execution-event-2');
        expect(data.stepId).toBe('step-1');
        done();
      });

      // Execute workflow to set up subscription
      (executeWorkflow as jest.Mock).mockResolvedValue({
        id: 'execution-event-2',
        workflowId: 'workflow-event-2',
        status: 'queued',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:execute',
        {
          workflow: {
            id: 'workflow-event-2',
            name: 'Test Workflow',
            steps: [
              {
                id: 'step-1',
                name: 'Step 1',
                agentType: 'claude',
                prompt: 'Test',
                inputs: [],
                outputs: [],
                dependencies: [],
              },
            ],
          },
        },
        () => {
          setTimeout(() => {
            mockWorkflowEmitter.emit('workflow', {
              type: 'step:completed',
              executionId: 'execution-event-2',
              stepId: 'step-1',
              result: { completed: true },
              durationMs: 1000,
              timestamp: new Date().toISOString(),
            });
          }, 100);
        }
      );
    });

    it('should emit workflow:completed event', (done) => {
      clientSocket.once('agent:workflow:completed', (data: any) => {
        expect(data.executionId).toBe('execution-event-3');
        done();
      });

      (executeWorkflow as jest.Mock).mockResolvedValue({
        id: 'execution-event-3',
        workflowId: 'workflow-event-3',
        status: 'queued',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:execute',
        {
          workflow: {
            id: 'workflow-event-3',
            name: 'Test Workflow',
            steps: [
              {
                id: 'step-1',
                name: 'Step 1',
                agentType: 'claude',
                prompt: 'Test',
                inputs: [],
                outputs: [],
                dependencies: [],
              },
            ],
          },
        },
        () => {
          setTimeout(() => {
            mockWorkflowEmitter.emit('workflow', {
              type: 'completed',
              executionId: 'execution-event-3',
              results: {},
              durationMs: 2000,
              stepResults: {},
              timestamp: new Date().toISOString(),
            });
          }, 100);
        }
      );
    });

    it('should emit workflow:failed event', (done) => {
      clientSocket.once('agent:workflow:failed', (data: any) => {
        expect(data.executionId).toBe('execution-event-4');
        expect(data.error).toBeDefined();
        done();
      });

      (executeWorkflow as jest.Mock).mockResolvedValue({
        id: 'execution-event-4',
        workflowId: 'workflow-event-4',
        status: 'queued',
        userId: 'test-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:execute',
        {
          workflow: {
            id: 'workflow-event-4',
            name: 'Test Workflow',
            steps: [
              {
                id: 'step-1',
                name: 'Step 1',
                agentType: 'claude',
                prompt: 'Test',
                inputs: [],
                outputs: [],
                dependencies: [],
              },
            ],
          },
        },
        () => {
          setTimeout(() => {
            mockWorkflowEmitter.emit('workflow', {
              type: 'failed',
              executionId: 'execution-event-4',
              error: 'Step execution failed',
              failedStepId: 'step-1',
              completedSteps: 0,
              totalSteps: 1,
              timestamp: new Date().toISOString(),
            });
          }, 100);
        }
      );
    });
  });

  describe('error handling', () => {
    it('should handle missing workflow definition', (done) => {
      clientSocket.emit('agent:workflow:execute', {}, (response: any) => {
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        done();
      });
    });

    it('should handle missing executionId for status', (done) => {
      clientSocket.emit('agent:workflow:status', {}, (response: any) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('required');
        done();
      });
    });

    it('should handle missing request for orchestrate', (done) => {
      clientSocket.emit(
        'agent:orchestrate',
        {},
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('request');
          done();
        }
      );
    });

    it('should handle empty tasks for orchestrate', (done) => {
      clientSocket.emit(
        'agent:orchestrate',
        { request: { pattern: 'sequential', tasks: [] } },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('tasks');
          done();
        }
      );
    });
  });

  describe('access control', () => {
    it('should deny access to workflow status for different user', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'execution-other',
        workflowId: 'workflow-other',
        status: 'running',
        userId: 'different-user-id', // Different user
        steps: {},
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:status',
        { executionId: 'execution-other' },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('denied');
          done();
        }
      );
    });

    it('should deny cancel for workflow owned by different user', (done) => {
      (getWorkflowStatus as jest.Mock).mockResolvedValue({
        id: 'execution-other',
        workflowId: 'workflow-other',
        status: 'running',
        userId: 'different-user-id',
        steps: {},
        startedAt: new Date().toISOString(),
      });

      clientSocket.emit(
        'agent:workflow:cancel',
        { executionId: 'execution-other' },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('denied');
          done();
        }
      );
    });
  });

  describe('agent:critique:execute', () => {
    it('should execute self-critique and receive iteration events', (done) => {
      // The handler generates 'test-request-id' (from mocked generateRequestId)
      // and replaces 'req_' with 'critique_', but since 'test-request-id' doesn't
      // contain 'req_', the executionId will be 'test-request-id'
      const expectedExecutionId = 'test-request-id';

      const mockResult = {
        id: expectedExecutionId,
        status: 'completed',
        pattern: 'self-critique',
        taskResults: [],
        iterations: [
          {
            iteration: 1,
            output: 'Initial output',
            critique: {
              overallScore: 0.7,
              criteriaScores: { clarity: 0.7 },
              feedback: 'Needs improvement',
              meetsThreshold: false,
            },
            durationMs: 1000,
            timestamp: new Date().toISOString(),
          },
          {
            iteration: 2,
            output: 'Improved output',
            critique: {
              overallScore: 0.9,
              criteriaScores: { clarity: 0.9 },
              feedback: 'Good quality',
              meetsThreshold: true,
            },
            durationMs: 1000,
            timestamp: new Date().toISOString(),
          },
        ],
        finalOutput: 'Improved output',
        finalScore: 0.9,
        converged: true,
        durationMs: 2000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (executeSelfCritique as jest.Mock).mockImplementation(async () => {
        // Simulate emitting events during execution
        setTimeout(() => {
          mockCritiqueEmitter.emit('agent:critique:iteration', {
            executionId: expectedExecutionId,
            iteration: 1,
            scores: { overall: 0.7, criteria: { clarity: 0.7 } },
            feedback: 'Needs improvement',
            meetsThreshold: false,
            timestamp: new Date().toISOString(),
          });
        }, 50);

        setTimeout(() => {
          mockCritiqueEmitter.emit('agent:critique:iteration', {
            executionId: expectedExecutionId,
            iteration: 2,
            scores: { overall: 0.9, criteria: { clarity: 0.9 } },
            feedback: 'Good quality',
            meetsThreshold: true,
            timestamp: new Date().toISOString(),
          });
        }, 100);

        setTimeout(() => {
          mockCritiqueEmitter.emit('agent:critique:converged', {
            executionId: expectedExecutionId,
            iterations: 2,
            finalScore: 0.9,
            timestamp: new Date().toISOString(),
          });
        }, 150);

        setTimeout(() => {
          mockCritiqueEmitter.emit('agent:critique:completed', {
            executionId: expectedExecutionId,
            result: mockResult,
            timestamp: new Date().toISOString(),
          });
        }, 200);

        return mockResult;
      });

      const receivedEvents: string[] = [];

      clientSocket.on('agent:critique:iteration', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push(`iteration:${data.iteration}`);
        }
      });

      clientSocket.on('agent:critique:converged', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push('converged');
        }
      });

      clientSocket.on('agent:critique:completed', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push('completed');
          // Verify all events were received
          expect(receivedEvents).toContain('iteration:1');
          expect(receivedEvents).toContain('iteration:2');
          expect(receivedEvents).toContain('converged');
          expect(receivedEvents).toContain('completed');
          done();
        }
      });

      clientSocket.emit(
        'agent:critique:execute',
        {
          task: {
            id: 'task-1',
            agentType: 'claude',
            prompt: 'Write a summary',
          },
          config: {
            maxIterations: 3,
            qualityCriteria: [
              {
                name: 'clarity',
                description: 'Clear and concise',
                weight: 1,
                threshold: 0.8,
                evaluationPrompt: 'Evaluate clarity',
              },
            ],
            stopOnQualityThreshold: 0.85,
          },
        },
        (response: any) => {
          expect(response.success).toBe(true);
          expect(response.executionId).toBe(expectedExecutionId);
        }
      );
    });

    it('should handle self-critique execution failure and emit error events', (done) => {
      (executeSelfCritique as jest.Mock).mockRejectedValue(new Error('Critique execution failed'));

      let errorReceived = false;
      let critiqueErrorReceived = false;

      clientSocket.once('agent:error', (data: any) => {
        if (data.code === 'SELF_CRITIQUE_FAILED') {
          errorReceived = true;
          expect(data.message).toContain('failed');
          checkDone();
        }
      });

      clientSocket.once('agent:critique:error', (data: any) => {
        critiqueErrorReceived = true;
        expect(data.error).toContain('failed');
        checkDone();
      });

      function checkDone() {
        if (errorReceived && critiqueErrorReceived) {
          done();
        }
      }

      clientSocket.emit(
        'agent:critique:execute',
        {
          task: {
            id: 'task-fail',
            agentType: 'claude',
            prompt: 'Write something',
          },
          config: {
            maxIterations: 2,
            qualityCriteria: [
              {
                name: 'quality',
                description: 'High quality output',
                weight: 1,
                threshold: 0.8,
                evaluationPrompt: 'Evaluate quality',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('failed');
        }
      );
    });

    it('should handle self-critique failure status and cleanup handlers', (done) => {
      const mockFailedResult = {
        id: 'critique-failed',
        status: 'failed',
        pattern: 'self-critique',
        taskResults: [],
        error: 'Task execution failed',
        iterations: [],
        finalOutput: null,
        finalScore: 0,
        converged: false,
        durationMs: 500,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (executeSelfCritique as jest.Mock).mockResolvedValue(mockFailedResult);

      let errorReceived = false;
      let critiqueErrorReceived = false;

      clientSocket.once('agent:error', (data: any) => {
        if (data.code === 'SELF_CRITIQUE_FAILED') {
          errorReceived = true;
          checkDone();
        }
      });

      clientSocket.once('agent:critique:error', (data: any) => {
        critiqueErrorReceived = true;
        expect(data.error).toBe('Task execution failed');
        checkDone();
      });

      function checkDone() {
        if (errorReceived && critiqueErrorReceived) {
          done();
        }
      }

      clientSocket.emit(
        'agent:critique:execute',
        {
          task: {
            id: 'task-status-fail',
            agentType: 'claude',
            prompt: 'Write something',
          },
          config: {
            maxIterations: 2,
            qualityCriteria: [
              {
                name: 'quality',
                description: 'High quality',
                weight: 1,
                threshold: 0.8,
                evaluationPrompt: 'Evaluate',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toBe('Task execution failed');
        }
      );
    });

    it('should return error for missing task in critique payload', (done) => {
      clientSocket.emit(
        'agent:critique:execute',
        {
          config: {
            maxIterations: 2,
            qualityCriteria: [
              {
                name: 'quality',
                description: 'Quality',
                weight: 1,
                threshold: 0.8,
                evaluationPrompt: 'Evaluate',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('task');
          done();
        }
      );
    });

    it('should return error for missing quality criteria in critique payload', (done) => {
      clientSocket.emit(
        'agent:critique:execute',
        {
          task: {
            id: 'task-1',
            agentType: 'claude',
            prompt: 'Write something',
          },
          config: {
            maxIterations: 2,
            qualityCriteria: [],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('quality criteria');
          done();
        }
      );
    });
  });

  describe('agent:discussion:execute', () => {
    it('should execute discussion and receive round/contribution/converged events', (done) => {
      // The handler generates 'test-request-id' (from mocked generateRequestId)
      // and replaces 'req_' with 'discussion_', but since 'test-request-id' doesn't
      // contain 'req_', the executionId will be 'test-request-id'
      const expectedExecutionId = 'test-request-id';

      const mockResult = {
        id: expectedExecutionId,
        status: 'completed',
        pattern: 'discussion',
        taskResults: [],
        rounds: [
          {
            round: 1,
            contributions: [
              {
                participantId: 'participant_0',
                role: 'analyst',
                content: 'Analysis perspective',
                agreementScore: 0.7,
                timestamp: new Date().toISOString(),
              },
              {
                participantId: 'participant_1',
                role: 'critic',
                content: 'Critical perspective',
                agreementScore: 0.6,
                timestamp: new Date().toISOString(),
              },
            ],
            synthesis: 'Round 1 synthesis',
            consensusScore: 0.65,
            durationMs: 2000,
            timestamp: new Date().toISOString(),
          },
          {
            round: 2,
            contributions: [
              {
                participantId: 'participant_0',
                role: 'analyst',
                content: 'Refined analysis',
                agreementScore: 0.9,
                timestamp: new Date().toISOString(),
              },
              {
                participantId: 'participant_1',
                role: 'critic',
                content: 'Agreed critique',
                agreementScore: 0.88,
                timestamp: new Date().toISOString(),
              },
            ],
            synthesis: 'Final consensus',
            consensusScore: 0.89,
            durationMs: 2000,
            timestamp: new Date().toISOString(),
          },
        ],
        finalConsensus: 'Final consensus',
        consensusScore: 0.89,
        converged: true,
        participantSummaries: {
          participant_0: { contributions: 2, agreementRate: 0.8 },
          participant_1: { contributions: 2, agreementRate: 0.74 },
        },
        durationMs: 4000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (executeDiscussion as jest.Mock).mockImplementation(async () => {
        // Simulate emitting events during execution
        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:round-started', {
            executionId: expectedExecutionId,
            round: 1,
            participantCount: 2,
            timestamp: new Date().toISOString(),
          });
        }, 50);

        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:contribution', {
            executionId: expectedExecutionId,
            round: 1,
            participantId: 'participant_0',
            role: 'analyst',
            content: 'Analysis perspective',
            timestamp: new Date().toISOString(),
          });
        }, 75);

        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:contribution', {
            executionId: expectedExecutionId,
            round: 1,
            participantId: 'participant_1',
            role: 'critic',
            content: 'Critical perspective',
            timestamp: new Date().toISOString(),
          });
        }, 100);

        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:round-completed', {
            executionId: expectedExecutionId,
            round: 1,
            synthesis: 'Round 1 synthesis',
            consensusScore: 0.65,
            timestamp: new Date().toISOString(),
          });
        }, 125);

        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:round-started', {
            executionId: expectedExecutionId,
            round: 2,
            participantCount: 2,
            timestamp: new Date().toISOString(),
          });
        }, 150);

        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:round-completed', {
            executionId: expectedExecutionId,
            round: 2,
            synthesis: 'Final consensus',
            consensusScore: 0.89,
            timestamp: new Date().toISOString(),
          });
        }, 175);

        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:converged', {
            executionId: expectedExecutionId,
            rounds: 2,
            consensusScore: 0.89,
            timestamp: new Date().toISOString(),
          });
        }, 200);

        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:completed', {
            executionId: expectedExecutionId,
            result: mockResult,
            timestamp: new Date().toISOString(),
          });
        }, 225);

        return mockResult;
      });

      const receivedEvents: string[] = [];

      clientSocket.on('agent:discussion:round-started', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push(`round-started:${data.round}`);
        }
      });

      clientSocket.on('agent:discussion:contribution', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push(`contribution:${data.participantId}`);
        }
      });

      clientSocket.on('agent:discussion:round-completed', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push(`round-completed:${data.round}`);
        }
      });

      clientSocket.on('agent:discussion:converged', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push('converged');
        }
      });

      clientSocket.on('agent:discussion:completed', (data: any) => {
        if (data.executionId === expectedExecutionId) {
          receivedEvents.push('completed');
          // Verify all events were received
          expect(receivedEvents).toContain('round-started:1');
          expect(receivedEvents).toContain('contribution:participant_0');
          expect(receivedEvents).toContain('contribution:participant_1');
          expect(receivedEvents).toContain('round-completed:1');
          expect(receivedEvents).toContain('round-started:2');
          expect(receivedEvents).toContain('round-completed:2');
          expect(receivedEvents).toContain('converged');
          expect(receivedEvents).toContain('completed');
          done();
        }
      });

      clientSocket.emit(
        'agent:discussion:execute',
        {
          topic: 'Discuss the best approach to solving the problem',
          config: {
            maxRounds: 5,
            convergenceThreshold: 0.85,
            consensusStrategy: 'majority',
            participants: [
              {
                agentId: 'agent-1',
                role: 'analyst',
                perspective: 'Analytical viewpoint',
              },
              {
                agentId: 'agent-2',
                role: 'critic',
                perspective: 'Critical viewpoint',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(true);
          expect(response.executionId).toBe(expectedExecutionId);
        }
      );
    });

    it('should handle discussion execution failure and emit error events', (done) => {
      (executeDiscussion as jest.Mock).mockRejectedValue(new Error('Discussion execution failed'));

      let errorReceived = false;
      let discussionErrorReceived = false;

      clientSocket.once('agent:error', (data: any) => {
        if (data.code === 'DISCUSSION_FAILED') {
          errorReceived = true;
          expect(data.message).toContain('failed');
          checkDone();
        }
      });

      clientSocket.once('agent:discussion:error', (data: any) => {
        discussionErrorReceived = true;
        expect(data.error).toContain('failed');
        checkDone();
      });

      function checkDone() {
        if (errorReceived && discussionErrorReceived) {
          done();
        }
      }

      clientSocket.emit(
        'agent:discussion:execute',
        {
          topic: 'Discuss failure scenario',
          config: {
            maxRounds: 3,
            convergenceThreshold: 0.85,
            consensusStrategy: 'majority',
            participants: [
              {
                agentId: 'agent-1',
                role: 'participant',
                perspective: 'General',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('failed');
        }
      );
    });

    it('should handle discussion failure status and cleanup handlers', (done) => {
      const mockFailedResult = {
        id: 'discussion-failed',
        status: 'failed',
        pattern: 'discussion',
        taskResults: [],
        error: 'Participant execution failed',
        rounds: [],
        finalConsensus: '',
        consensusScore: 0,
        converged: false,
        participantSummaries: {},
        durationMs: 500,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (executeDiscussion as jest.Mock).mockResolvedValue(mockFailedResult);

      let errorReceived = false;
      let discussionErrorReceived = false;

      clientSocket.once('agent:error', (data: any) => {
        if (data.code === 'DISCUSSION_FAILED') {
          errorReceived = true;
          checkDone();
        }
      });

      clientSocket.once('agent:discussion:error', (data: any) => {
        discussionErrorReceived = true;
        expect(data.error).toBe('Participant execution failed');
        checkDone();
      });

      function checkDone() {
        if (errorReceived && discussionErrorReceived) {
          done();
        }
      }

      clientSocket.emit(
        'agent:discussion:execute',
        {
          topic: 'Discuss status failure',
          config: {
            maxRounds: 3,
            convergenceThreshold: 0.85,
            consensusStrategy: 'majority',
            participants: [
              {
                agentId: 'agent-1',
                role: 'participant',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toBe('Participant execution failed');
        }
      );
    });

    it('should return error for missing topic in discussion payload', (done) => {
      clientSocket.emit(
        'agent:discussion:execute',
        {
          config: {
            maxRounds: 3,
            convergenceThreshold: 0.85,
            consensusStrategy: 'majority',
            participants: [
              {
                agentId: 'agent-1',
                role: 'participant',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('topic');
          done();
        }
      );
    });

    it('should return error for missing participants in discussion payload', (done) => {
      clientSocket.emit(
        'agent:discussion:execute',
        {
          topic: 'Some topic',
          config: {
            maxRounds: 3,
            convergenceThreshold: 0.85,
            consensusStrategy: 'majority',
            participants: [],
          },
        },
        (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('participants');
          done();
        }
      );
    });

    it('should handle callback success for completed discussion', (done) => {
      // The handler generates 'test-request-id' (from mocked generateRequestId)
      const expectedExecutionId = 'test-request-id';

      const mockResult = {
        id: expectedExecutionId,
        status: 'completed',
        pattern: 'discussion',
        taskResults: [],
        rounds: [
          {
            round: 1,
            contributions: [],
            consensusScore: 0.9,
            durationMs: 1000,
            timestamp: new Date().toISOString(),
          },
        ],
        finalConsensus: 'Consensus reached',
        consensusScore: 0.9,
        converged: true,
        participantSummaries: {},
        durationMs: 1000,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      (executeDiscussion as jest.Mock).mockImplementation(async () => {
        setTimeout(() => {
          mockDiscussionEmitter.emit('agent:discussion:completed', {
            executionId: expectedExecutionId,
            result: mockResult,
            timestamp: new Date().toISOString(),
          });
        }, 50);
        return mockResult;
      });

      clientSocket.emit(
        'agent:discussion:execute',
        {
          topic: 'Test callback handling',
          config: {
            maxRounds: 2,
            convergenceThreshold: 0.8,
            consensusStrategy: 'majority',
            participants: [
              {
                agentId: 'agent-1',
                role: 'tester',
              },
            ],
          },
        },
        (response: any) => {
          expect(response.success).toBe(true);
          expect(response.executionId).toBe(expectedExecutionId);
          expect(response.error).toBeUndefined();
          done();
        }
      );
    });
  });
});
