import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { strudelService } from '@/services/strudel.service';
import type { StrudelOptions, PaginationParams } from '@/types';

export function useStrudel() {
  const queryClient = useQueryClient();

  // Query for processes list
  const processesQuery = useQuery({
    queryKey: ['strudel', 'processes'],
    queryFn: () => strudelService.listProcesses({ limit: 20 }),
    refetchInterval: 5000,
  });

  // Query for metrics
  const metricsQuery = useQuery({
    queryKey: ['strudel', 'metrics'],
    queryFn: strudelService.getMetrics,
    refetchInterval: 10000,
  });

  // Query for health
  const healthQuery = useQuery({
    queryKey: ['strudel', 'health'],
    queryFn: strudelService.getHealth,
    refetchInterval: 30000,
  });

  // Query for presets
  const presetsQuery = useQuery({
    queryKey: ['strudel', 'presets'],
    queryFn: strudelService.getPresets,
  });

  // Validate pattern mutation
  const validateMutation = useMutation({
    mutationFn: (code: string) => strudelService.validatePattern(code),
  });

  // Execute pattern mutation (synchronous)
  const executePatternMutation = useMutation({
    mutationFn: ({
      code,
      options,
    }: {
      code: string;
      options?: StrudelOptions;
    }) => strudelService.executePattern(code, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strudel', 'processes'] });
      queryClient.invalidateQueries({ queryKey: ['strudel', 'metrics'] });
    },
  });

  // Execute async mutation
  const executeAsyncMutation = useMutation({
    mutationFn: ({
      code,
      options,
    }: {
      code: string;
      options?: StrudelOptions;
    }) => strudelService.executeAsync(code, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strudel', 'processes'] });
    },
  });

  // Cancel process mutation
  const cancelProcessMutation = useMutation({
    mutationFn: (processId: string) => strudelService.cancelProcess(processId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strudel', 'processes'] });
      queryClient.invalidateQueries({ queryKey: ['strudel', 'metrics'] });
    },
  });

  return {
    // Queries
    processes: processesQuery.data?.data ?? [],
    pagination: processesQuery.data?.pagination,
    metrics: metricsQuery.data,
    health: healthQuery.data,
    presets: presetsQuery.data ?? [],
    isProcessesLoading: processesQuery.isLoading,
    isMetricsLoading: metricsQuery.isLoading,
    isHealthLoading: healthQuery.isLoading,
    isPresetsLoading: presetsQuery.isLoading,

    // Mutations
    validatePattern: validateMutation.mutate,
    executePattern: executePatternMutation.mutate,
    executeAsync: executeAsyncMutation.mutate,
    cancelProcess: cancelProcessMutation.mutate,

    // Mutation states
    validation: validateMutation.data,
    validationError: validateMutation.error,
    isValidating: validateMutation.isPending,
    isExecuting: executePatternMutation.isPending || executeAsyncMutation.isPending,
    isCancelling: cancelProcessMutation.isPending,
    executeError: executePatternMutation.error || executeAsyncMutation.error,
    executeResult: executePatternMutation.data || executeAsyncMutation.data,

    // Reset functions
    resetValidation: validateMutation.reset,

    // Query refetch
    refetchProcesses: processesQuery.refetch,
    refetchMetrics: metricsQuery.refetch,
    refetchHealth: healthQuery.refetch,
  };
}

// Hook for getting a single process
export function useStrudelProcess(processId: string) {
  return useQuery({
    queryKey: ['strudel', 'process', processId],
    queryFn: () => strudelService.getProcessStatus(processId),
    enabled: !!processId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return false;
      }
      return 2000;
    },
  });
}

// Hook for pattern history
export function useStrudelHistory(params?: PaginationParams) {
  return useQuery({
    queryKey: ['strudel', 'history', params],
    queryFn: () => strudelService.getHistory(params),
  });
}

export default useStrudel;
