import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Download,
  Copy,
  Share2,
  TrendingUp,
  Target,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { useDiscussionStream } from '@/hooks/useAgents';
import { DiscussionRound, ActiveRound } from './DiscussionRound';
import type { DiscussionResult } from '@backend/types/agent.types';

interface DiscussionPanelProps {
  executionId: string | null;
  topic?: string;
  maxRounds?: number;
  className?: string;
  onExport?: (result: DiscussionResult) => void;
}

export function DiscussionPanel({
  executionId,
  topic,
  maxRounds = 5,
  className,
  onExport,
}: DiscussionPanelProps) {
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const {
    status,
    rounds,
    currentRound,
    participantCount,
    currentContributions,
    consensusScore,
    converged,
    result,
    error,
    isRunning,
    isCompleted,
    hasError,
  } = useDiscussionStream(executionId);

  // Auto-scroll to latest content
  useEffect(() => {
    if (autoScroll && chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [rounds, currentContributions, autoScroll]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (chatAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatAreaRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isAtBottom);
    }
  }, []);

  // Export discussion as JSON
  const handleExportJSON = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discussion-${executionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onExport?.(result);
  }, [result, executionId, onExport]);

  // Export discussion as Markdown
  const handleExportMarkdown = useCallback(() => {
    if (!result) return;
    let markdown = `# Discussion: ${topic || 'Untitled'}\n\n`;
    markdown += `**Status:** ${converged ? 'Converged' : 'Completed'}\n`;
    markdown += `**Consensus Score:** ${Math.round((consensusScore || 0) * 100)}%\n`;
    markdown += `**Rounds:** ${rounds.length}\n\n`;
    markdown += `---\n\n`;

    result.rounds.forEach((round) => {
      markdown += `## Round ${round.round}\n\n`;
      round.contributions.forEach((c) => {
        markdown += `### ${c.role} (${c.participantId})\n`;
        markdown += `${c.content}\n\n`;
      });
      if (round.synthesis) {
        markdown += `### Synthesis\n`;
        markdown += `${round.synthesis}\n\n`;
        if (round.consensusScore) {
          markdown += `*Consensus: ${Math.round(round.consensusScore * 100)}%*\n\n`;
        }
      }
      markdown += `---\n\n`;
    });

    markdown += `## Final Consensus\n\n`;
    markdown += result.finalConsensus;

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discussion-${executionId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, topic, converged, consensusScore, rounds, executionId]);

  // Copy final consensus to clipboard
  const handleCopyConsensus = useCallback(() => {
    if (result?.finalConsensus) {
      navigator.clipboard.writeText(result.finalConsensus);
    }
  }, [result]);

  // Empty state
  if (!executionId) {
    return (
      <Card className={cn('h-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Discussion Panel
          </CardTitle>
          <CardDescription>
            Start a discussion workflow to see real-time agent collaboration
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-64 items-center justify-center text-muted-foreground">
          No active discussion. Configure and start a discussion to see results here.
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
            <MessageSquare className="h-5 w-5" />
            Discussion Panel
          </CardTitle>
        </CardHeader>
        <CardContent className="flex h-64 items-center justify-center">
          <Spinner className="h-8 w-8" />
          <span className="ml-3 text-muted-foreground">Starting discussion...</span>
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
            <MessageSquare className="h-5 w-5" />
            Discussion Panel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Discussion Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const progressPercent = (currentRound / maxRounds) * 100;
  const consensusPercent = consensusScore ? Math.round(consensusScore * 100) : 0;

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <CardHeader className="flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {topic || 'Discussion'}
            </CardTitle>
            <CardDescription>
              {isRunning
                ? `Round ${currentRound} of ${maxRounds} in progress`
                : isCompleted
                ? `Completed in ${rounds.length} rounds`
                : 'Discussion in progress'}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Badge */}
            {isRunning && (
              <Badge variant="secondary" className="animate-pulse">
                In Progress
              </Badge>
            )}
            {converged && (
              <Badge variant="success">
                <CheckCircle className="mr-1 h-3 w-3" />
                Converged
              </Badge>
            )}
            {isCompleted && !converged && (
              <Badge variant="outline">Completed</Badge>
            )}

            {/* Export Actions */}
            {isCompleted && result && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyConsensus}
                  title="Copy consensus"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportMarkdown}
                  title="Export as Markdown"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJSON}
                  title="Export as JSON"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Round Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Round Progress
              </span>
              <span className="text-muted-foreground">
                {currentRound} / {maxRounds}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Consensus Score */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Consensus Score
              </span>
              <span
                className={cn(
                  'font-medium',
                  consensusPercent >= 80
                    ? 'text-green-600 dark:text-green-400'
                    : consensusPercent >= 50
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-muted-foreground'
                )}
              >
                {consensusPercent}%
              </span>
            </div>
            <Progress
              value={consensusPercent}
              className={cn(
                'h-2',
                consensusPercent >= 80 && '[&>div]:bg-green-500'
              )}
            />
          </div>
        </div>
      </CardHeader>

      {/* Chat Area */}
      <CardContent className="flex-1 overflow-hidden p-0">
        <div
          ref={chatAreaRef}
          onScroll={handleScroll}
          className="h-full max-h-[500px] overflow-y-auto p-6 space-y-4"
        >
          {/* Completed Rounds */}
          {rounds.map((round, index) => (
            <DiscussionRound
              key={round.round}
              round={round}
              isCompleted
              defaultExpanded={index === rounds.length - 1 && !isRunning}
            />
          ))}

          {/* Active Round */}
          {isRunning && currentContributions.length > 0 && (
            <ActiveRound
              roundNumber={currentRound}
              contributions={currentContributions}
              participantCount={participantCount}
            />
          )}

          {/* Final Consensus Display */}
          {isCompleted && result && (
            <Card className="border-2 border-primary bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Final Consensus
                </CardTitle>
                <CardDescription>
                  {converged
                    ? `Achieved with ${consensusPercent}% agreement`
                    : `Completed after ${rounds.length} rounds`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {result.finalConsensus}
                </div>

                {/* Participant Summary */}
                {result.participantSummaries && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Participant Summary</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(result.participantSummaries).map(
                        ([participantId, summary]) => (
                          <Badge key={participantId} variant="outline">
                            {participantId}: {summary.contributions} contributions,{' '}
                            {Math.round(summary.agreementRate * 100)}% agreement
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </CardContent>

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setAutoScroll(true);
              if (chatAreaRef.current) {
                chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
              }
            }}
          >
            Scroll to latest
          </Button>
        </div>
      )}
    </Card>
  );
}

export default DiscussionPanel;
