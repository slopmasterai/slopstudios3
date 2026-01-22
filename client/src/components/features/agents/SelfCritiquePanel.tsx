import { useCallback } from 'react';
import {
  Sparkles,
  CheckCircle,
  AlertCircle,
  Download,
  Copy,
  TrendingUp,
  Target,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { useSelfCritiqueStream } from '@/hooks/useAgents';
import type { SelfCritiqueResult, CritiqueIteration } from '@backend/types/agent.types';

interface SelfCritiquePanelProps {
  executionId: string | null;
  maxIterations?: number;
  className?: string;
  onExport?: (result: SelfCritiqueResult) => void;
}

export function SelfCritiquePanel({
  executionId,
  maxIterations = 5,
  className,
  onExport,
}: SelfCritiquePanelProps) {
  const {
    status,
    iterations,
    currentIteration,
    currentScore,
    criteriaScores,
    feedback,
    converged,
    result,
    error,
    isRunning,
    isCompleted,
    hasError,
  } = useSelfCritiqueStream(executionId);

  // Export result as JSON
  const handleExportJSON = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `self-critique-${executionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onExport?.(result);
  }, [result, executionId, onExport]);

  // Copy final output to clipboard
  const handleCopyOutput = useCallback(() => {
    if (result?.finalOutput) {
      navigator.clipboard.writeText(String(result.finalOutput));
    }
  }, [result]);

  // Empty state
  if (!executionId) {
    return (
      <Card className={cn('h-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Self-Critique Panel
          </CardTitle>
          <CardDescription>
            Start a self-critique workflow to see iterative improvement
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-64 items-center justify-center text-muted-foreground">
          No active self-critique. Configure and start a workflow to see results here.
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (status === 'idle') {
    return (
      <Card className={cn('h-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Self-Critique Panel
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-64 items-center justify-center">
          <Spinner className="h-8 w-8" />
          <span className="ml-3 text-muted-foreground">Starting self-critique...</span>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (hasError) {
    return (
      <Card className={cn('h-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Self-Critique Panel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Self-Critique Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const progressPercent = (currentIteration / maxIterations) * 100;
  const scorePercent = currentScore ? Math.round(currentScore * 100) : 0;

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <CardHeader className="flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Self-Critique
            </CardTitle>
            <CardDescription>
              {isRunning
                ? `Iteration ${currentIteration} of ${maxIterations}`
                : isCompleted
                ? `Completed in ${iterations.length} iterations`
                : 'Processing...'}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Badge */}
            {isRunning && (
              <Badge variant="secondary" className="animate-pulse">
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                Iterating
              </Badge>
            )}
            {converged && (
              <Badge variant="success">
                <CheckCircle className="mr-1 h-3 w-3" />
                Converged
              </Badge>
            )}
            {isCompleted && !converged && (
              <Badge variant="outline">Max Iterations</Badge>
            )}

            {/* Export Actions */}
            {isCompleted && result && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyOutput}
                  title="Copy final output"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJSON}
                  title="Export as JSON"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Iteration Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Iteration Progress
              </span>
              <span className="text-muted-foreground">
                {currentIteration} / {maxIterations}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Quality Score */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Quality Score
              </span>
              <span
                className={cn(
                  'font-medium',
                  scorePercent >= 80
                    ? 'text-green-600 dark:text-green-400'
                    : scorePercent >= 50
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-muted-foreground'
                )}
              >
                {scorePercent}%
              </span>
            </div>
            <Progress
              value={scorePercent}
              className={cn(
                'h-2',
                scorePercent >= 80 && '[&>div]:bg-green-500'
              )}
            />
          </div>
        </div>
      </CardHeader>

      {/* Content */}
      <CardContent className="flex-1 overflow-hidden">
        <Tabs defaultValue="iterations" className="h-full flex flex-col">
          <TabsList>
            <TabsTrigger value="iterations">Iterations</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            {isCompleted && <TabsTrigger value="comparison">Comparison</TabsTrigger>}
          </TabsList>

          {/* Iterations Tab */}
          <TabsContent value="iterations" className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              {iterations.map((iteration, index) => (
                <IterationCard
                  key={iteration.iteration}
                  iteration={iteration}
                  isLatest={index === iterations.length - 1 && isRunning}
                />
              ))}

              {/* Current iteration feedback */}
              {isRunning && feedback && (
                <Card className="bg-muted/50 animate-pulse">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium mb-2">Current Feedback</p>
                    <p className="text-sm text-muted-foreground">{feedback}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Scores Tab */}
          <TabsContent value="scores" className="flex-1 overflow-y-auto">
            <div className="space-y-4">
              {/* Criteria Scores */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Quality Criteria</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(criteriaScores).map(([criterion, score]) => (
                    <div key={criterion} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize">
                          {criterion.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={cn(
                            'font-medium',
                            score >= 0.8
                              ? 'text-green-600 dark:text-green-400'
                              : score >= 0.5
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {Math.round(score * 100)}%
                        </span>
                      </div>
                      <Progress
                        value={score * 100}
                        className={cn(
                          'h-2',
                          score >= 0.8
                            ? '[&>div]:bg-green-500'
                            : score >= 0.5
                            ? '[&>div]:bg-yellow-500'
                            : '[&>div]:bg-red-500'
                        )}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Score Trend */}
              {iterations.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Score Trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between h-32 gap-2">
                      {iterations.map((iter) => {
                        const height = iter.critique.overallScore * 100;
                        return (
                          <div
                            key={iter.iteration}
                            className="flex-1 flex flex-col items-center gap-1"
                          >
                            <div
                              className={cn(
                                'w-full rounded-t transition-all',
                                iter.critique.overallScore >= 0.8
                                  ? 'bg-green-500'
                                  : iter.critique.overallScore >= 0.5
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              )}
                              style={{ height: `${height}%` }}
                            />
                            <span className="text-xs text-muted-foreground">
                              {iter.iteration}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Comparison Tab */}
          {isCompleted && result && (
            <TabsContent value="comparison" className="flex-1 overflow-y-auto">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Original Output */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Original Output
                      <Badge variant="outline" className="text-xs">
                        {Math.round(
                          (iterations[0]?.critique.overallScore || 0) * 100
                        )}
                        %
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-3 max-h-64 overflow-y-auto">
                      {JSON.stringify(iterations[0]?.output, null, 2)}
                    </pre>
                  </CardContent>
                </Card>

                {/* Final Output */}
                <Card className="border-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Final Output
                      <Badge variant="success" className="text-xs">
                        {Math.round((result.finalScore || 0) * 100)}%
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-3 max-h-64 overflow-y-auto">
                      {JSON.stringify(result.finalOutput, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>

              {/* Improvement Summary */}
              <Card className="mt-4">
                <CardContent className="p-4">
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">
                        {Math.round(
                          (iterations[0]?.critique.overallScore || 0) * 100
                        )}
                        %
                      </p>
                      <p className="text-xs text-muted-foreground">Initial</p>
                    </div>
                    <ArrowRight className="h-6 w-6 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {Math.round((result.finalScore || 0) * 100)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Final</p>
                    </div>
                    <div className="border-l pl-4 ml-4">
                      <p className="text-lg font-medium text-green-600 dark:text-green-400">
                        +
                        {Math.round(
                          ((result.finalScore || 0) -
                            (iterations[0]?.critique.overallScore || 0)) *
                            100
                        )}
                        %
                      </p>
                      <p className="text-xs text-muted-foreground">Improvement</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Iteration Card Component
interface IterationCardProps {
  iteration: CritiqueIteration;
  isLatest?: boolean;
}

function IterationCard({ iteration, isLatest }: IterationCardProps) {
  const scorePercent = Math.round(iteration.critique.overallScore * 100);

  return (
    <Card className={cn(isLatest && 'ring-2 ring-primary')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <div
              className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold',
                iteration.critique.meetsThreshold
                  ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {iteration.iteration}
            </div>
            Iteration {iteration.iteration}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                scorePercent >= 80
                  ? 'success'
                  : scorePercent >= 50
                  ? 'warning'
                  : 'destructive'
              }
            >
              {scorePercent}%
            </Badge>
            {iteration.critique.meetsThreshold && (
              <Badge variant="success">
                <CheckCircle className="h-3 w-3" />
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Feedback */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Feedback
          </p>
          <p className="text-sm">{iteration.critique.feedback}</p>
        </div>

        {/* Criteria Scores (collapsed) */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(iteration.critique.criteriaScores).map(
            ([criterion, score]) => (
              <Badge
                key={criterion}
                variant={
                  score >= 0.8
                    ? 'success'
                    : score >= 0.5
                    ? 'warning'
                    : 'destructive'
                }
                className="text-xs"
              >
                {criterion}: {Math.round(score * 100)}%
              </Badge>
            )
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {iteration.durationMs > 0 && (
            <span>{(iteration.durationMs / 1000).toFixed(1)}s</span>
          )}
          <span>{formatRelativeTime(iteration.timestamp)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default SelfCritiquePanel;
