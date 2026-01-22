import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentService, type RegisterAgentData } from '@/services/agent.service';
import { useSocketEvent } from '@/hooks/useSocket';
import type { WorkflowOptions, PaginationParams } from '@/types';
import type {
  DiscussionRound,
  DiscussionContribution,
  DiscussionResult,
  DiscussionConfig,
  CritiqueIteration,
  SelfCritiqueResult,
  AgentDiscussionRoundStartedPayload,
  AgentDiscussionContributionPayload,
  AgentDiscussionRoundCompletedPayload,
  AgentDiscussionConvergedPayload,
  AgentDiscussionCompletedPayload,
  AgentCritiqueIterationPayload,
  AgentCritiqueConvergedPayload,
  AgentCritiqueCompletedPayload,
  AgentErrorPayload,
} from '@backend/types/agent.types';

export function useAgents() {
  const queryClient = useQueryClient();

  // Query for agents list
  const agentsQuery = useQuery({
    queryKey: ['agents', 'registry'],
    queryFn: () => agentService.listAgents({ limit: 50 }),
  });

  // Query for workflows list
  const workflowsQuery = useQuery({
    queryKey: ['agents', 'workflows'],
    queryFn: () => agentService.listWorkflows({ limit: 20 }),
    refetchInterval: 5000,
  });

  // Query for metrics
  const metricsQuery = useQuery({
    queryKey: ['agents', 'metrics'],
    queryFn: agentService.getMetrics,
    refetchInterval: 10000,
  });

  // Query for health
  const healthQuery = useQuery({
    queryKey: ['agents', 'health'],
    queryFn: agentService.getHealth,
    refetchInterval: 30000,
  });

  // Register agent mutation
  const registerAgentMutation = useMutation({
    mutationFn: (data: RegisterAgentData) => agentService.registerAgent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'registry'] });
    },
  });

  // Update agent mutation
  const updateAgentMutation = useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: Partial<RegisterAgentData>;
    }) => agentService.updateAgent(agentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'registry'] });
    },
  });

  // Unregister agent mutation
  const unregisterAgentMutation = useMutation({
    mutationFn: (agentId: string) => agentService.unregisterAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'registry'] });
    },
  });

  // Execute agent mutation
  const executeAgentMutation = useMutation({
    mutationFn: ({
      agentId,
      input,
      options,
    }: {
      agentId: string;
      input: unknown;
      options?: { timeout?: number };
    }) => agentService.executeAgent({ agentId, input, options }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  // Execute workflow mutation
  const executeWorkflowMutation = useMutation({
    mutationFn: ({
      type,
      agents,
      input,
      options,
    }: {
      type: 'sequential' | 'parallel' | 'self-critique' | 'discussion';
      agents: string[];
      input: unknown;
      options?: WorkflowOptions;
    }) =>
      agentService.executeWorkflow({ workflowId: '', type, agents, input, options }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  // Cancel workflow mutation
  const cancelWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => agentService.cancelWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
      queryClient.invalidateQueries({ queryKey: ['agents', 'metrics'] });
    },
  });

  // Pause workflow mutation
  const pauseWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => agentService.pauseWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  // Resume workflow mutation
  const resumeWorkflowMutation = useMutation({
    mutationFn: (workflowId: string) => agentService.resumeWorkflow(workflowId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  // Orchestration mutations
  const orchestrateSequentialMutation = useMutation({
    mutationFn: ({
      agents,
      input,
      options,
    }: {
      agents: string[];
      input: unknown;
      options?: WorkflowOptions;
    }) => agentService.orchestrateSequential(agents, input, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  const orchestrateParallelMutation = useMutation({
    mutationFn: ({
      agents,
      input,
      options,
    }: {
      agents: string[];
      input: unknown;
      options?: WorkflowOptions;
    }) => agentService.orchestrateParallel(agents, input, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  const orchestrateSelfCritiqueMutation = useMutation({
    mutationFn: ({
      agentId,
      input,
      options,
    }: {
      agentId: string;
      input: unknown;
      options?: WorkflowOptions & { maxIterations?: number };
    }) => agentService.orchestrateSelfCritique(agentId, input, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  const orchestrateDiscussionMutation = useMutation({
    mutationFn: ({
      agents,
      topic,
      options,
      config,
    }: {
      agents: string[];
      topic: string;
      options?: WorkflowOptions & { maxRounds?: number };
      config?: DiscussionConfig;
    }) => agentService.orchestrateDiscussion(agents, topic, options, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', 'workflows'] });
    },
  });

  return {
    // Queries
    agents: agentsQuery.data?.data ?? [],
    workflows: workflowsQuery.data?.data ?? [],
    metrics: metricsQuery.data,
    health: healthQuery.data,
    isAgentsLoading: agentsQuery.isLoading,
    isWorkflowsLoading: workflowsQuery.isLoading,
    isMetricsLoading: metricsQuery.isLoading,
    isHealthLoading: healthQuery.isLoading,

    // Agent mutations
    registerAgent: registerAgentMutation.mutate,
    updateAgent: updateAgentMutation.mutate,
    unregisterAgent: unregisterAgentMutation.mutate,
    executeAgent: executeAgentMutation.mutate,

    // Workflow mutations
    executeWorkflow: executeWorkflowMutation.mutate,
    cancelWorkflow: cancelWorkflowMutation.mutate,
    pauseWorkflow: pauseWorkflowMutation.mutate,
    resumeWorkflow: resumeWorkflowMutation.mutate,

    // Orchestration mutations
    orchestrateSequential: orchestrateSequentialMutation.mutate,
    orchestrateParallel: orchestrateParallelMutation.mutate,
    orchestrateSelfCritique: orchestrateSelfCritiqueMutation.mutate,
    orchestrateDiscussion: orchestrateDiscussionMutation.mutate,

    // Mutation states
    isRegistering: registerAgentMutation.isPending,
    isUpdating: updateAgentMutation.isPending,
    isUnregistering: unregisterAgentMutation.isPending,
    isExecutingAgent: executeAgentMutation.isPending,
    isExecutingWorkflow:
      executeWorkflowMutation.isPending ||
      orchestrateSequentialMutation.isPending ||
      orchestrateParallelMutation.isPending ||
      orchestrateSelfCritiqueMutation.isPending ||
      orchestrateDiscussionMutation.isPending,
    isCancelling: cancelWorkflowMutation.isPending,
    isPausing: pauseWorkflowMutation.isPending,
    isResuming: resumeWorkflowMutation.isPending,

    // Query refetch
    refetchAgents: agentsQuery.refetch,
    refetchWorkflows: workflowsQuery.refetch,
    refetchMetrics: metricsQuery.refetch,
    refetchHealth: healthQuery.refetch,
  };
}

// Hook for getting a single agent
export function useAgent(agentId: string) {
  return useQuery({
    queryKey: ['agents', 'registry', agentId],
    queryFn: () => agentService.getAgent(agentId),
    enabled: !!agentId,
  });
}

// Hook for getting a single workflow
export function useWorkflow(workflowId: string) {
  return useQuery({
    queryKey: ['agents', 'workflow', workflowId],
    queryFn: () => agentService.getWorkflowStatus(workflowId),
    enabled: !!workflowId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (
        status === 'completed' ||
        status === 'failed' ||
        status === 'cancelled'
      ) {
        return false;
      }
      return 2000;
    },
  });
}

// Hook for workflow history
export function useWorkflowHistory(params?: PaginationParams & { status?: string; type?: string }) {
  return useQuery({
    queryKey: ['agents', 'workflows', 'history', params],
    queryFn: () => agentService.listWorkflows(params),
  });
}

// ============================================================================
// Discussion Stream Hook
// ============================================================================

export type DiscussionStreamStatus = 'idle' | 'running' | 'converged' | 'completed' | 'error';

export interface DiscussionStreamState {
  status: DiscussionStreamStatus;
  rounds: DiscussionRound[];
  currentRound: number;
  participantCount: number;
  currentContributions: DiscussionContribution[];
  consensusScore: number | null;
  converged: boolean;
  result: DiscussionResult | null;
  error: string | null;
}

/**
 * Hook for subscribing to real-time discussion WebSocket events
 */
export function useDiscussionStream(executionId: string | null) {
  const [state, setState] = useState<DiscussionStreamState>({
    status: 'idle',
    rounds: [],
    currentRound: 0,
    participantCount: 0,
    currentContributions: [],
    consensusScore: null,
    converged: false,
    result: null,
    error: null,
  });

  // Reset state when executionId changes
  useEffect(() => {
    setState({
      status: 'idle',
      rounds: [],
      currentRound: 0,
      participantCount: 0,
      currentContributions: [],
      consensusScore: null,
      converged: false,
      result: null,
      error: null,
    });
  }, [executionId]);

  // Subscribe to round started event
  useSocketEvent<AgentDiscussionRoundStartedPayload>(
    'agent:discussion:round-started',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => ({
          ...prev,
          status: 'running',
          currentRound: data.round,
          participantCount: data.participantCount,
          currentContributions: [],
        }));
      }
    },
    [executionId]
  );

  // Subscribe to contribution event
  useSocketEvent<AgentDiscussionContributionPayload>(
    'agent:discussion:contribution',
    (data) => {
      if (data.executionId === executionId) {
        const contribution: DiscussionContribution = {
          participantId: data.participantId,
          role: data.role,
          content: data.content,
          timestamp: data.timestamp,
        };
        setState((prev) => ({
          ...prev,
          currentContributions: [...prev.currentContributions, contribution],
        }));
      }
    },
    [executionId]
  );

  // Subscribe to round completed event
  useSocketEvent<AgentDiscussionRoundCompletedPayload>(
    'agent:discussion:round-completed',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => {
          const completedRound: DiscussionRound = {
            round: data.round,
            contributions: prev.currentContributions,
            synthesis: data.synthesis,
            consensusScore: data.consensusScore,
            durationMs: 0, // Will be updated from final result
            timestamp: data.timestamp,
          };
          return {
            ...prev,
            rounds: [...prev.rounds, completedRound],
            currentContributions: [],
            consensusScore: data.consensusScore,
          };
        });
      }
    },
    [executionId]
  );

  // Subscribe to converged event
  useSocketEvent<AgentDiscussionConvergedPayload>(
    'agent:discussion:converged',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => ({
          ...prev,
          status: 'converged',
          converged: true,
          consensusScore: data.consensusScore,
        }));
      }
    },
    [executionId]
  );

  // Subscribe to completed event
  useSocketEvent<AgentDiscussionCompletedPayload>(
    'agent:discussion:completed',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => ({
          ...prev,
          status: 'completed',
          result: data.result,
          rounds: data.result.rounds,
          consensusScore: data.result.consensusScore,
          converged: data.result.converged,
        }));
      }
    },
    [executionId]
  );

  // Subscribe to error event
  useSocketEvent<AgentErrorPayload>(
    'agent:discussion:error',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: data.message,
        }));
      }
    },
    [executionId]
  );

  return {
    ...state,
    isRunning: state.status === 'running',
    isCompleted: state.status === 'completed',
    isConverged: state.converged,
    hasError: state.status === 'error',
  };
}

// ============================================================================
// Self-Critique Stream Hook
// ============================================================================

export type SelfCritiqueStreamStatus = 'idle' | 'running' | 'converged' | 'completed' | 'error';

export interface SelfCritiqueStreamState {
  status: SelfCritiqueStreamStatus;
  iterations: CritiqueIteration[];
  currentIteration: number;
  currentScore: number | null;
  criteriaScores: Record<string, number>;
  feedback: string | null;
  converged: boolean;
  result: SelfCritiqueResult | null;
  error: string | null;
}

/**
 * Hook for subscribing to real-time self-critique WebSocket events
 */
export function useSelfCritiqueStream(executionId: string | null) {
  const [state, setState] = useState<SelfCritiqueStreamState>({
    status: 'idle',
    iterations: [],
    currentIteration: 0,
    currentScore: null,
    criteriaScores: {},
    feedback: null,
    converged: false,
    result: null,
    error: null,
  });

  // Reset state when executionId changes
  useEffect(() => {
    setState({
      status: 'idle',
      iterations: [],
      currentIteration: 0,
      currentScore: null,
      criteriaScores: {},
      feedback: null,
      converged: false,
      result: null,
      error: null,
    });
  }, [executionId]);

  // Subscribe to iteration event
  useSocketEvent<AgentCritiqueIterationPayload>(
    'agent:critique:iteration',
    (data) => {
      if (data.executionId === executionId) {
        const iteration: CritiqueIteration = {
          iteration: data.iteration,
          output: null, // Output comes in completed event
          critique: {
            overallScore: data.scores.overall,
            criteriaScores: data.scores.criteria,
            feedback: data.feedback,
            meetsThreshold: data.meetsThreshold,
          },
          durationMs: 0,
          timestamp: data.timestamp,
        };
        setState((prev) => ({
          ...prev,
          status: 'running',
          currentIteration: data.iteration,
          currentScore: data.scores.overall,
          criteriaScores: data.scores.criteria,
          feedback: data.feedback,
          iterations: [...prev.iterations, iteration],
        }));
      }
    },
    [executionId]
  );

  // Subscribe to converged event
  useSocketEvent<AgentCritiqueConvergedPayload>(
    'agent:critique:converged',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => ({
          ...prev,
          status: 'converged',
          converged: true,
          currentScore: data.finalScore,
        }));
      }
    },
    [executionId]
  );

  // Subscribe to completed event
  useSocketEvent<AgentCritiqueCompletedPayload>(
    'agent:critique:completed',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => ({
          ...prev,
          status: 'completed',
          result: data.result,
          iterations: data.result.iterations,
          currentScore: data.result.finalScore,
          converged: data.result.converged,
        }));
      }
    },
    [executionId]
  );

  // Subscribe to error event
  useSocketEvent<AgentErrorPayload>(
    'agent:critique:error',
    (data) => {
      if (data.executionId === executionId) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: data.message,
        }));
      }
    },
    [executionId]
  );

  return {
    ...state,
    isRunning: state.status === 'running',
    isCompleted: state.status === 'completed',
    isConverged: state.converged,
    hasError: state.status === 'error',
  };
}

export default useAgents;
