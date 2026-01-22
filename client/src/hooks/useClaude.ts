import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claudeService } from '@/services/claude.service';
import type { ClaudeOptions, PaginationParams } from '@/types';

export function useClaude() {
  const queryClient = useQueryClient();

  // Query for processes list
  const processesQuery = useQuery({
    queryKey: ['claude', 'processes'],
    queryFn: () => claudeService.listProcesses({ limit: 20 }),
    refetchInterval: 5000, // Poll every 5 seconds for updates
  });

  // Query for metrics
  const metricsQuery = useQuery({
    queryKey: ['claude', 'metrics'],
    queryFn: claudeService.getMetrics,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Query for health
  const healthQuery = useQuery({
    queryKey: ['claude', 'health'],
    queryFn: claudeService.getHealth,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Execute command mutation (synchronous)
  const executeCommandMutation = useMutation({
    mutationFn: ({
      command,
      options,
    }: {
      command: string;
      options?: ClaudeOptions;
    }) => claudeService.executeCommand(command, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude', 'processes'] });
      queryClient.invalidateQueries({ queryKey: ['claude', 'metrics'] });
    },
  });

  // Execute async mutation
  const executeAsyncMutation = useMutation({
    mutationFn: ({
      command,
      options,
    }: {
      command: string;
      options?: ClaudeOptions;
    }) => claudeService.executeAsync(command, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude', 'processes'] });
    },
  });

  // Elaborate prompt mutation (step 1 of two-step music generation)
  const elaboratePromptMutation = useMutation({
    mutationFn: ({
      prompt,
      options,
    }: {
      prompt: string;
      options?: ClaudeOptions;
    }) => claudeService.elaboratePrompt(prompt, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude', 'processes'] });
    },
  });

  // Cancel process mutation
  const cancelProcessMutation = useMutation({
    mutationFn: (processId: string) => claudeService.cancelProcess(processId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude', 'processes'] });
      queryClient.invalidateQueries({ queryKey: ['claude', 'metrics'] });
    },
  });

  // Retry process mutation
  const retryProcessMutation = useMutation({
    mutationFn: (processId: string) => claudeService.retryProcess(processId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude', 'processes'] });
    },
  });

  return {
    // Queries
    processes: processesQuery.data?.data ?? [],
    pagination: processesQuery.data?.pagination,
    metrics: metricsQuery.data,
    health: healthQuery.data,
    isProcessesLoading: processesQuery.isLoading,
    isMetricsLoading: metricsQuery.isLoading,
    isHealthLoading: healthQuery.isLoading,

    // Mutations
    executeCommand: executeCommandMutation.mutate,
    executeAsync: executeAsyncMutation.mutate,
    elaboratePrompt: elaboratePromptMutation.mutate,
    elaboratePromptAsync: elaboratePromptMutation.mutateAsync,
    cancelProcess: cancelProcessMutation.mutate,
    retryProcess: retryProcessMutation.mutate,

    // Mutation states
    isExecuting: executeCommandMutation.isPending || executeAsyncMutation.isPending,
    isElaborating: elaboratePromptMutation.isPending,
    isCancelling: cancelProcessMutation.isPending,
    isRetrying: retryProcessMutation.isPending,
    executeError: executeCommandMutation.error || executeAsyncMutation.error,
    elaborateError: elaboratePromptMutation.error,
    executeResult: executeCommandMutation.data || executeAsyncMutation.data,
    elaborateResult: elaboratePromptMutation.data,

    // Query refetch
    refetchProcesses: processesQuery.refetch,
    refetchMetrics: metricsQuery.refetch,
    refetchHealth: healthQuery.refetch,
  };
}

// Hook for getting a single process
export function useClaudeProcess(processId: string) {
  return useQuery({
    queryKey: ['claude', 'process', processId],
    queryFn: () => claudeService.getProcessStatus(processId),
    enabled: !!processId,
    refetchInterval: (query) => {
      // Stop polling if process is complete
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return false;
      }
      return 2000; // Poll every 2 seconds while running
    },
  });
}

// Hook for process history
export function useClaudeHistory(params?: PaginationParams) {
  return useQuery({
    queryKey: ['claude', 'history', params],
    queryFn: () => claudeService.getHistory(params),
  });
}

export default useClaude;
