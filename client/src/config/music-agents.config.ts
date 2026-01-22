/**
 * Music Agent Configuration
 * Defines music-focused discussion participants for collaborative Strudel improvement
 */

export interface MusicDiscussionParticipant {
  id: string;
  agentId: string;
  role: string;
  weight: number;
  perspective: string;
}

/**
 * Generative prompt template for participants - asks them to propose code improvements
 */
export const MUSIC_CONTRIBUTION_TEMPLATE = `You are a {{role}} improving Strudel music code.
Your expertise: {{perspective}}

CURRENT CODE TO IMPROVE:
{{topic}}

{{#if previousRound}}
PREVIOUS ROUND'S SYNTHESIZED CODE:
\`\`\`strudel
{{previousRound.synthesis}}
\`\`\`

Other experts' suggestions from last round:
{{#each previousRound.contributions}}
- {{this.role}}: {{this.content}}
{{/each}}
{{/if}}

YOUR TASK:
1. Analyze the code from your {{role}} perspective
2. Propose SPECIFIC improvements with complete code
3. Focus on your area of expertise
4. Keep changes targeted but impactful

OUTPUT FORMAT:
1. Brief analysis (2-3 sentences max)
2. Your improved version as COMPLETE runnable Strudel code in a code block
3. Why this improves the music (1-2 sentences)
4. Agreement score: X/10

CRITICAL SYNTAX RULES:
- Every ( must have matching )
- Every [ must have matching ]
- note() MUST be followed by .s("sample") - e.g., note("c4").s("bass")
- Start with stack( or slowcat( and end with )
- Valid samples: bd, sd, hh, oh, cp, 808bd, 808sd, 808hc, 808oh, bass, bass1, pad, casio, superpiano, moog, juno, saw, arpy, pluck
- NEVER use "piano" - use "casio" or "superpiano" instead
- NEVER use "sawtooth" - use "saw" instead
- Modifiers: .gain(0-1), .lpf(100-8000), .room(0-1), .delay(0-0.5), .pan(-1 to 1)

VALID EXAMPLE:
\`\`\`strudel
stack(
  s("bd*4").gain(0.8),
  s("~ sd ~ sd").gain(0.7),
  note("<c3 e3 g3>").s("bass").gain(0.6).lpf(800)
)
\`\`\`

INVALID - note() without .s():
note("<c3 e3>").gain(0.6)  // WRONG!

Include your complete code in a \`\`\`strudel code block.`;

/**
 * Synthesis prompt template - combines expert suggestions into unified code
 */
export const MUSIC_SYNTHESIS_TEMPLATE = `You are integrating expert suggestions into improved Strudel music code.

ORIGINAL CODE BEING IMPROVED:
{{topic}}

EXPERT SUGGESTIONS THIS ROUND:
{{#each contributions}}
### {{this.role}}:
{{this.content}}

{{/each}}

YOUR TASK:
1. Analyze each expert's code suggestion
2. Combine the BEST improvements into ONE unified version
3. Resolve any conflicts between suggestions
4. VERIFY the final code has valid syntax before outputting

RESPOND WITH JSON ONLY:
{
  "synthesis": "stack(s(\\"bd\\").gain(0.8), s(\\"hh*4\\").gain(0.4))",
  "consensusScore": 0.X,
  "improvements": ["improvement 1", "improvement 2"],
  "tradeoffs": ["any tradeoffs made"]
}

CRITICAL SYNTAX RULES (MUST FOLLOW):
1. Every opening ( MUST have a matching closing )
2. Every opening [ MUST have a matching closing ]
3. note() MUST ALWAYS be followed by .s("samplename") - e.g., note("c4").s("casio")
4. Use double quotes inside strings, escaped as \\"
5. Start with stack( or slowcat( and end with matching )
6. Valid samples ONLY: bd, sd, hh, oh, cp, 808bd, 808sd, 808hc, 808oh, bass, bass1, pad, casio, superpiano, moog, juno, saw, arpy, pluck
7. NEVER use "piano" (use "casio" or "superpiano"), NEVER use "sawtooth" (use "saw")
8. NO line breaks inside the synthesis string
9. Count your parentheses before outputting!

VALID EXAMPLE:
stack(s("bd*4").gain(0.8), s("~ sd ~ sd").gain(0.7), note("<c3 e3 g3>").s("bass").gain(0.6))

INVALID (missing .s() on note):
note("<c3 e3>").gain(0.6)  // WRONG - needs .s("sample")

INVALID (unclosed parenthesis):
stack(s("bd").gain(0.8)  // WRONG - missing closing )`;

/**
 * Four music-focused agents for collaborative Strudel improvement
 * Each proposes specific code improvements from their specialty
 */
export const MUSIC_DISCUSSION_PARTICIPANTS: MusicDiscussionParticipant[] = [
  {
    id: 'composer',
    agentId: 'agent_claude_default',
    role: 'composer',
    weight: 1.2,
    perspective: `Improve melody, harmony, and chord progressions. Add musical interest through note choices, voicings, and melodic movement. Use note() patterns with appropriate scales and chord tones.`,
  },
  {
    id: 'rhythm-expert',
    agentId: 'agent_claude_default',
    role: 'rhythm-expert',
    weight: 1.2,
    perspective: `Improve groove and timing. Fix kick/snare placement, hat patterns, and rhythmic feel. Make it more danceable with proper beat placement and syncopation.`,
  },
  {
    id: 'sound-designer',
    agentId: 'agent_claude_default',
    role: 'sound-designer',
    weight: 1.0,
    perspective: `Improve sonic texture. Adjust filters (.lpf, .hpf), effects (.room, .delay), gain staging, and sample choices. Create better space and depth in the mix.`,
  },
  {
    id: 'music-critic',
    agentId: 'agent_claude_default',
    role: 'music-critic',
    weight: 0.8,
    perspective: `Identify remaining weaknesses and fix them. Suggest code fixes for issues others missed. Ensure the code is syntactically valid and sounds cohesive.`,
  },
];

/**
 * Discussion configuration for generative music collaboration
 */
export const MUSIC_DISCUSSION_CONFIG = {
  maxRounds: 3,
  consensusStrategy: 'facilitator' as const,
  convergenceThreshold: 0.80,
  facilitatorAgentId: 'agent_claude_default',
  contributionPromptTemplate: MUSIC_CONTRIBUTION_TEMPLATE,
  synthesisPromptTemplate: MUSIC_SYNTHESIS_TEMPLATE,
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
 * Builds the discussion topic for collaborative music improvement
 * Frames the task as generative (propose improvements) not evaluative
 */
export function buildMusicDiscussionTopic(
  originalCode: string,
  improvedCode: string,
  iterationCount: number,
  finalScore: number
): string {
  return `STRUDEL CODE TO IMPROVE:
\`\`\`strudel
${improvedCode}
\`\`\`

CONTEXT:
- This code was auto-improved ${iterationCount} time(s) with quality score ${Math.round(finalScore * 100)}%
- Original input: ${originalCode.length > 80 ? originalCode.substring(0, 80) + '...' : originalCode}

YOUR GOAL: Collaborate with other experts to make this code BETTER.
Each expert should propose specific improvements from their specialty.
The facilitator will synthesize the best suggestions into a unified version.

CONSTRAINTS:
- Use only valid Strudel syntax
- Valid samples: bd, sd, hh, oh, cp, 808bd, 808sd, 808hc, 808oh, bass, bass1, pad, casio, superpiano, moog, juno, saw, arpy, pluck
- NEVER use "piano" (use "casio" or "superpiano"), NEVER use "sawtooth" (use "saw")
- Modifiers: .gain(), .lpf(), .hpf(), .room(), .delay(), .pan(), .slow(), .fast()
- Keep the musical style consistent but enhance it
- Each round should produce improved code`;
}
