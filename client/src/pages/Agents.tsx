import { useState } from 'react';
import {
  Play,
  Pause,
  Loader2,
  X,
  RefreshCw,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Spinner } from '@/components/ui/Spinner';
import { useAgents, useWorkflow } from '@/hooks/useAgents';
import { useWorkflowStream } from '@/hooks/useSocket';
import { toastSuccess, toastError } from '@/hooks/useToast';
import { formatRelativeTime } from '@/lib/utils';
import { DiscussionPanel } from '@/components/features/agents/DiscussionPanel';
import { SelfCritiquePanel } from '@/components/features/agents/SelfCritiquePanel';
import { DiscussionParticipantConfig } from '@/components/features/agents/DiscussionParticipantConfig';
import type { WorkflowStatus, Agent } from '@/types';
import type { DiscussionConfig } from '@backend/types/agent.types';

function getStatusIcon(status: WorkflowStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'pending':
    case 'paused':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: WorkflowStatus) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    failed: 'destructive',
    cancelled: 'destructive',
    running: 'secondary',
    pending: 'outline',
    paused: 'outline',
  };

  return (
    <Badge variant={variants[status] || 'outline'} className="capitalize">
      {status}
    </Badge>
  );
}

function getWorkflowTypeIcon(type: string) {
  switch (type) {
    case 'discussion':
      return <MessageSquare className="h-4 w-4 text-purple-500" />;
    case 'self-critique':
      return <Sparkles className="h-4 w-4 text-yellow-500" />;
    case 'parallel':
      return <Users className="h-4 w-4 text-blue-500" />;
    case 'sequential':
    default:
      return <Play className="h-4 w-4 text-green-500" />;
  }
}

// Workflow detail component
interface WorkflowDetailProps {
  workflowId: string;
  workflowType?: 'sequential' | 'parallel' | 'self-critique' | 'discussion';
  topic?: string;
  maxRounds?: number;
  maxIterations?: number;
}

function WorkflowDetail({
  workflowId,
  workflowType,
  topic,
  maxRounds = 5,
  maxIterations = 5,
}: WorkflowDetailProps) {
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { steps, currentStep, isRunning } = useWorkflowStream(
    workflow?.status === 'running' ? workflowId : null
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Workflow not found
      </div>
    );
  }

  // Render specialized panel for discussion workflows
  if (workflow.type === 'discussion' || workflowType === 'discussion') {
    return (
      <DiscussionPanel
        executionId={workflowId}
        topic={topic}
        maxRounds={maxRounds}
      />
    );
  }

  // Render specialized panel for self-critique workflows
  if (workflow.type === 'self-critique' || workflowType === 'self-critique') {
    return (
      <SelfCritiquePanel
        executionId={workflowId}
        maxIterations={maxIterations}
      />
    );
  }

  const displaySteps = isRunning ? steps : workflow.results;
  const displayCurrentStep = isRunning ? currentStep : workflow.currentStep;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Workflow: {workflow.name || workflow.id}</p>
          <p className="text-xs text-muted-foreground">
            Type: {workflow.type} | Created {formatRelativeTime(workflow.createdAt)}
          </p>
        </div>
        {getStatusBadge(workflow.status)}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Progress</span>
          <span>
            {displayCurrentStep} / {workflow.totalSteps} steps
          </span>
        </div>
        <Progress
          value={(displayCurrentStep / workflow.totalSteps) * 100}
          className="h-2"
        />
      </div>

      <div className="space-y-2">
        <Label>Agents</Label>
        <div className="flex flex-wrap gap-2">
          {workflow.agents.map((agentId, index) => (
            <Badge
              key={agentId}
              variant={index < displayCurrentStep ? 'default' : 'outline'}
            >
              {agentId}
            </Badge>
          ))}
        </div>
      </div>

      {displaySteps.length > 0 && (
        <div className="space-y-2">
          <Label>Results</Label>
          <div className="max-h-64 overflow-auto space-y-2">
            {displaySteps.map((step, index) => (
              <div
                key={index}
                className="rounded-md border p-3 text-sm space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Step {step.step}</span>
                  <Badge variant="outline">{step.agentId}</Badge>
                </div>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {JSON.stringify(step.result, null, 2).slice(0, 200)}
                  {JSON.stringify(step.result).length > 200 && '...'}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {workflow.error && (
        <div className="space-y-2">
          <Label className="text-destructive">Error</Label>
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {workflow.error}
          </div>
        </div>
      )}
    </div>
  );
}

// Agent card component
function AgentCard({
  agent,
  selected,
  onToggle,
}: {
  agent: Agent;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-4 cursor-pointer transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'hover:bg-accent'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Checkbox checked={selected} onChange={onToggle} />
            <span className="font-medium">{agent.name}</span>
          </div>
          <p className="text-sm text-muted-foreground">{agent.description}</p>
        </div>
        <Badge
          variant={
            agent.status === 'active'
              ? 'default'
              : agent.status === 'busy'
              ? 'secondary'
              : 'outline'
          }
        >
          {agent.status}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {agent.capabilities.slice(0, 3).map((cap) => (
          <Badge key={cap} variant="outline" className="text-xs">
            {cap}
          </Badge>
        ))}
        {agent.capabilities.length > 3 && (
          <Badge variant="outline" className="text-xs">
            +{agent.capabilities.length - 3} more
          </Badge>
        )}
      </div>
    </div>
  );
}

export function Agents() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedWorkflowType, setSelectedWorkflowType] = useState<
    'sequential' | 'parallel' | 'self-critique' | 'discussion' | null
  >(null);
  const [selectedWorkflowTopic, setSelectedWorkflowTopic] = useState<string>('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [workflowType, setWorkflowType] = useState<
    'sequential' | 'parallel' | 'self-critique' | 'discussion'
  >('sequential');
  const [input, setInput] = useState('');
  const [discussionConfig, setDiscussionConfig] = useState<DiscussionConfig | null>(null);

  const {
    agents,
    workflows,
    metrics,
    isAgentsLoading,
    isWorkflowsLoading,
    orchestrateSequential,
    orchestrateParallel,
    orchestrateSelfCritique,
    orchestrateDiscussion,
    cancelWorkflow,
    pauseWorkflow,
    resumeWorkflow,
    isExecutingWorkflow,
    isCancelling,
    isPausing,
    isResuming,
    refetchAgents,
    refetchWorkflows,
  } = useAgents();

  const handleToggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleExecuteWorkflow = () => {
    if (selectedAgents.length === 0) return;

    const options = { timeout: 300000 };

    const handleError = (error: unknown) => {
      console.error('Workflow execution failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to start workflow';
      toastError(message);
    };

    switch (workflowType) {
      case 'sequential':
        orchestrateSequential(
          { agents: selectedAgents, input, options },
          {
            onSuccess: (result) => {
              setSelectedWorkflowId(result.workflowId);
              setSelectedWorkflowType('sequential');
              setSelectedWorkflowTopic('');
              setInput('');
              toastSuccess('Sequential workflow started');
            },
            onError: handleError,
          }
        );
        break;
      case 'parallel':
        orchestrateParallel(
          { agents: selectedAgents, input, options },
          {
            onSuccess: (result) => {
              setSelectedWorkflowId(result.workflowId);
              setSelectedWorkflowType('parallel');
              setSelectedWorkflowTopic('');
              setInput('');
              toastSuccess('Parallel workflow started');
            },
            onError: handleError,
          }
        );
        break;
      case 'self-critique':
        if (selectedAgents.length > 0) {
          orchestrateSelfCritique(
            { agentId: selectedAgents[0], input, options: { ...options, maxIterations: 5 } },
            {
              onSuccess: (result) => {
                setSelectedWorkflowId(result.workflowId);
                setSelectedWorkflowType('self-critique');
                setSelectedWorkflowTopic(input);
                setInput('');
                toastSuccess('Self-critique workflow started');
              },
              onError: handleError,
            }
          );
        }
        break;
      case 'discussion':
        {
          // Build the agents list from discussion config participants if available,
          // otherwise fall back to selectedAgents
          const discussionAgents = discussionConfig?.participants?.length
            ? discussionConfig.participants.map((p) => p.agentId)
            : selectedAgents;

          orchestrateDiscussion(
            {
              agents: discussionAgents,
              topic: input,
              options: {
                ...options,
                maxRounds: discussionConfig?.maxRounds ?? 5,
              },
              config: discussionConfig
                ? {
                    maxRounds: discussionConfig.maxRounds,
                    participants: discussionConfig.participants,
                    consensusStrategy: discussionConfig.consensusStrategy,
                    convergenceThreshold: discussionConfig.convergenceThreshold,
                    facilitatorAgentId: discussionConfig.facilitatorAgentId,
                    contributionPromptTemplate: discussionConfig.contributionPromptTemplate,
                    synthesisPromptTemplate: discussionConfig.synthesisPromptTemplate,
                  }
                : undefined,
            },
            {
              onSuccess: (result) => {
                setSelectedWorkflowId(result.workflowId);
                setSelectedWorkflowType('discussion');
                setSelectedWorkflowTopic(input);
                setInput('');
                toastSuccess('Discussion workflow started');
              },
              onError: handleError,
            }
          );
        }
        break;
    }
  };

  const handleCancel = (workflowId: string) => {
    cancelWorkflow(workflowId);
  };

  const handlePause = (workflowId: string) => {
    pauseWorkflow(workflowId);
  };

  const handleResume = (workflowId: string) => {
    resumeWorkflow(workflowId);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Workflows</h1>
        <p className="text-muted-foreground">
          Orchestrate AI agents for complex multi-step tasks
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalAgents ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.activeAgents ?? 0} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.activeWorkflows ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.completedWorkflows ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.failedWorkflows ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="workflows" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Workflow Builder */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Start Workflow
                </CardTitle>
                <CardDescription>
                  Select agents and configure workflow execution
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Workflow Type</Label>
                  <Select
                    value={workflowType}
                    onValueChange={(v) =>
                      setWorkflowType(
                        v as typeof workflowType
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sequential">
                        Sequential - Agents run one after another
                      </SelectItem>
                      <SelectItem value="parallel">
                        Parallel - All agents run simultaneously
                      </SelectItem>
                      <SelectItem value="self-critique">
                        Self-Critique - Agent iteratively improves output
                      </SelectItem>
                      <SelectItem value="discussion">
                        Discussion - Agents discuss a topic
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    Select Agents ({selectedAgents.length} selected)
                  </Label>
                  {isAgentsLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Spinner />
                    </div>
                  ) : agents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No agents registered
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-auto space-y-2">
                      {agents.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          selected={selectedAgents.includes(agent.id)}
                          onToggle={() => handleToggleAgent(agent.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="input">
                    {workflowType === 'discussion' ? 'Topic' : 'Input'}
                  </Label>
                  <Textarea
                    id="input"
                    placeholder={
                      workflowType === 'discussion'
                        ? 'Enter discussion topic...'
                        : 'Enter input for the workflow...'
                    }
                    rows={4}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                </div>

                {workflowType === 'discussion' && agents.length > 0 && (
                  <DiscussionParticipantConfig
                    agents={agents}
                    value={discussionConfig ?? undefined}
                    onChange={setDiscussionConfig}
                    disabled={isExecutingWorkflow}
                  />
                )}

                <Button
                  className="w-full"
                  disabled={
                    isExecutingWorkflow ||
                    selectedAgents.length === 0 ||
                    !input.trim()
                  }
                  onClick={handleExecuteWorkflow}
                >
                  {isExecutingWorkflow ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Workflow
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Workflow Output */}
            <Card>
              <CardHeader>
                <CardTitle>Workflow Details</CardTitle>
                <CardDescription>
                  {selectedWorkflowId
                    ? `Viewing workflow ${selectedWorkflowId}`
                    : 'Select a workflow to view details'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedWorkflowId ? (
                  <WorkflowDetail
                    workflowId={selectedWorkflowId}
                    workflowType={selectedWorkflowType ?? undefined}
                    topic={selectedWorkflowTopic}
                    maxRounds={discussionConfig?.maxRounds ?? 5}
                    maxIterations={5}
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center text-muted-foreground">
                    Start a workflow or select one to view details
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Workflow List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Workflows</CardTitle>
                <CardDescription>Your recent workflow executions</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchWorkflows()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {isWorkflowsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Spinner />
                </div>
              ) : workflows.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No workflows yet. Start one to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {workflows.map((workflow) => (
                    <div
                      key={workflow.id}
                      className={`flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent cursor-pointer ${
                        selectedWorkflowId === workflow.id ? 'bg-accent' : ''
                      }`}
                      onClick={() => {
                        setSelectedWorkflowId(workflow.id);
                        setSelectedWorkflowType(workflow.type);
                        setSelectedWorkflowTopic(workflow.name || '');
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(workflow.status)}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getWorkflowTypeIcon(workflow.type)}
                            <p className="text-sm font-medium">
                              {workflow.name || `${workflow.type} workflow`}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {workflow.agents.length} agents |{' '}
                            {formatRelativeTime(workflow.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {workflow.status === 'running' && (
                          <div className="flex items-center gap-2">
                            <Progress
                              value={
                                (workflow.currentStep / workflow.totalSteps) * 100
                              }
                              className="h-2 w-20"
                            />
                            <span className="text-xs text-muted-foreground">
                              {workflow.currentStep}/{workflow.totalSteps}
                            </span>
                          </div>
                        )}
                        {getStatusBadge(workflow.status)}
                        {workflow.status === 'running' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePause(workflow.id);
                              }}
                              disabled={isPausing}
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancel(workflow.id);
                              }}
                              disabled={isCancelling}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {workflow.status === 'paused' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResume(workflow.id);
                            }}
                            disabled={isResuming}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Registered Agents</CardTitle>
                <CardDescription>All available AI agents</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchAgents()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {isAgentsLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Spinner />
                </div>
              ) : agents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No agents registered yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {agents.map((agent) => (
                    <Card key={agent.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{agent.name}</CardTitle>
                          <Badge
                            variant={
                              agent.status === 'active'
                                ? 'default'
                                : agent.status === 'busy'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {agent.status}
                          </Badge>
                        </div>
                        <CardDescription>{agent.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <Label className="text-xs">Capabilities</Label>
                          <div className="flex flex-wrap gap-1">
                            {agent.capabilities.map((cap) => (
                              <Badge
                                key={cap}
                                variant="outline"
                                className="text-xs"
                              >
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Agents;
