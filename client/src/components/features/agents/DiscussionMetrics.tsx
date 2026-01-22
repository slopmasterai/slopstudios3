import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare,
  RotateCcw,
  Target,
  Users,
  Clock,
  TrendingUp,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { agentService } from '@/services/agent.service';

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

function MetricCard({
  title,
  value,
  description,
  icon,
  trend,
  trendValue,
  className,
}: MetricCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(description || trendValue) && (
          <p className="text-xs text-muted-foreground mt-1">
            {trendValue && (
              <span
                className={cn(
                  'mr-1',
                  trend === 'up' && 'text-green-600 dark:text-green-400',
                  trend === 'down' && 'text-red-600 dark:text-red-400'
                )}
              >
                {trend === 'up' && '+'}{trendValue}
              </span>
            )}
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface DiscussionMetricsProps {
  className?: string;
}

export function DiscussionMetrics({ className }: DiscussionMetricsProps) {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['agents', 'discussion', 'metrics'],
    queryFn: agentService.getDiscussionMetrics,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-8">
          <Spinner className="h-8 w-8" />
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
          Unable to load discussion metrics
        </CardContent>
      </Card>
    );
  }

  const convergencePercent = Math.round(metrics.convergenceRate * 100);
  const consensusPercent = Math.round(metrics.avgConsensusScore * 100);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Discussion Metrics
        </h3>
        <Badge variant="outline" className="text-xs">
          Live
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Discussions"
          value={metrics.totalExecutions}
          icon={<MessageSquare className="h-4 w-4" />}
          description="all time"
        />
        <MetricCard
          title="Avg Rounds"
          value={metrics.avgRounds.toFixed(1)}
          icon={<RotateCcw className="h-4 w-4" />}
          description="per discussion"
        />
        <MetricCard
          title="Convergence Rate"
          value={`${convergencePercent}%`}
          icon={<Target className="h-4 w-4" />}
          description="achieved consensus"
        />
        <MetricCard
          title="Avg Consensus Score"
          value={`${consensusPercent}%`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          title="Avg Participants"
          value={metrics.avgParticipants.toFixed(1)}
          icon={<Users className="h-4 w-4" />}
          description="per discussion"
        />
        <MetricCard
          title="Avg Duration"
          value={`${(metrics.avgDurationMs / 1000).toFixed(1)}s`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Convergence Rate Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Convergence Success</CardTitle>
          <CardDescription>
            Percentage of discussions that achieved consensus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Convergence Rate</span>
              <span className="font-medium">{convergencePercent}%</span>
            </div>
            <Progress
              value={convergencePercent}
              className={cn(
                'h-3',
                convergencePercent >= 80 && '[&>div]:bg-green-500',
                convergencePercent >= 50 && convergencePercent < 80 && '[&>div]:bg-yellow-500',
                convergencePercent < 50 && '[&>div]:bg-red-500'
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface SelfCritiqueMetricsProps {
  className?: string;
}

export function SelfCritiqueMetrics({ className }: SelfCritiqueMetricsProps) {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['agents', 'self-critique', 'metrics'],
    queryFn: agentService.getSelfCritiqueMetrics,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-8">
          <Spinner className="h-8 w-8" />
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
          Unable to load self-critique metrics
        </CardContent>
      </Card>
    );
  }

  const convergencePercent = Math.round(metrics.convergenceRate * 100);
  const improvementPercent = Math.round(metrics.avgQualityImprovement * 100);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Self-Critique Metrics
        </h3>
        <Badge variant="outline" className="text-xs">
          Live
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Critiques"
          value={metrics.totalExecutions}
          icon={<Sparkles className="h-4 w-4" />}
          description="all time"
        />
        <MetricCard
          title="Avg Iterations"
          value={metrics.avgIterations.toFixed(1)}
          icon={<RefreshCw className="h-4 w-4" />}
          description="per critique"
        />
        <MetricCard
          title="Convergence Rate"
          value={`${convergencePercent}%`}
          icon={<Target className="h-4 w-4" />}
          description="met quality threshold"
        />
        <MetricCard
          title="Quality Improvement"
          value={`+${improvementPercent}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          description="average improvement"
          trend="up"
        />
        <MetricCard
          title="Avg Duration"
          value={`${(metrics.avgDurationMs / 1000).toFixed(1)}s`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Quality Improvement Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quality Improvement</CardTitle>
          <CardDescription>
            Average quality score improvement through iterations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Average Improvement</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                +{improvementPercent}%
              </span>
            </div>
            <Progress
              value={Math.min(improvementPercent, 100)}
              className="h-3 [&>div]:bg-green-500"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Combined metrics component for overview
interface CollaborationMetricsProps {
  className?: string;
}

export function CollaborationMetrics({ className }: CollaborationMetricsProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <DiscussionMetrics />
      <SelfCritiqueMetrics />
    </div>
  );
}

export default DiscussionMetrics;
