/**
 * Discussion Service
 * Implements multi-agent discussion and consensus-building pattern
 */

import { EventEmitter } from 'events';
import { generateRequestId } from '../utils/index.js';
import { logger } from '../utils/logger.js';

import {
  getDefaultAgent,
  getAgent,
  executeAgent,
} from './agent-registry.service.js';
import {
  recordAgentMetric,
  recordDiscussionMetric,
  getDiscussionMetrics as getDiscussionMetricsFromAgentMetrics,
} from './agent-metrics.service.js';
import {
  getTemplate,
  BUILTIN_TEMPLATE_IDS,
} from './prompt-template.service.js';
import {
  createContext,
  setContextValue,
  clearContext,
} from './workflow-context.service.js';
import { getRedisClient, isRedisConnected } from './redis.service.js';

import type {
  OrchestrationRequest,
  OrchestrationTaskResult,
  DiscussionConfig,
  DiscussionResult,
  DiscussionRound,
  DiscussionContribution,
  DiscussionParticipant,
  ConsensusStrategy,
} from '../types/agent.types.js';

// Redis key prefixes
const DISCUSSION_STATE_PREFIX = 'discussion:state:';
const DISCUSSION_ROUNDS_PREFIX = 'discussion:rounds:';
const DISCUSSION_CONTRIBUTIONS_PREFIX = 'discussion:contributions:';

// Event emitter for discussion events
export const discussionEvents = new EventEmitter();

// Service configuration
interface DiscussionServiceConfig {
  defaultMaxRounds: number;
  defaultMaxParticipants: number;
  defaultConvergenceThreshold: number;
  defaultConsensusStrategy: ConsensusStrategy;
  defaultTimeoutMs: number;
  participantTimeoutMs: number;
  maxParallelParticipants: number;
}

let serviceConfig: DiscussionServiceConfig = {
  defaultMaxRounds: parseInt(process.env['AGENT_DISCUSSION_MAX_ROUNDS'] ?? '5', 10),
  defaultMaxParticipants: parseInt(process.env['AGENT_DISCUSSION_MAX_PARTICIPANTS'] ?? '10', 10),
  defaultConvergenceThreshold: parseFloat(
    process.env['AGENT_DISCUSSION_CONVERGENCE_THRESHOLD'] ?? '0.85'
  ),
  defaultConsensusStrategy: (process.env['AGENT_DISCUSSION_CONSENSUS_STRATEGY'] as ConsensusStrategy) ?? 'majority',
  defaultTimeoutMs: parseInt(process.env['AGENT_DISCUSSION_TIMEOUT_MS'] ?? '900000', 10),
  participantTimeoutMs: 120000, // 2 minutes per participant
  maxParallelParticipants: 5,
};

// Default prompt templates
const DEFAULT_PARTICIPANT_TEMPLATE = `You are participating in a collaborative discussion as a {{role}}.
Your perspective: {{perspective}}

Topic: {{topic}}

{{#if previousRound}}
Previous round synthesis:
{{previousRound.synthesis}}

Previous contributions from other participants:
{{#each previousRound.contributions}}
- {{this.role}}: {{this.content}}
{{/each}}
{{else}}
This is the first round of discussion.
{{/if}}

Provide your contribution considering:
1. The topic and overall goal
2. Previous participants' points (if any)
3. Your unique perspective as {{role}}
4. Areas of agreement and disagreement

Be constructive, specific, and aim to advance the discussion toward consensus.
End your contribution with a brief statement of your agreement level (1-10) with the current direction.`;

const DEFAULT_FACILITATOR_TEMPLATE = `You are the facilitator synthesizing contributions from multiple participants.

Topic: {{topic}}

Round {{round}} contributions:
{{#each contributions}}
Participant ({{this.role}}): {{this.content}}
{{/each}}

Your task:
1. Identify common themes and areas of agreement
2. Note key disagreements and differing perspectives
3. Synthesize a coherent position that addresses all viewpoints
4. Assess the overall consensus level

Respond with:
1. A synthesis that incorporates the best ideas from all participants
2. A consensus score from 0 to 1 indicating the level of agreement
3. Key points that need further discussion (if any)

Format your response as JSON:
{
  "synthesis": "Your synthesized position...",
  "consensusScore": 0.75,
  "agreements": ["point 1", "point 2"],
  "disagreements": ["point 1"],
  "nextSteps": ["suggestion 1"]
}`;

/**
 * Gets the participant template content, preferring registered template with fallback
 */
async function getParticipantTemplateContent(): Promise<string> {
  try {
    const template = await getTemplate(BUILTIN_TEMPLATE_IDS.DISCUSSION_PARTICIPANT);
    if (template) {
      return template.content;
    }
  } catch (error) {
    logger.debug({ error }, 'Failed to get participant template from registry, using default');
  }
  return DEFAULT_PARTICIPANT_TEMPLATE;
}

/**
 * Gets the facilitator template content, preferring registered template with fallback
 */
async function getFacilitatorTemplateContent(): Promise<string> {
  try {
    const template = await getTemplate(BUILTIN_TEMPLATE_IDS.DISCUSSION_FACILITATOR);
    if (template) {
      return template.content;
    }
  } catch (error) {
    logger.debug({ error }, 'Failed to get facilitator template from registry, using default');
  }
  return DEFAULT_FACILITATOR_TEMPLATE;
}

/**
 * Initializes the discussion service
 */
export function initializeDiscussionService(
  config?: Partial<DiscussionServiceConfig>
): void {
  if (config) {
    serviceConfig = { ...serviceConfig, ...config };
  }

  logger.info(
    {
      defaultMaxRounds: serviceConfig.defaultMaxRounds,
      defaultMaxParticipants: serviceConfig.defaultMaxParticipants,
      defaultConvergenceThreshold: serviceConfig.defaultConvergenceThreshold,
    },
    'Discussion service initialized'
  );
}

/**
 * Generates a unique discussion execution ID
 */
function generateDiscussionId(): string {
  return generateRequestId().replace('req_', 'discussion_');
}

/**
 * Builds participant prompt from template
 */
function buildParticipantPrompt(
  template: string,
  participant: DiscussionParticipant,
  topic: string,
  previousRound?: DiscussionRound
): string {
  let prompt = template
    .replace(/\{\{role\}\}/g, participant.role)
    .replace(/\{\{perspective\}\}/g, participant.perspective ?? 'General perspective')
    .replace(/\{\{topic\}\}/g, topic);

  // Handle previous round section
  if (previousRound) {
    const previousContributions = previousRound.contributions
      .map((c) => `- ${c.role}: ${c.content}`)
      .join('\n');

    prompt = prompt
      .replace(/\{\{#if previousRound\}\}([\s\S]*?)\{\{else\}\}[\s\S]*?\{\{\/if\}\}/g, '$1')
      .replace(/\{\{previousRound\.synthesis\}\}/g, previousRound.synthesis ?? 'No synthesis available')
      .replace(/\{\{#each previousRound\.contributions\}\}[\s\S]*?\{\{\/each\}\}/g, previousContributions);
  } else {
    prompt = prompt.replace(
      /\{\{#if previousRound\}\}[\s\S]*?\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
      '$1'
    );
  }

  return prompt;
}

/**
 * Builds facilitator prompt from template
 */
function buildFacilitatorPrompt(
  template: string,
  topic: string,
  round: number,
  contributions: DiscussionContribution[]
): string {
  const contributionsStr = contributions
    .map((c) => `Participant (${c.role}): ${c.content}`)
    .join('\n\n');

  return template
    .replace(/\{\{topic\}\}/g, topic)
    .replace(/\{\{round\}\}/g, String(round))
    .replace(/\{\{#each contributions\}\}[\s\S]*?\{\{\/each\}\}/g, contributionsStr);
}

/**
 * Extracts agreement score from participant contribution
 */
function extractAgreementScore(content: string): number {
  // Look for agreement patterns like "agreement: 8/10", "agreement level: 7", etc.
  const patterns = [
    /agreement\s*(?:level|score)?[:\s]*(\d+(?:\.\d+)?)\s*(?:\/\s*10)?/i,
    /(\d+(?:\.\d+)?)\s*(?:\/\s*10)?\s*agreement/i,
    /agree\s*(?:at|with)?\s*(?:a\s*)?(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const score = parseFloat(match[1]);
      // Normalize to 0-1 scale
      return score > 1 ? score / 10 : score;
    }
  }

  // Default to moderate agreement if not found
  return 0.5;
}

/**
 * Calculates consensus score based on strategy
 */
export function evaluateConsensus(
  contributions: DiscussionContribution[],
  strategy: ConsensusStrategy,
  participants: DiscussionParticipant[],
  facilitatorSynthesis?: { consensusScore?: number }
): number {
  if (contributions.length === 0) {
    return 0;
  }

  switch (strategy) {
    case 'unanimous': {
      // All participants must agree at high level
      const scores = contributions.map((c) => c.agreementScore ?? 0.5);
      const minScore = Math.min(...scores);
      return minScore >= 0.8 ? minScore : minScore * 0.5;
    }

    case 'majority': {
      // Average of all agreement scores
      const scores = contributions.map((c) => c.agreementScore ?? 0.5);
      return scores.reduce((sum, s) => sum + s, 0) / scores.length;
    }

    case 'weighted': {
      // Weighted average based on participant weights
      // participantId can be either supplied id or index-based fallback (participant_N)
      let totalWeight = 0;
      let weightedSum = 0;

      // Build lookup map: participant.id -> participant (for those with supplied ids)
      const participantById = new Map<string, DiscussionParticipant>();
      for (let i = 0; i < participants.length; i++) {
        const p = participants[i]!;
        // Map by supplied id if present
        if (p.id) {
          participantById.set(p.id, p);
        }
        // Also map by fallback index-based id
        participantById.set(`participant_${i}`, p);
      }

      for (const contribution of contributions) {
        const participant = participantById.get(contribution.participantId);
        const weight = participant?.weight ?? 1;
        const score = contribution.agreementScore ?? 0.5;

        weightedSum += score * weight;
        totalWeight += weight;
      }

      return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    case 'facilitator': {
      // Use facilitator's assessed consensus score
      return facilitatorSynthesis?.consensusScore ?? 0.5;
    }

    default:
      return 0.5;
  }
}

/**
 * Checks if discussion has converged
 */
export function checkConvergence(
  rounds: DiscussionRound[],
  threshold: number
): boolean {
  if (rounds.length === 0) {
    return false;
  }

  const lastRound = rounds[rounds.length - 1];
  if (!lastRound) {
    return false;
  }

  // Check if last round's consensus score meets threshold
  if ((lastRound.consensusScore ?? 0) >= threshold) {
    return true;
  }

  // Check for convergence trend (increasing consensus over last 3 rounds)
  if (rounds.length >= 3) {
    const recentRounds = rounds.slice(-3);
    const scores = recentRounds.map((r) => r.consensusScore ?? 0);
    const isIncreasing = scores.every((score, i) => i === 0 || score >= scores[i - 1]!);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    if (isIncreasing && avgScore >= threshold * 0.9) {
      return true;
    }
  }

  return false;
}

/**
 * Result from conducting a single discussion round
 */
export interface ConductRoundResult {
  round: DiscussionRound;
  taskResults: OrchestrationTaskResult[];
}

/**
 * Conducts a single discussion round
 */
export async function conductRound(
  executionId: string,
  topic: string,
  participants: DiscussionParticipant[],
  config: DiscussionConfig,
  roundNumber: number,
  previousRound?: DiscussionRound,
  userId: string = 'system'
): Promise<ConductRoundResult> {
  const roundStartTime = Date.now();

  // Emit round started event
  discussionEvents.emit('agent:discussion:round-started', {
    executionId,
    round: roundNumber,
    participantCount: participants.length,
    timestamp: new Date().toISOString(),
  });

  const contributions: DiscussionContribution[] = [];
  const taskResults: OrchestrationTaskResult[] = [];

  // Execute participants in parallel batches
  for (let i = 0; i < participants.length; i += serviceConfig.maxParallelParticipants) {
    const batch = participants.slice(i, i + serviceConfig.maxParallelParticipants);
    const batchStartIndex = i;

    const batchPromises = batch.map(async (participant, batchIndex) => {
      // Use supplied participant.id if provided, otherwise generate index-based fallback
      const uniqueParticipantId = participant.id ?? `participant_${batchStartIndex + batchIndex}`;
      const participantStartTime = Date.now();

      try {
        // Resolve agent
        let agentId = participant.agentId;
        let resolvedAgent = await getAgent(agentId);
        if (!resolvedAgent) {
          const defaultAgent = await getDefaultAgent('claude');
          if (!defaultAgent) {
            throw new Error(`No agent available for participant: ${participant.role}`);
          }
          agentId = defaultAgent.id;
          resolvedAgent = defaultAgent;
        }

        // Build participant prompt
        // Priority: contributionPromptTemplate > discussionPromptTemplate > registered template
        const participantTemplate = config.contributionPromptTemplate
          ?? config.discussionPromptTemplate
          ?? await getParticipantTemplateContent();
        const prompt = buildParticipantPrompt(
          participantTemplate,
          participant,
          topic,
          previousRound
        );

        // Execute participant
        const result = await executeAgent(agentId, {
          prompt,
          context: {
            userId,
            executionId,
            round: roundNumber,
            role: participant.role,
          },
          timeoutMs: serviceConfig.participantTimeoutMs,
        });

        const durationMs = Date.now() - participantStartTime;

        // Record agent metric
        void recordAgentMetric({
          agentId,
          agentType: resolvedAgent.type,
          success: result.success,
          responseTimeMs: durationMs,
          errorType: result.error,
        });

        if (result.success) {
          const content = typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);

          const agreementScore = extractAgreementScore(content);

          const contribution: DiscussionContribution = {
            participantId: uniqueParticipantId,
            role: participant.role,
            content,
            agreementScore,
            timestamp: new Date().toISOString(),
          };

          // Emit contribution event
          discussionEvents.emit('agent:discussion:contribution', {
            executionId,
            round: roundNumber,
            participantId: uniqueParticipantId,
            role: participant.role,
            content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
            timestamp: contribution.timestamp,
          });

          return {
            contribution,
            taskResult: {
              taskId: `${uniqueParticipantId}_round_${roundNumber}`,
              success: true,
              result: result.result,
              durationMs,
            },
          };
        } else {
          return {
            contribution: null,
            taskResult: {
              taskId: `${uniqueParticipantId}_round_${roundNumber}`,
              success: false,
              error: result.error,
              durationMs,
            },
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          contribution: null,
          taskResult: {
            taskId: `${uniqueParticipantId}_round_${roundNumber}`,
            success: false,
            error: errorMessage,
            durationMs: Date.now() - participantStartTime,
          },
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      taskResults.push(result.taskResult);
      if (result.contribution) {
        contributions.push(result.contribution);
      }
    }
  }

  // Synthesize contributions with facilitator
  let synthesis: string | undefined;
  let consensusScore = 0;

  // Guard: fail early if facilitator strategy is used without facilitatorAgentId
  if (config.consensusStrategy === 'facilitator' && !config.facilitatorAgentId) {
    throw new Error(
      'facilitatorAgentId is required when consensusStrategy is "facilitator"'
    );
  }

  if (config.consensusStrategy === 'facilitator' && config.facilitatorAgentId) {
    try {
      // Use caller-provided synthesis template or registered template
      const facilitatorTemplate = config.synthesisPromptTemplate ?? await getFacilitatorTemplateContent();
      const facilitatorPrompt = buildFacilitatorPrompt(
        facilitatorTemplate,
        topic,
        roundNumber,
        contributions
      );

      const facilitatorResult = await executeAgent(config.facilitatorAgentId, {
        prompt: facilitatorPrompt,
        context: {
          userId,
          executionId,
          round: roundNumber,
          type: 'facilitator',
        },
        timeoutMs: serviceConfig.participantTimeoutMs,
      });

      if (facilitatorResult.success) {
        const resultStr = typeof facilitatorResult.result === 'string'
          ? facilitatorResult.result
          : JSON.stringify(facilitatorResult.result);

        // Try to parse JSON response
        try {
          const jsonMatch = resultStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            synthesis = parsed.synthesis;
            consensusScore = parsed.consensusScore ?? 0.5;
          } else {
            synthesis = resultStr;
            consensusScore = evaluateConsensus(contributions, 'majority', participants);
          }
        } catch {
          synthesis = resultStr;
          consensusScore = evaluateConsensus(contributions, 'majority', participants);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ executionId, round: roundNumber, error: errorMessage }, 'Facilitator synthesis failed');
      consensusScore = evaluateConsensus(contributions, 'majority', participants);
    }
  } else {
    // Calculate consensus without facilitator
    consensusScore = evaluateConsensus(
      contributions,
      config.consensusStrategy,
      participants
    );
  }

  const roundDurationMs = Date.now() - roundStartTime;

  const discussionRound: DiscussionRound = {
    round: roundNumber,
    contributions,
    synthesis,
    consensusScore,
    durationMs: roundDurationMs,
    timestamp: new Date().toISOString(),
  };

  // Emit round completed event
  discussionEvents.emit('agent:discussion:round-completed', {
    executionId,
    round: roundNumber,
    synthesis,
    consensusScore,
    timestamp: new Date().toISOString(),
  });

  return { round: discussionRound, taskResults };
}

/**
 * Executes discussion pattern
 */
export async function executeDiscussion(
  request: OrchestrationRequest,
  config: DiscussionConfig
): Promise<DiscussionResult> {
  const executionId = request.id ?? generateDiscussionId();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Compute effective timeout using caller-provided value or service default
  const effectiveTimeoutMs = request.timeoutMs ?? serviceConfig.defaultTimeoutMs;

  // Defensive defaulting for maxRounds - ensure it's valid
  const maxRounds = (config.maxRounds && config.maxRounds >= 1)
    ? config.maxRounds
    : serviceConfig.defaultMaxRounds;

  // Defensive defaulting for convergenceThreshold
  const convergenceThreshold = config.convergenceThreshold ?? serviceConfig.defaultConvergenceThreshold;

  // Defensive defaulting for consensusStrategy - ensure it's never undefined
  const consensusStrategy = config.consensusStrategy ?? serviceConfig.defaultConsensusStrategy;

  // Create a normalized config with defaults applied
  const normalizedConfig: DiscussionConfig = {
    ...config,
    maxRounds,
    convergenceThreshold,
    consensusStrategy,
  };

  // Validate participants
  if (normalizedConfig.participants.length === 0) {
    throw new Error('Discussion requires at least one participant');
  }

  if (normalizedConfig.participants.length > serviceConfig.defaultMaxParticipants) {
    throw new Error(
      `Too many participants: ${normalizedConfig.participants.length} exceeds maximum of ${serviceConfig.defaultMaxParticipants}`
    );
  }

  // Validate facilitatorAgentId is required when consensusStrategy is 'facilitator'
  if (consensusStrategy === 'facilitator' && !normalizedConfig.facilitatorAgentId) {
    throw new Error(
      'facilitatorAgentId is required when consensusStrategy is "facilitator"'
    );
  }

  // Get topic from first task
  const task = request.tasks[0];
  const topic = task?.prompt ?? 'General discussion';

  logger.info(
    {
      executionId,
      maxRounds: normalizedConfig.maxRounds,
      participantCount: normalizedConfig.participants.length,
      consensusStrategy: normalizedConfig.consensusStrategy,
    },
    'Starting discussion execution'
  );

  // Create workflow context
  await createContext(executionId, {
    topic,
    config: normalizedConfig,
    userId: request.userId,
    participants: normalizedConfig.participants.map((p) => ({
      agentId: p.agentId,
      role: p.role,
    })),
  });

  const rounds: DiscussionRound[] = [];
  const taskResults: OrchestrationTaskResult[] = [];
  let converged = false;
  let finalConsensus = '';
  let finalConsensusScore = 0;

  const participantSummaries: Record<string, { contributions: number; agreementRate: number }> = {};

  // Initialize participant summaries using supplied participant.id or index-based fallback
  for (let i = 0; i < normalizedConfig.participants.length; i++) {
    const participant = normalizedConfig.participants[i]!;
    const uniqueParticipantId = participant.id ?? `participant_${i}`;
    participantSummaries[uniqueParticipantId] = {
      contributions: 0,
      agreementRate: 0,
    };
  }

  try {
    for (let roundNum = 1; roundNum <= normalizedConfig.maxRounds; roundNum++) {
      const previousRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;

      const roundResult = await conductRound(
        executionId,
        topic,
        normalizedConfig.participants,
        normalizedConfig,
        roundNum,
        previousRound,
        request.userId
      );

      rounds.push(roundResult.round);
      taskResults.push(...roundResult.taskResults);

      const round = roundResult.round;

      // Store round in context
      await setContextValue(executionId, `rounds.${roundNum}`, round);

      // Store round in Redis
      await storeRound(executionId, round);

      // Store contributions in Redis
      await storeContributions(executionId, roundNum, round.contributions);

      // Update participant summaries
      for (const contribution of round.contributions) {
        const summary = participantSummaries[contribution.participantId];
        if (summary) {
          summary.contributions++;
          summary.agreementRate =
            (summary.agreementRate * (summary.contributions - 1) + (contribution.agreementScore ?? 0.5)) /
            summary.contributions;
        }
      }

      finalConsensusScore = round.consensusScore ?? 0;
      finalConsensus = round.synthesis ?? '';

      // Check for convergence
      if (checkConvergence(rounds, normalizedConfig.convergenceThreshold!)) {
        converged = true;

        // Emit converged event
        discussionEvents.emit('agent:discussion:converged', {
          executionId,
          rounds: roundNum,
          consensusScore: finalConsensusScore,
          timestamp: new Date().toISOString(),
        });

        logger.info(
          { executionId, round: roundNum, consensusScore: finalConsensusScore },
          'Discussion converged'
        );
        break;
      }

      // Check timeout
      if (Date.now() - startTime > effectiveTimeoutMs) {
        logger.warn(
          { executionId, round: roundNum },
          'Discussion timeout reached'
        );
        break;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { executionId, error: errorMessage },
      'Discussion execution failed'
    );

    const result: DiscussionResult = {
      id: executionId,
      status: 'failed',
      pattern: 'discussion',
      taskResults,
      error: errorMessage,
      durationMs: Date.now() - startTime,
      startedAt,
      completedAt: new Date().toISOString(),
      rounds,
      finalConsensus,
      consensusScore: finalConsensusScore,
      converged: false,
      participantSummaries,
    };

    await saveDiscussionResult(result);
    await recordDiscussionMetric({
      executionId: result.id,
      userId: request.userId,
      rounds: result.rounds.length,
      participantCount: Object.keys(result.participantSummaries).length,
      converged: result.converged,
      consensusScore: result.consensusScore,
      durationMs: result.durationMs,
    });

    await clearContext(executionId);

    throw error;
  }

  const completedAt = new Date().toISOString();

  const result: DiscussionResult = {
    id: executionId,
    status: 'completed',
    pattern: 'discussion',
    taskResults,
    durationMs: Date.now() - startTime,
    startedAt,
    completedAt,
    rounds,
    finalConsensus,
    consensusScore: finalConsensusScore,
    converged,
    participantSummaries,
  };

  // Store result
  await saveDiscussionResult(result);
  await recordDiscussionMetric({
    executionId: result.id,
    userId: request.userId,
    rounds: result.rounds.length,
    participantCount: Object.keys(result.participantSummaries).length,
    converged: result.converged,
    consensusScore: result.consensusScore,
    durationMs: result.durationMs,
  });

  // Emit completed event
  discussionEvents.emit('agent:discussion:completed', {
    executionId,
    result,
    timestamp: completedAt,
  });

  // Cleanup context
  await clearContext(executionId);

  logger.info(
    {
      executionId,
      rounds: rounds.length,
      converged,
      consensusScore: finalConsensusScore,
      durationMs: result.durationMs,
    },
    'Discussion execution completed'
  );

  return result;
}

/**
 * Synthesizes contributions from a round
 */
export async function synthesizeContributions(
  contributions: DiscussionContribution[],
  facilitatorAgentId: string,
  topic: string,
  round: number,
  userId: string = 'system'
): Promise<string> {
  const facilitatorTemplate = await getFacilitatorTemplateContent();
  const facilitatorPrompt = buildFacilitatorPrompt(
    facilitatorTemplate,
    topic,
    round,
    contributions
  );

  const result = await executeAgent(facilitatorAgentId, {
    prompt: facilitatorPrompt,
    context: { userId, type: 'synthesis' },
    timeoutMs: serviceConfig.participantTimeoutMs,
  });

  if (!result.success) {
    throw new Error(`Synthesis failed: ${result.error}`);
  }

  const resultStr = typeof result.result === 'string'
    ? result.result
    : JSON.stringify(result.result);

  // Try to extract synthesis from JSON response
  try {
    const jsonMatch = resultStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.synthesis ?? resultStr;
    }
  } catch {
    // Return raw result if parsing fails
  }

  return resultStr;
}

/**
 * Stores a discussion round in Redis
 */
async function storeRound(
  executionId: string,
  round: DiscussionRound
): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.rpush(
      `${DISCUSSION_ROUNDS_PREFIX}${executionId}`,
      JSON.stringify(round)
    );
    await redis.expire(`${DISCUSSION_ROUNDS_PREFIX}${executionId}`, 86400); // 24 hours
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to store discussion round');
  }
}

/**
 * Stores contributions for a round in Redis
 */
async function storeContributions(
  executionId: string,
  round: number,
  contributions: DiscussionContribution[]
): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const key = `${DISCUSSION_CONTRIBUTIONS_PREFIX}${executionId}:${round}`;

    for (const contribution of contributions) {
      await redis.rpush(key, JSON.stringify(contribution));
    }

    await redis.expire(key, 86400); // 24 hours
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to store discussion contributions');
  }
}

/**
 * Saves discussion result to Redis
 */
async function saveDiscussionResult(result: DiscussionResult): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getRedisClient();
    await redis.set(
      `${DISCUSSION_STATE_PREFIX}${result.id}`,
      JSON.stringify(result),
      'EX',
      86400 // 24 hours
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn({ error: errorMessage }, 'Failed to save discussion result');
  }
}

/**
 * Gets discussion result by ID
 */
export async function getDiscussionResult(
  executionId: string
): Promise<DiscussionResult | null> {
  if (!isRedisConnected()) {
    return null;
  }

  const redis = getRedisClient();
  const data = await redis.get(`${DISCUSSION_STATE_PREFIX}${executionId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as DiscussionResult;
}

/**
 * Gets discussion rounds by execution ID
 */
export async function getDiscussionRounds(
  executionId: string
): Promise<DiscussionRound[]> {
  if (!isRedisConnected()) {
    return [];
  }

  const redis = getRedisClient();
  const data = await redis.lrange(`${DISCUSSION_ROUNDS_PREFIX}${executionId}`, 0, -1);

  return data.map((d) => JSON.parse(d) as DiscussionRound);
}

/**
 * Gets contributions for a specific round
 */
export async function getRoundContributions(
  executionId: string,
  round: number
): Promise<DiscussionContribution[]> {
  if (!isRedisConnected()) {
    return [];
  }

  const redis = getRedisClient();
  const key = `${DISCUSSION_CONTRIBUTIONS_PREFIX}${executionId}:${round}`;
  const data = await redis.lrange(key, 0, -1);

  return data.map((d) => JSON.parse(d) as DiscussionContribution);
}

/**
 * Gets discussion metrics
 * @deprecated Use getDiscussionMetrics from agent-metrics.service.ts instead
 */
export const getDiscussionMetrics = getDiscussionMetricsFromAgentMetrics;

/**
 * Gets service configuration
 */
export function getServiceConfig(): DiscussionServiceConfig {
  return { ...serviceConfig };
}

/**
 * Updates service configuration
 */
export function updateServiceConfig(config: Partial<DiscussionServiceConfig>): void {
  serviceConfig = { ...serviceConfig, ...config };
  logger.info('Discussion service configuration updated');
}

export default {
  initializeDiscussionService,
  executeDiscussion,
  conductRound,
  synthesizeContributions,
  evaluateConsensus,
  checkConvergence,
  getDiscussionResult,
  getDiscussionRounds,
  getRoundContributions,
  getDiscussionMetrics,
  getServiceConfig,
  updateServiceConfig,
  discussionEvents,
};
