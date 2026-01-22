import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Clock, CheckCircle, Users, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { DiscussionMessage, SynthesisMessage } from './DiscussionMessage';
import type { DiscussionRound as DiscussionRoundType, DiscussionContribution } from '@backend/types/agent.types';

// Extract first code block from content
function extractFirstCode(content: string): string | null {
  // Try markdown code blocks first
  const codeBlockMatch = content.match(/```(?:strudel|javascript|js)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  // Try standalone Strudel patterns
  const strudelMatch = content.match(/^((?:s|note|stack|slowcat)\([^]*?\))$/m);
  if (strudelMatch) {
    return strudelMatch[1].trim();
  }
  return null;
}

interface DiscussionRoundProps {
  round: DiscussionRoundType;
  isCurrentRound?: boolean;
  isCompleted?: boolean;
  defaultExpanded?: boolean;
  onApplyCode?: (code: string) => void;
  className?: string;
}

export function DiscussionRound({
  round,
  isCurrentRound = false,
  isCompleted = false,
  defaultExpanded = false,
  onApplyCode,
  className,
}: DiscussionRoundProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || isCurrentRound);

  const consensusPercent = round.consensusScore ? Math.round(round.consensusScore * 100) : 0;
  const hasConsensus = round.consensusScore && round.consensusScore >= 0.8;

  // Extract code from synthesis for the Apply button
  const synthesisCode = useMemo(() => {
    if (round.synthesis) {
      return extractFirstCode(round.synthesis);
    }
    return null;
  }, [round.synthesis]);

  return (
    <Card
      className={cn(
        'transition-all',
        isCurrentRound && 'ring-2 ring-primary',
        className
      )}
    >
      <CardHeader
        className={cn(
          'cursor-pointer select-none transition-colors hover:bg-accent/50',
          'flex flex-row items-center justify-between p-4'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
              isCurrentRound
                ? 'bg-primary text-primary-foreground'
                : isCompleted
                ? 'bg-green-500 text-white'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {round.round}
          </div>
          <div className="flex flex-col">
            <CardTitle className="text-sm font-medium">
              Round {round.round}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{round.contributions.length} contributions</span>
              {round.durationMs > 0 && (
                <>
                  <Clock className="h-3 w-3 ml-2" />
                  <span>{(round.durationMs / 1000).toFixed(1)}s</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          {isCurrentRound ? (
            <Badge variant="secondary" className="animate-pulse">
              In Progress
            </Badge>
          ) : isCompleted ? (
            <Badge variant="success">
              <CheckCircle className="mr-1 h-3 w-3" />
              Complete
            </Badge>
          ) : (
            <Badge variant="outline">Pending</Badge>
          )}

          {/* Consensus Score */}
          {round.consensusScore !== undefined && (
            <div className="flex items-center gap-2">
              <Progress
                value={consensusPercent}
                className={cn(
                  'h-2 w-16',
                  hasConsensus && 'bg-green-500/20'
                )}
              />
              <span
                className={cn(
                  'text-xs font-medium',
                  hasConsensus ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                )}
              >
                {consensusPercent}%
              </span>
            </div>
          )}

          {/* Apply Button - only show if there's code in synthesis */}
          {synthesisCode && onApplyCode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onApplyCode(synthesisCode);
              }}
            >
              <Play className="h-3 w-3 mr-1" />
              Apply
            </Button>
          )}

          {/* Expand/Collapse */}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Contributions */}
          <div className="space-y-3">
            {round.contributions.map((contribution, index) => (
              <DiscussionMessage
                key={`${contribution.participantId}-${index}`}
                contribution={contribution}
              />
            ))}
          </div>

          {/* Synthesis */}
          {round.synthesis && (
            <div className="pt-2 border-t">
              <SynthesisMessage
                synthesis={round.synthesis}
                consensusScore={round.consensusScore}
                timestamp={round.timestamp}
                onApplyCode={onApplyCode}
              />
            </div>
          )}

          {/* Round Timestamp */}
          <div className="text-xs text-muted-foreground text-right">
            {formatRelativeTime(round.timestamp)}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// Active round with streaming contributions
interface ActiveRoundProps {
  roundNumber: number;
  contributions: DiscussionContribution[];
  participantCount: number;
  className?: string;
}

export function ActiveRound({
  roundNumber,
  contributions,
  participantCount,
  className,
}: ActiveRoundProps) {
  return (
    <Card className={cn('ring-2 ring-primary', className)}>
      <CardHeader className="flex flex-row items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            {roundNumber}
          </div>
          <div className="flex flex-col">
            <CardTitle className="text-sm font-medium">
              Round {roundNumber}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>
                {contributions.length} of {participantCount} responses
              </span>
            </div>
          </div>
        </div>

        <Badge variant="secondary" className="animate-pulse">
          In Progress
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {contributions.map((contribution, index) => (
          <DiscussionMessage
            key={`${contribution.participantId}-${index}`}
            contribution={contribution}
          />
        ))}

        {/* Progress indicator for remaining participants */}
        {contributions.length < participantCount && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>
              Waiting for {participantCount - contributions.length} more participant
              {participantCount - contributions.length > 1 ? 's' : ''}...
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DiscussionRound;
