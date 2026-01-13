/**
 * Music Agent Configuration
 * Defines music-focused discussion participants for the Strudel improvement flow
 */

export interface MusicDiscussionParticipant {
  id: string;
  agentId: string;
  role: string;
  weight: number;
  perspective: string;
}

/**
 * Four music-focused agents for evaluating Strudel pattern improvements
 */
export const MUSIC_DISCUSSION_PARTICIPANTS: MusicDiscussionParticipant[] = [
  {
    id: 'composer',
    agentId: 'agent_claude_default',
    role: 'composer',
    weight: 1.2,
    perspective: `You are a Composer evaluating Strudel live-coding music patterns.
Focus on: melody, harmony, chord progressions, melodic lines, and overall musical structure.
Evaluate how well the musical elements work together and if the arrangement makes sense.
Consider: Does the pattern have a clear musical direction? Are the melodic choices interesting?`,
  },
  {
    id: 'rhythm-expert',
    agentId: 'agent_claude_default',
    role: 'rhythm-expert',
    weight: 1.2,
    perspective: `You are a Rhythm Expert evaluating Strudel live-coding music patterns.
Focus on: beats, timing, groove, kick/snare placement, hi-hat patterns, and rhythmic feel.
Evaluate the rhythmic foundation and how it supports the overall track.
Consider: Is the groove solid? Are the rhythmic patterns engaging? Is the timing correct?`,
  },
  {
    id: 'sound-designer',
    agentId: 'agent_claude_default',
    role: 'sound-designer',
    weight: 1.0,
    perspective: `You are a Sound Designer evaluating Strudel live-coding music patterns.
Focus on: effects, textures, filters, reverb, delay, and overall sonic palette.
Evaluate the sound choices and how effects are used to create atmosphere.
Consider: Are the sample choices appropriate? Could effects enhance the sound?`,
  },
  {
    id: 'music-critic',
    agentId: 'agent_claude_default',
    role: 'music-critic',
    weight: 0.8,
    perspective: `You are a Music Critic and devil's advocate evaluating Strudel patterns.
Your job is to identify weaknesses, potential issues, and areas that could fail.
Challenge assumptions about whether this improvement is actually better.
Consider: What could go wrong? Is this improvement actually meaningful?`,
  },
];

/**
 * Discussion configuration for music pattern evaluation
 */
export const MUSIC_DISCUSSION_CONFIG = {
  maxRounds: 2,
  consensusStrategy: 'weighted' as const,
  convergenceThreshold: 0.75,
};

/**
 * Quality criteria for self-critique phase (kept consistent with current implementation)
 */
export const MUSIC_QUALITY_CRITERIA = [
  {
    name: 'syntax_validity',
    weight: 0.25,
    description: 'Valid Strudel syntax with no errors',
    evaluationPrompt: 'Check if the pattern uses valid Strudel syntax and functions.',
    threshold: 0.9,
  },
  {
    name: 'musical_structure',
    weight: 0.25,
    description: 'Clear musical sections and coherent structure',
    evaluationPrompt: 'Evaluate the overall musical structure and arrangement.',
    threshold: 0.7,
  },
  {
    name: 'rhythmic_quality',
    weight: 0.2,
    description: 'Good rhythmic patterns with proper beat placement',
    evaluationPrompt: 'Assess the rhythmic foundation and groove quality.',
    threshold: 0.7,
  },
  {
    name: 'harmonic_coherence',
    weight: 0.15,
    description: 'Musical harmony and note choices',
    evaluationPrompt: 'Evaluate harmonic choices and melodic coherence.',
    threshold: 0.6,
  },
  {
    name: 'dynamic_interest',
    weight: 0.15,
    description: 'Use of dynamics, filters, and effects',
    evaluationPrompt: 'Assess use of dynamics, effects, and sonic variety.',
    threshold: 0.6,
  },
];

/**
 * Builds the discussion topic for music expert evaluation
 */
export function buildMusicDiscussionTopic(
  originalCode: string,
  improvedCode: string,
  iterationCount: number,
  finalScore: number
): string {
  return `You are evaluating a Strudel live-coding music pattern that has been improved by an AI agent.

## ORIGINAL PATTERN:
\`\`\`javascript
${originalCode}
\`\`\`

## IMPROVED PATTERN:
\`\`\`javascript
${improvedCode}
\`\`\`

## IMPROVEMENT DETAILS:
- Went through ${iterationCount} iteration(s) of self-critique
- Final quality score: ${Math.round(finalScore * 100)}%

## YOUR EVALUATION TASK:
From your specific expertise and perspective:
1. Is this improvement genuinely better than the original?
2. What specific strengths do you see in the improved version?
3. What issues, concerns, or weaknesses do you identify?
4. What specific changes would you suggest for further improvement?

End your response with an agreement score on a scale of 1-10:
"Agreement: X/10" where X indicates your confidence that this improvement should be applied.
- 1-3: Improvement is worse or has major issues
- 4-6: Improvement is neutral or has notable concerns
- 7-10: Improvement is good and should be applied`;
}
