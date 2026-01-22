import { get, post, put, del } from '@/lib/api';
import type {
  Agent,
  AgentConfig,
  AgentTemplate,
  TemplateVariable,
  Workflow,
  WorkflowExecution,
  WorkflowOptions,
  AgentMetrics,
  HealthStatus,
  PaginatedResult,
  PaginationParams,
} from '@/types';
import type { DiscussionConfig } from '@backend/types/agent.types';

// Template types
export interface CreateTemplateData {
  name: string;
  description: string;
  template: string;
  variables: TemplateVariable[];
  tags?: string[];
}

export interface UpdateTemplateData extends Partial<CreateTemplateData> {
  id: string;
}

// Agent registration types
export interface RegisterAgentData {
  name: string;
  description: string;
  capabilities: string[];
  config?: AgentConfig;
}

export interface ExecuteAgentData {
  agentId: string;
  input: unknown;
  options?: {
    timeout?: number;
  };
}

export const agentService = {
  // ========================
  // Template Management
  // ========================

  /**
   * Create a new prompt template
   */
  async createTemplate(data: CreateTemplateData): Promise<AgentTemplate> {
    return post<AgentTemplate>('/agents/templates', data);
  },

  /**
   * Get a template by ID
   */
  async getTemplate(templateId: string): Promise<AgentTemplate> {
    return get<AgentTemplate>(`/agents/templates/${templateId}`);
  },

  /**
   * Update a template
   */
  async updateTemplate(
    templateId: string,
    data: Partial<CreateTemplateData>
  ): Promise<AgentTemplate> {
    return put<AgentTemplate>(`/agents/templates/${templateId}`, data);
  },

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<{ message: string }> {
    return del<{ message: string }>(`/agents/templates/${templateId}`);
  },

  /**
   * List all templates with pagination
   */
  async listTemplates(
    params?: PaginationParams & { tags?: string[] }
  ): Promise<PaginatedResult<AgentTemplate>> {
    return get<PaginatedResult<AgentTemplate>>('/agents/templates', params);
  },

  /**
   * Preview a template with sample data
   */
  async previewTemplate(
    templateId: string,
    variables: Record<string, unknown>
  ): Promise<{ rendered: string }> {
    return post<{ rendered: string }>(
      `/agents/templates/${templateId}/preview`,
      { variables }
    );
  },

  // ========================
  // Agent Registry
  // ========================

  /**
   * Register a new agent
   */
  async registerAgent(data: RegisterAgentData): Promise<Agent> {
    return post<Agent>('/agents/registry', data);
  },

  /**
   * List all registered agents
   * Note: Backend returns AgentRegistration[], we transform to Agent[]
   */
  async listAgents(
    params?: PaginationParams & { status?: string }
  ): Promise<PaginatedResult<Agent>> {
    // Backend returns AgentRegistration[] with different field types
    interface BackendAgent {
      id: string;
      type: 'claude' | 'strudel' | 'custom';
      name: string;
      description?: string;
      capabilities: Array<{ name: string; description: string }>;
      config: Record<string, unknown>;
      status: 'idle' | 'busy' | 'error' | 'offline';
      metadata?: {
        createdAt?: string;
        updatedAt?: string;
      };
    }

    const backendAgents = await get<BackendAgent[]>('/agents/registry', params);

    // Transform backend format to frontend format
    const agents: Agent[] = backendAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description ?? '',
      // Extract capability names as strings
      capabilities: agent.capabilities.map((cap) => cap.name),
      config: {
        model: agent.config.model as string | undefined,
        temperature: agent.config.temperature as number | undefined,
        maxTokens: agent.config.maxTokens as number | undefined,
        systemPrompt: agent.config.systemPrompt as string | undefined,
      },
      // Map backend status to frontend status
      status: agent.status === 'idle' ? 'active' : agent.status === 'offline' || agent.status === 'error' ? 'inactive' : 'busy',
      createdAt: agent.metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: agent.metadata?.updatedAt ?? new Date().toISOString(),
    }));

    return {
      data: agents,
      pagination: {
        page: 1,
        limit: agents.length,
        total: agents.length,
        totalPages: 1,
      },
    };
  },

  /**
   * Get an agent by ID
   */
  async getAgent(agentId: string): Promise<Agent> {
    return get<Agent>(`/agents/registry/${agentId}`);
  },

  /**
   * Update an agent
   */
  async updateAgent(
    agentId: string,
    data: Partial<RegisterAgentData>
  ): Promise<Agent> {
    return put<Agent>(`/agents/registry/${agentId}`, data);
  },

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<{ message: string }> {
    return del<{ message: string }>(`/agents/registry/${agentId}`);
  },

  /**
   * Execute a single agent
   */
  async executeAgent(data: ExecuteAgentData): Promise<{
    executionId: string;
    result?: unknown;
  }> {
    return post<{ executionId: string; result?: unknown }>(
      `/agents/registry/${data.agentId}/execute`,
      { input: data.input, options: data.options }
    );
  },

  // ========================
  // Workflow Operations
  // ========================

  /**
   * Execute a workflow
   */
  async executeWorkflow(data: WorkflowExecution): Promise<{ workflowId: string }> {
    return post<{ workflowId: string }>('/agents/workflows/execute', data);
  },

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<Workflow> {
    return get<Workflow>(`/agents/workflows/${workflowId}`);
  },

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(workflowId: string): Promise<{ message: string }> {
    return del<{ message: string }>(`/agents/workflows/${workflowId}`);
  },

  /**
   * Pause a running workflow
   */
  async pauseWorkflow(workflowId: string): Promise<{ message: string }> {
    return post<{ message: string }>(`/agents/workflows/${workflowId}/pause`);
  },

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(workflowId: string): Promise<{ message: string }> {
    return post<{ message: string }>(`/agents/workflows/${workflowId}/resume`);
  },

  /**
   * List all workflows with pagination
   */
  async listWorkflows(
    params?: PaginationParams & { status?: string; type?: string }
  ): Promise<PaginatedResult<Workflow>> {
    // Backend returns { workflows, total, page, pageSize, totalPages }
    // Transform to standard paginated format
    const result = await get<{
      workflows: Workflow[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>('/agents/workflows', params);

    return {
      data: result.workflows,
      pagination: {
        page: result.page,
        limit: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  },

  // ========================
  // Orchestration Patterns
  // ========================

  /**
   * Execute agents sequentially
   */
  async orchestrateSequential(
    agents: string[],
    input: unknown,
    options?: WorkflowOptions
  ): Promise<{ workflowId: string }> {
    // Transform agent IDs to tasks array format expected by backend
    const tasks = agents.map((agentId, index) => ({
      id: `task-${index}`,
      agentType: 'claude' as const,
      agentId,
      prompt: typeof input === 'string' ? input : JSON.stringify(input),
    }));

    // Use longer timeout for orchestration (5 minutes) since Claude CLI can take time
    const result = await post<{ id: string }>('/agents/orchestrate/sequential', {
      pattern: 'sequential',
      tasks,
      context: typeof input === 'object' ? input as Record<string, unknown> : { input },
      timeoutMs: options?.timeout,
      options,
    }, { timeout: 300000 });

    return { workflowId: result.id };
  },

  /**
   * Execute agents in parallel
   */
  async orchestrateParallel(
    agents: string[],
    input: unknown,
    options?: WorkflowOptions
  ): Promise<{ workflowId: string }> {
    // Transform agent IDs to tasks array format expected by backend
    const tasks = agents.map((agentId, index) => ({
      id: `task-${index}`,
      agentType: 'claude' as const,
      agentId,
      prompt: typeof input === 'string' ? input : JSON.stringify(input),
    }));

    // Use longer timeout for orchestration (5 minutes) since Claude CLI can take time
    const result = await post<{ id: string }>('/agents/orchestrate/parallel', {
      pattern: 'parallel',
      tasks,
      context: typeof input === 'object' ? input as Record<string, unknown> : { input },
      timeoutMs: options?.timeout,
      options,
    }, { timeout: 300000 });

    return { workflowId: result.id };
  },

  /**
   * Execute self-critique workflow
   */
  async orchestrateSelfCritique(
    agentId: string,
    input: unknown,
    options?: WorkflowOptions & { maxIterations?: number }
  ): Promise<{ workflowId: string }> {
    const prompt = typeof input === 'string' ? input : JSON.stringify(input);

    const result = await post<{ id: string }>('/agents/orchestrate/self-critique', {
      agentId,
      prompt,
      config: {
        maxIterations: options?.maxIterations ?? 5,
        qualityCriteria: [
          {
            name: 'completeness',
            description: 'The response fully addresses all aspects of the request',
            weight: 0.3,
          },
          {
            name: 'accuracy',
            description: 'The response is factually correct and precise',
            weight: 0.3,
          },
          {
            name: 'clarity',
            description: 'The response is clear, well-organized, and easy to understand',
            weight: 0.2,
          },
          {
            name: 'relevance',
            description: 'The response stays focused on the topic and avoids tangents',
            weight: 0.2,
          },
        ],
        stopOnQualityThreshold: 0.8,
      },
      context: typeof input === 'object' ? input as Record<string, unknown> : { input },
      timeoutMs: options?.timeout,
    });

    return { workflowId: result.id };
  },

  /**
   * Execute discussion workflow
   */
  async orchestrateDiscussion(
    agents: string[],
    topic: string,
    options?: WorkflowOptions & { maxRounds?: number },
    config?: DiscussionConfig
  ): Promise<{ workflowId: string }> {
    // Build participants from config or from agent IDs
    const participants = config?.participants ?? agents.map((agentId, index) => ({
      id: `participant-${index}`,
      agentId,
      role: index === 0 ? 'expert' : index === 1 ? 'critic' : 'analyst',
    }));

    const result = await post<{ id: string }>('/agents/orchestrate/discussion', {
      topic,
      participants,
      config: {
        maxRounds: config?.maxRounds ?? options?.maxRounds ?? 5,
        participants,
        consensusStrategy: config?.consensusStrategy ?? 'majority',
        convergenceThreshold: config?.convergenceThreshold ?? 0.8,
        facilitatorAgentId: config?.facilitatorAgentId,
        contributionPromptTemplate: config?.contributionPromptTemplate,
        synthesisPromptTemplate: config?.synthesisPromptTemplate,
      },
      timeoutMs: options?.timeout,
    });

    return { workflowId: result.id };
  },

  // ========================
  // Discussion & Self-Critique
  // ========================

  /**
   * Get discussion result by execution ID
   */
  async getDiscussionResult(executionId: string): Promise<{
    result: unknown;
    status: string;
  }> {
    return get<{ result: unknown; status: string }>(
      `/agents/orchestrate/discussion/${executionId}`
    );
  },

  /**
   * Get self-critique result by execution ID
   */
  async getSelfCritiqueResult(executionId: string): Promise<{
    result: unknown;
    status: string;
  }> {
    return get<{ result: unknown; status: string }>(
      `/agents/critique/${executionId}`
    );
  },

  /**
   * Execute music-specific self-critique workflow for Strudel patterns
   * Uses specialized quality criteria for evaluating and improving music compositions
   */
  async orchestrateMusicCritique(
    strudelCode: string,
    options?: { maxIterations?: number; timeout?: number }
  ): Promise<{ workflowId: string }> {
    const improvementPrompt = `You are reviewing and improving a Strudel live-coding music pattern.

CURRENT PATTERN:
${strudelCode}

Your task is to analyze this pattern and improve it based on the quality criteria provided.

IMPROVEMENT GUIDELINES:
1. Fix any syntax errors or invalid sample names
2. Improve musical structure and coherence
3. Enhance rhythmic variation while maintaining groove
4. Add dynamic contrast (gain, filter sweeps)
5. Improve the overall arrangement and energy arc

CONSTRAINTS - Only use these allowed constructs:
- s("samplepattern")
- note("pitchpattern").s("samplename")
- Modifiers: .gain(x) .lpf(x) .hpf(x) .room(x) .delay(x) .pan(x) .slow(n) .fast(n)
- Combinators: stack(patt1, patt2, ...) slowcat(patt1, patt2, ...)

AVAILABLE SAMPLES ONLY:
Drums: bd, sd, hh, oh, cp, hh27, cr, perc, tabla, hand, rm
Drum Machines: 808, 808bd, 808sd, 808hc, 808oh, clubkick
Bass: bass, bass1, bass2, bass3, jvbass, jungbass
Melodic: casio, arpy, pluck, sitar, gtr, jazz, pad, superpiano
Synth: sine, saw, moog, juno, hoover, stab, blip, bleep
Effects: noise, metal, industrial, glitch, space, wind
Voice: mouth, numbers, alphabet
Nature: birds, insect, crow, bubble
IMPORTANT: NEVER use "piano" (use "casio" or "superpiano"), NEVER use "sawtooth" (use "saw").

Output ONLY the improved Strudel code. Do NOT wrap in markdown code blocks. Do NOT use \`\`\` or any formatting. Just output the raw code starting with slowcat( or stack( or s(.`;

    // Use 10 minute timeout since self-critique involves multiple Claude calls
    const result = await post<{ id: string }>('/agents/orchestrate/self-critique', {
      agentId: 'agent_claude_default',
      prompt: improvementPrompt,
      config: {
        maxIterations: options?.maxIterations ?? 3,
        qualityCriteria: [
          {
            name: 'syntax_validity',
            description: 'The Strudel code is syntactically correct with balanced brackets/parentheses and uses only allowed functions (s, note, stack, slowcat, gain, lpf, hpf, room, delay, pan, slow, fast)',
            weight: 0.25,
          },
          {
            name: 'musical_structure',
            description: 'The pattern has clear musical structure with distinct sections, appropriate use of slowcat for form, and coherent arrangement of instruments',
            weight: 0.25,
          },
          {
            name: 'rhythmic_quality',
            description: 'The rhythm has good groove with well-placed kicks and snares, appropriate hi-hat patterns, and musical syncopation that creates movement',
            weight: 0.2,
          },
          {
            name: 'harmonic_coherence',
            description: 'Melodic and harmonic elements are musically coherent, using scale-correct notes and complementary chord progressions',
            weight: 0.15,
          },
          {
            name: 'dynamic_interest',
            description: 'The pattern uses dynamics effectively with varied gain levels, filter sweeps, effects (room, delay), and builds/drops to create energy arc',
            weight: 0.15,
          },
        ],
        stopOnQualityThreshold: 0.85,
      },
      context: { originalCode: strudelCode },
      timeoutMs: options?.timeout ?? 600000,
    }, { timeout: 600000 });

    return { workflowId: result.id };
  },

  /**
   * Get discussion metrics
   */
  async getDiscussionMetrics(): Promise<{
    totalExecutions: number;
    avgRounds: number;
    convergenceRate: number;
    avgConsensusScore: number;
    avgParticipants: number;
    avgDurationMs: number;
  }> {
    return get(`/agents/discussion/metrics`);
  },

  /**
   * Get self-critique metrics
   */
  async getSelfCritiqueMetrics(): Promise<{
    totalExecutions: number;
    avgIterations: number;
    convergenceRate: number;
    avgQualityImprovement: number;
    avgDurationMs: number;
  }> {
    return get(`/agents/self-critique/metrics`);
  },

  // ========================
  // Metrics & Health
  // ========================

  /**
   * Get agent service metrics
   */
  async getMetrics(): Promise<AgentMetrics> {
    return get<AgentMetrics>('/agents/metrics');
  },

  /**
   * Get agent service health status
   */
  async getHealth(): Promise<HealthStatus> {
    return get<HealthStatus>('/agents/health');
  },
};

export default agentService;
