/**
 * Music Discussion Panel
 * Displays the music expert discussion for Strudel pattern evaluation
 */

import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Music,
  Drum,
  Wand2,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { DiscussionRound, ActiveRound } from '@/components/features/agents/DiscussionRound';
import type {
  DiscussionRound as DiscussionRoundType,
  DiscussionContribution,
} from '@backend/types/agent.types';

interface MusicDiscussionPanelProps {
  isActive: boolean;
  isRunning: boolean;
  isCompleted: boolean;
  rounds: DiscussionRoundType[];
  currentRound: number;
  currentContributions: DiscussionContribution[];
  participantCount: number;
  consensusScore: number | null;
  finalConsensus: string | null;
  error?: string | null;
  className?: string;
}

// Role icons for the legend
const ROLE_ICONS: Record<string, React.ReactNode> = {
  composer: <Music className="h-3 w-3" />,
  'rhythm-expert': <Drum className="h-3 w-3" />,
  'sound-designer': <Wand2 className="h-3 w-3" />,
  'music-critic': <AlertCircle className="h-3 w-3" />,
};

// Role display names
const ROLE_NAMES: Record<string, string> = {
  composer: 'Composer',
  'rhythm-expert': 'Rhythm Expert',
  'sound-designer': 'Sound Designer',
  'music-critic': 'Music Critic',
};

// Role badge colors for the legend
const ROLE_BADGE_CLASSES: Record<string, string> = {
  composer: 'border-violet-500/50 text-violet-700 dark:text-violet-400',
  'rhythm-expert': 'border-amber-500/50 text-amber-700 dark:text-amber-400',
  'sound-designer': 'border-teal-500/50 text-teal-700 dark:text-teal-400',
  'music-critic': 'border-rose-500/50 text-rose-700 dark:text-rose-400',
};

export function MusicDiscussionPanel({
  isActive,
  isRunning,
  isCompleted,
  rounds,
  currentRound,
  currentContributions,
  participantCount,
  consensusScore,
  finalConsensus,
  error,
  className,
}: MusicDiscussionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current && !userScrolled && isRunning) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rounds, currentContributions, isRunning, userScrolled]);

  // Track user scroll
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setUserScrolled(!isAtBottom);
    }
  };

  if (!isActive) return null;

  const consensusPercent = consensusScore ? Math.round(consensusScore * 100) : 0;

  return (
    <div
      className={cn(
        'rounded-lg border p-4 space-y-4 bg-gradient-to-r from-blue-500/5 to-purple-500/5',
        className
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">Music Expert Discussion</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          {error ? (
            <Badge variant="destructive">
              <AlertCircle className="mr-1 h-3 w-3" />
              Error
            </Badge>
          ) : isRunning ? (
            <Badge variant="secondary" className="animate-pulse">
              <Users className="mr-1 h-3 w-3" />
              Round {currentRound}
            </Badge>
          ) : isCompleted && consensusScore !== null ? (
            <Badge
              variant={consensusPercent >= 70 ? 'success' : 'warning'}
              className="flex items-center gap-1"
            >
              <CheckCircle className="h-3 w-3" />
              {consensusPercent}% Consensus
            </Badge>
          ) : null}

          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4">
          {/* Participant Legend */}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(ROLE_NAMES).map(([role, name]) => (
              <Badge
                key={role}
                variant="outline"
                className={cn('flex items-center gap-1', ROLE_BADGE_CLASSES[role])}
              >
                {ROLE_ICONS[role]}
                {name}
              </Badge>
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Discussion Rounds */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="space-y-3 max-h-80 overflow-y-auto pr-2"
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
                participantCount={participantCount || 4}
              />
            )}

            {/* Waiting for first contribution */}
            {isRunning && currentContributions.length === 0 && (
              <Card className="ring-2 ring-primary">
                <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                  <span>Music experts are analyzing the improvement...</span>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Scroll to bottom button */}
          {userScrolled && isRunning && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  setUserScrolled(false);
                }
              }}
            >
              Scroll to latest
            </Button>
          )}

          {/* Final Consensus */}
          {isCompleted && finalConsensus && (
            <Card className="border-2 border-primary bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  Expert Consensus
                  {consensusScore !== null && (
                    <Badge
                      variant={consensusPercent >= 70 ? 'success' : 'warning'}
                      className="ml-auto"
                    >
                      {consensusPercent}% Agreement
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{finalConsensus}</p>
              </CardContent>
            </Card>
          )}

          {/* Completion message without consensus */}
          {isCompleted && !finalConsensus && rounds.length > 0 && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              Discussion completed. Review the round summaries above for expert feedback.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MusicDiscussionPanel;
