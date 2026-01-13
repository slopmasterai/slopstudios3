/**
 * Music Improvement Hook
 * Orchestrates the two-phase improvement flow:
 * 1. Self-Critique: Single agent iteratively improves the music
 * 2. Discussion: Multiple music-focused agents discuss the improvement
 */

import { useState, useCallback, useEffect } from 'react';
import { useSelfCritiqueStream, useSocketEmit } from '@/hooks/useSocket';
import { useDiscussionStream } from '@/hooks/useAgents';
import {
  MUSIC_DISCUSSION_PARTICIPANTS,
  MUSIC_DISCUSSION_CONFIG,
  MUSIC_QUALITY_CRITERIA,
  buildMusicDiscussionTopic,
} from '@/config/music-agents.config';

export type ImprovementPhase = 'idle' | 'critique' | 'discussion' | 'complete' | 'error';

export interface MusicImprovementState {
  phase: ImprovementPhase;
  critiqueExecutionId: string | null;
  discussionExecutionId: string | null;
  originalCode: string | null;
  improvedCode: string | null;
}

export interface CritiqueIteration {
  iteration: number;
  score: number;
  output: string;
  feedback: string;
}

/**
 * Hook that orchestrates the complete music improvement flow
 */
export function useMusicImprovement() {
  const [state, setState] = useState<MusicImprovementState>({
    phase: 'idle',
    critiqueExecutionId: null,
    discussionExecutionId: null,
    originalCode: null,
    improvedCode: null,
  });

  const { emit } = useSocketEmit();

  // Track critique phase
  const critiqueStream = useSelfCritiqueStream(state.critiqueExecutionId);

  // Track discussion phase
  const discussionStream = useDiscussionStream(state.discussionExecutionId);

  // Start the improvement flow
  const startImprovement = useCallback(
    (code: string, improvementPrompt: string) => {
      const executionId = `critique-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      setState({
        phase: 'critique',
        critiqueExecutionId: executionId,
        discussionExecutionId: null,
        originalCode: code,
        improvedCode: null,
      });

      emit('agent:critique:execute', {
        task: {
          id: executionId,
          agentType: 'claude',
          agentId: 'agent_claude_default',
          prompt: improvementPrompt,
        },
        config: {
          maxIterations: 3,
          qualityCriteria: MUSIC_QUALITY_CRITERIA,
          stopOnQualityThreshold: 0.85,
        },
        context: { originalCode: code },
      });
    },
    [emit]
  );

  // Trigger discussion when critique completes
  useEffect(() => {
    if (
      state.phase === 'critique' &&
      critiqueStream.isCompleted &&
      critiqueStream.finalOutput &&
      state.originalCode
    ) {
      const discussionId = `discussion-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Build discussion topic with context
      const topic = buildMusicDiscussionTopic(
        state.originalCode,
        critiqueStream.finalOutput,
        critiqueStream.iterations.length,
        critiqueStream.finalScore
      );

      setState((prev) => ({
        ...prev,
        phase: 'discussion',
        discussionExecutionId: discussionId,
        improvedCode: critiqueStream.finalOutput,
      }));

      emit('agent:discussion:execute', {
        topic,
        config: {
          ...MUSIC_DISCUSSION_CONFIG,
          participants: MUSIC_DISCUSSION_PARTICIPANTS,
        },
        context: {
          originalCode: state.originalCode,
          improvedCode: critiqueStream.finalOutput,
          critiqueIterations: critiqueStream.iterations.length,
          finalScore: critiqueStream.finalScore,
        },
      });
    }
  }, [
    state.phase,
    state.originalCode,
    critiqueStream.isCompleted,
    critiqueStream.finalOutput,
    critiqueStream.iterations.length,
    critiqueStream.finalScore,
    emit,
  ]);

  // Mark complete when discussion finishes
  useEffect(() => {
    if (state.phase === 'discussion' && discussionStream.isCompleted) {
      setState((prev) => ({ ...prev, phase: 'complete' }));
    }
  }, [state.phase, discussionStream.isCompleted]);

  // Handle critique error
  useEffect(() => {
    if (state.phase === 'critique' && critiqueStream.isError) {
      setState((prev) => ({ ...prev, phase: 'error' }));
    }
  }, [state.phase, critiqueStream.isError]);

  // Handle discussion error
  useEffect(() => {
    if (state.phase === 'discussion' && discussionStream.hasError) {
      setState((prev) => ({ ...prev, phase: 'error' }));
    }
  }, [state.phase, discussionStream.hasError]);

  // Reset the entire flow
  const reset = useCallback(() => {
    setState({
      phase: 'idle',
      critiqueExecutionId: null,
      discussionExecutionId: null,
      originalCode: null,
      improvedCode: null,
    });
  }, []);

  // Map critique iterations to display format
  const critiqueIterations: CritiqueIteration[] = critiqueStream.iterations.map((iter) => ({
    iteration: iter.iteration,
    score: iter.score,
    output: iter.output,
    feedback: iter.feedback,
  }));

  return {
    // Phase management
    phase: state.phase,
    originalCode: state.originalCode,
    improvedCode: state.improvedCode ?? critiqueStream.finalOutput,

    // Critique data
    critiqueIterations,
    critiqueStatus: critiqueStream.status,
    critiqueFinalOutput: critiqueStream.finalOutput,
    critiqueFinalScore: critiqueStream.finalScore,
    critiqueError: critiqueStream.error,
    isCritiqueRunning: state.phase === 'critique' && critiqueStream.isRunning,
    isCritiqueCompleted: critiqueStream.isCompleted,

    // Discussion data
    discussionRounds: discussionStream.rounds,
    discussionStatus: discussionStream.status,
    currentRound: discussionStream.currentRound,
    currentContributions: discussionStream.currentContributions,
    participantCount: discussionStream.participantCount,
    consensusScore: discussionStream.consensusScore,
    finalConsensus: discussionStream.result?.finalConsensus ?? null,
    isDiscussionRunning: state.phase === 'discussion' && discussionStream.isRunning,
    isDiscussionCompleted: discussionStream.isCompleted,
    discussionError: discussionStream.error,

    // Combined status
    isImproving: state.phase === 'critique' || state.phase === 'discussion',
    isComplete: state.phase === 'complete',
    hasError: state.phase === 'error',
    error: critiqueStream.error ?? discussionStream.error ?? null,

    // Actions
    startImprovement,
    reset,
  };
}

export default useMusicImprovement;
