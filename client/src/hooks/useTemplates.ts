import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agentService,
  type CreateTemplateData,
} from '@/services/agent.service';
import type { PaginationParams } from '@/types';

export function useTemplates(params?: PaginationParams & { tags?: string[] }) {
  const queryClient = useQueryClient();

  // Query for templates list
  const templatesQuery = useQuery({
    queryKey: ['templates', params],
    queryFn: () => agentService.listTemplates(params),
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: (data: CreateTemplateData) => agentService.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: ({
      templateId,
      data,
    }: {
      templateId: string;
      data: Partial<CreateTemplateData>;
    }) => agentService.updateTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) => agentService.deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  // Preview template mutation
  const previewTemplateMutation = useMutation({
    mutationFn: ({
      templateId,
      variables,
    }: {
      templateId: string;
      variables: Record<string, unknown>;
    }) => agentService.previewTemplate(templateId, variables),
  });

  return {
    // Queries
    templates: templatesQuery.data?.data ?? [],
    pagination: templatesQuery.data?.pagination,
    isLoading: templatesQuery.isLoading,
    error: templatesQuery.error,

    // Mutations
    createTemplate: createTemplateMutation.mutate,
    updateTemplate: updateTemplateMutation.mutate,
    deleteTemplate: deleteTemplateMutation.mutate,
    previewTemplate: previewTemplateMutation.mutate,

    // Mutation states
    isCreating: createTemplateMutation.isPending,
    isUpdating: updateTemplateMutation.isPending,
    isDeleting: deleteTemplateMutation.isPending,
    isPreviewing: previewTemplateMutation.isPending,
    previewResult: previewTemplateMutation.data,
    createError: createTemplateMutation.error,
    updateError: updateTemplateMutation.error,
    deleteError: deleteTemplateMutation.error,

    // Query refetch
    refetch: templatesQuery.refetch,
  };
}

// Hook for getting a single template
export function useTemplate(templateId: string) {
  return useQuery({
    queryKey: ['templates', templateId],
    queryFn: () => agentService.getTemplate(templateId),
    enabled: !!templateId,
  });
}

export default useTemplates;
