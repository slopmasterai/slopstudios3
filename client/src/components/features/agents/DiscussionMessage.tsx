import { useMemo, useState } from 'react';
import { Bot, Sparkles, Code, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { DiscussionContribution } from '@backend/types/agent.types';

// Extract code blocks from content
function extractCodeBlocks(content: string): { text: string; code: string | null }[] {
  const parts: { text: string; code: string | null }[] = [];

  // Match markdown code blocks or standalone Strudel patterns
  const codeBlockRegex = /```(?:strudel|javascript|js)?\n?([\s\S]*?)```/g;
  const strudelPatternRegex = /^((?:s|note|stack|slowcat)\([^]*?\))$/gm;

  let lastIndex = 0;
  let match;

  // First try markdown code blocks
  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: content.slice(lastIndex, match.index), code: null });
    }
    parts.push({ text: '', code: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  // If no markdown blocks found, look for standalone Strudel patterns
  if (parts.length === 0) {
    lastIndex = 0;
    while ((match = strudelPatternRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: content.slice(lastIndex, match.index), code: null });
      }
      parts.push({ text: '', code: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), code: null });
  }

  // If nothing was parsed, return the whole content as text
  if (parts.length === 0) {
    parts.push({ text: content, code: null });
  }

  return parts;
}

// Role color mapping for consistent styling
const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critic: {
    bg: 'bg-red-500/10',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-500/30',
  },
  supporter: {
    bg: 'bg-green-500/10',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-500/30',
  },
  expert: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-500/30',
  },
  mediator: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-700 dark:text-purple-400',
    border: 'border-purple-500/30',
  },
  'devils-advocate': {
    bg: 'bg-orange-500/10',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-500/30',
  },
  analyst: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-700 dark:text-cyan-400',
    border: 'border-cyan-500/30',
  },
  creative: {
    bg: 'bg-pink-500/10',
    text: 'text-pink-700 dark:text-pink-400',
    border: 'border-pink-500/30',
  },
  pragmatist: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-700 dark:text-yellow-400',
    border: 'border-yellow-500/30',
  },
  facilitator: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-700 dark:text-indigo-400',
    border: 'border-indigo-500/30',
  },
  // Music-focused roles
  composer: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-700 dark:text-violet-400',
    border: 'border-violet-500/30',
  },
  'rhythm-expert': {
    bg: 'bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-500/30',
  },
  'sound-designer': {
    bg: 'bg-teal-500/10',
    text: 'text-teal-700 dark:text-teal-400',
    border: 'border-teal-500/30',
  },
  'music-critic': {
    bg: 'bg-rose-500/10',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-500/30',
  },
};

const DEFAULT_COLOR = { bg: 'bg-muted/50', text: 'text-foreground', border: 'border-border' };

// Role badge variant mapping
const ROLE_BADGE_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
> = {
  critic: 'destructive',
  supporter: 'success',
  expert: 'info',
  mediator: 'secondary',
  'devils-advocate': 'warning',
  analyst: 'info',
  creative: 'secondary',
  pragmatist: 'warning',
  facilitator: 'default',
  // Music-focused roles
  composer: 'secondary',
  'rhythm-expert': 'warning',
  'sound-designer': 'info',
  'music-critic': 'destructive',
};

interface DiscussionMessageProps {
  contribution: DiscussionContribution;
  isSynthesis?: boolean;
  showTimestamp?: boolean;
  onApplyCode?: (code: string) => void;
  className?: string;
}

// Code block component with expand/collapse and apply
function CodeBlock({
  code,
  onApply,
}: {
  code: string;
  onApply?: (code: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = code.length > 100 || code.split('\n').length > 3;

  return (
    <div className="my-2 rounded-md border overflow-hidden bg-muted/50">
      <div
        className="flex items-center justify-between p-2 bg-muted/80 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Code className="h-3 w-3" />
          <span>Strudel Code</span>
        </div>
        <div className="flex items-center gap-1">
          {onApply && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onApply(code);
              }}
            >
              Apply
            </Button>
          )}
          {isLong && (
            isExpanded ? (
              <X className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )
          )}
        </div>
      </div>
      <div className={cn('p-2 overflow-x-auto', !isExpanded && isLong && 'max-h-16')}>
        <pre className="text-xs font-mono whitespace-pre-wrap">{code}</pre>
      </div>
    </div>
  );
}

export function DiscussionMessage({
  contribution,
  isSynthesis = false,
  showTimestamp = true,
  onApplyCode,
  className,
}: DiscussionMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const roleColors = ROLE_COLORS[contribution.role] || DEFAULT_COLOR;
  const badgeVariant = ROLE_BADGE_VARIANTS[contribution.role] || 'outline';

  const contentParts = useMemo(() => {
    return extractCodeBlocks(contribution.content);
  }, [contribution.content]);

  // Get plain text preview (first 100 chars)
  const textPreview = useMemo(() => {
    const allText = contentParts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join(' ')
      .trim();
    if (allText.length > 100) {
      return allText.slice(0, 100) + '...';
    }
    return allText;
  }, [contentParts]);

  // Check if content is long enough to need expansion
  const needsExpansion = contribution.content.length > 120;

  // Render content with code blocks
  const renderContent = () => (
    <div className="pl-10">
      {contentParts.map((part, index) =>
        part.code ? (
          <CodeBlock key={index} code={part.code} onApply={onApplyCode} />
        ) : part.text ? (
          <p key={index} className="text-sm leading-relaxed whitespace-pre-wrap">
            {part.text}
          </p>
        ) : null
      )}
    </div>
  );

  if (isSynthesis) {
    return (
      <div
        className={cn(
          'rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-2',
          className
        )}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-primary">Synthesis</span>
            {showTimestamp && contribution.timestamp && (
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(contribution.timestamp)}
              </span>
            )}
          </div>
          {contribution.agreementScore !== undefined && (
            <Badge variant="default" className="ml-auto">
              {Math.round(contribution.agreementScore * 100)}% Agreement
            </Badge>
          )}
        </div>
        {renderContent()}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        roleColors.bg,
        roleColors.border,
        needsExpansion && 'cursor-pointer hover:bg-accent/30',
        className
      )}
      onClick={() => needsExpansion && setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full flex-shrink-0',
            roleColors.bg,
            roleColors.text
          )}
        >
          <Bot className="h-3 w-3" />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Badge variant={badgeVariant} className="capitalize text-xs flex-shrink-0">
            {contribution.role.replace('-', ' ')}
          </Badge>
          {!isExpanded && needsExpansion && (
            <span className="text-xs text-muted-foreground truncate flex-1">
              {textPreview}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {contribution.agreementScore !== undefined && (
            <Badge
              variant={
                contribution.agreementScore >= 0.8
                  ? 'success'
                  : contribution.agreementScore >= 0.5
                    ? 'warning'
                    : 'destructive'
              }
              className="text-xs"
            >
              {Math.round(contribution.agreementScore * 100)}%
            </Badge>
          )}
          {needsExpansion && (
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180'
              )}
            />
          )}
        </div>
      </div>
      {(isExpanded || !needsExpansion) && (
        <div className={cn('mt-2', roleColors.text)}>{renderContent()}</div>
      )}
    </div>
  );
}

// Synthesis message variant for round completion
interface SynthesisMessageProps {
  synthesis: string;
  consensusScore?: number;
  timestamp: string;
  onApplyCode?: (code: string) => void;
  className?: string;
}

export function SynthesisMessage({
  synthesis,
  consensusScore,
  timestamp,
  onApplyCode,
  className,
}: SynthesisMessageProps) {
  return (
    <DiscussionMessage
      contribution={{
        participantId: 'facilitator',
        role: 'facilitator',
        content: synthesis,
        agreementScore: consensusScore,
        timestamp,
      }}
      isSynthesis
      onApplyCode={onApplyCode}
      className={className}
    />
  );
}

// Typing indicator for in-progress contributions
interface TypingIndicatorProps {
  role: string;
  participantId: string;
  className?: string;
}

export function TypingIndicator({ role, participantId, className }: TypingIndicatorProps) {
  const roleColors = ROLE_COLORS[role] || DEFAULT_COLOR;
  const badgeVariant = ROLE_BADGE_VARIANTS[role] || 'outline';

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-colors animate-pulse',
        roleColors.bg,
        roleColors.border,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            roleColors.bg,
            roleColors.text
          )}
        >
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariant} className="capitalize">
              {role.replace('-', ' ')}
            </Badge>
            <span className="text-xs text-muted-foreground">{participantId}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 pl-10 pt-2">
        <span
          className="h-2 w-2 rounded-full bg-current animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-current animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-current animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
}

export default DiscussionMessage;
