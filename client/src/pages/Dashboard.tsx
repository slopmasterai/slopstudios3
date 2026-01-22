import { Activity, Bot, Music, Users, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import { useClaude } from '@/hooks/useClaude';
import { useStrudel } from '@/hooks/useStrudel';
import { useAgents } from '@/hooks/useAgents';
import { formatRelativeTime } from '@/lib/utils';
import type { ProcessStatus, WorkflowStatus } from '@/types';

function getStatusIcon(status: ProcessStatus | WorkflowStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
    case 'pending':
    case 'queued':
    case 'paused':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: ProcessStatus | WorkflowStatus) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    failed: 'destructive',
    cancelled: 'destructive',
    running: 'secondary',
    pending: 'outline',
    queued: 'outline',
    paused: 'outline',
  };

  return (
    <Badge variant={variants[status] || 'outline'} className="capitalize">
      {status}
    </Badge>
  );
}

export function Dashboard() {
  const { metrics: claudeMetrics, processes: claudeProcesses, isMetricsLoading: isClaudeMetricsLoading } = useClaude();
  const { metrics: strudelMetrics, processes: strudelProcesses, isMetricsLoading: isStrudelMetricsLoading } = useStrudel();
  const { metrics: agentMetrics, workflows, isMetricsLoading: isAgentMetricsLoading } = useAgents();

  const isLoading = isClaudeMetricsLoading || isStrudelMetricsLoading || isAgentMetricsLoading;

  // Calculate overall stats
  const totalActiveProcesses =
    (claudeMetrics?.activeProcesses ?? 0) +
    (strudelMetrics?.activeProcesses ?? 0) +
    (agentMetrics?.activeWorkflows ?? 0);

  const recentActivity = [
    ...claudeProcesses.slice(0, 3).map((p) => ({ ...p, type: 'claude' as const })),
    ...strudelProcesses.slice(0, 3).map((p) => ({ ...p, type: 'strudel' as const })),
    ...workflows.slice(0, 3).map((w) => ({ ...w, type: 'workflow' as const })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to Slop Studios 3. Here's an overview of your activity.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Processes</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActiveProcesses}</div>
            <p className="text-xs text-muted-foreground">
              Across all services
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Claude Commands</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {claudeMetrics?.totalCommands ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {claudeMetrics?.activeProcesses ?? 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Strudel Patterns</CardTitle>
            <Music className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {strudelMetrics?.totalPatterns ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {strudelMetrics?.activeProcesses ?? 0} rendering
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agent Workflows</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agentMetrics?.totalWorkflows ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {agentMetrics?.activeWorkflows ?? 0} running
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Jump into your most used features</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild>
            <Link to="/claude">
              <Bot className="mr-2 h-4 w-4" />
              New Claude Command
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/strudel">
              <Music className="mr-2 h-4 w-4" />
              Create Pattern
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/agents">
              <Users className="mr-2 h-4 w-4" />
              Start Workflow
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest commands and workflows</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between space-x-4"
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(item.status)}
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {item.type === 'claude' && 'Claude Command'}
                          {item.type === 'strudel' && 'Strudel Pattern'}
                          {item.type === 'workflow' && 'Workflow'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(item.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Health */}
        <Card>
          <CardHeader>
            <CardTitle>Service Health</CardTitle>
            <CardDescription>Current status of all services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Claude AI</span>
                <Badge variant="default">Healthy</Badge>
              </div>
              <Progress value={100} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Strudel Studio</span>
                <Badge variant="default">Healthy</Badge>
              </div>
              <Progress value={100} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Agent Orchestration</span>
                <Badge variant="default">Healthy</Badge>
              </div>
              <Progress value={100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Claude Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Completed</span>
              <span>{claudeMetrics?.completedProcesses ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Failed</span>
              <span>{claudeMetrics?.failedProcesses ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg. Time</span>
              <span>
                {claudeMetrics?.avgExecutionTime
                  ? `${(claudeMetrics.avgExecutionTime / 1000).toFixed(1)}s`
                  : '-'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Strudel Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Completed</span>
              <span>{strudelMetrics?.completedProcesses ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Failed</span>
              <span>{strudelMetrics?.failedProcesses ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avg. Render Time</span>
              <span>
                {strudelMetrics?.avgRenderTime
                  ? `${(strudelMetrics.avgRenderTime / 1000).toFixed(1)}s`
                  : '-'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Agent Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Agents</span>
              <span>{agentMetrics?.totalAgents ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Completed</span>
              <span>{agentMetrics?.completedWorkflows ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Failed</span>
              <span>{agentMetrics?.failedWorkflows ?? 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Dashboard;
