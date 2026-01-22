import { get, post, del } from '@/lib/api';
import { stripMarkdownCodeFences } from '@/lib/utils';
import type {
  ClaudeCommand,
  ClaudeProcess,
  ClaudeMetrics,
  HealthStatus,
  PaginatedResult,
  PaginationParams,
} from '@/types';

export interface ExecuteCommandResponse {
  processId: string;
  output?: string;
  status: string;
}

export interface ElaborationResult {
  processId: string;
  elaboratedPrompt?: string;
  status: string;
}

export const claudeService = {
  /**
   * Execute a Claude command synchronously
   */
  async executeCommand(
    command: string,
    options?: ClaudeCommand['options']
  ): Promise<ExecuteCommandResponse> {
    return post<ExecuteCommandResponse>('/claude/execute', {
      prompt: command,
      model: options?.model,
      timeoutMs: options?.timeout,
    });
  },

  /**
   * Elaborate a simple music request into detailed musical terms
   * Step 1 of the two-step music generation process
   */
  async elaboratePrompt(
    simplePrompt: string,
    options?: ClaudeCommand['options']
  ): Promise<{ processId: string }> {
    const systemPrompt = `You convert short user music requests into a "Strudel-ready music brief" for a separate coding agent.

ROLE
You are a producer + arranger writing instructions that will be handed to an AI that writes Strudel code.

INPUT
A short user request like: "Create a sound that sounds like 'X' from 'Y' genre."

GOAL
Output a concise, Strudel-oriented prompt that tells a coding agent exactly what to build. Prioritize: tempo range, core instruments/layers, groove feel, loop length, variation plan, and effects/automation. Keep it practical and loop-based (Strudel-friendly), not an essay.

OUTPUT FORMAT (follow exactly)
Start with ONE line in this exact style:
"Generate Strudel code for a <genre/style> track that evokes <mood/scene>."

Then output these labeled lines (short, punchy, no paragraphs):
- Tempo: <single BPM or range>
- Time Signature: <e.g., 4/4, 3/4, 6/8>
- Instruments/Layers: <comma-separated list of the key layers/sounds>
- Mood: <3–6 adjectives + intended context (e.g., studying, club, cinematic)>
- Style/Groove: <feel descriptors + swing amount if relevant + any key rhythmic traits>
- Drum Pattern Notes: <very short—kick/snare/hat feel; mention syncopation/swing>
- Harmony: <key/scale + chord vibe or progression style (can be implied if unknown)>
- Melody/Lead: <how present it is; motif style; phrasing>
- Structure: <loop length in bars + variation plan, e.g., "8-bar loop; small change every 4 bars">
- Effects/Automation: <2–4 specific ideas: filter sweeps, reverb swells, delays, ducking/sidechain feel, bitcrush, etc.>
- Mixing/Texture: <1–2 notes: saturation, dust, width, space, punch>
- Comments Requirement: "Include comments describing each layer and its purpose."

RULES
- Do NOT write any Strudel code or syntax. This is only the prompt/brief for the coding agent.
- Prefer ranges and approximations over uncertainty. If the user didn't specify a key/tempo, choose one that fits the genre and mood.
- Keep the whole output under ~150 words. No extra headings beyond the labeled lines above.
- Reflect any explicit user constraints (artist reference, genre, era, instruments). If the request references a specific song/artist, translate it into musical traits (tempo range, drum feel, sound palette, harmony flavor) without naming copyrighted material in the output unless the user explicitly asked to.
- Make it "buildable": every line should help the Strudel agent make concrete choices.`;

    return post<{ processId: string }>('/claude/execute/async', {
      prompt: simplePrompt,
      systemPrompt,
      model: options?.model || 'claude-opus-4-5-20251101',
      timeoutMs: options?.timeout,
    }, { timeout: 300000 });
  },

  /**
   * Execute a Claude command asynchronously (returns immediately)
   * Step 2 of the two-step music generation process - generates Strudel code from elaborated prompt
   */
  async executeAsync(
    command: string,
    options?: ClaudeCommand['options']
  ): Promise<{ processId: string }> {
    const systemPrompt = `SYSTEM PROMPT (Strudel Code Generator — "Simple, High-Quality")

ROLE
You are an expert Strudel live-coding composer/arranger. You receive a "Strudel-ready music brief" (fixed labeled lines). Your job is to output a SIMPLE but accurate Strudel piece that matches the brief as closely as possible.

INPUT
A brief in exactly this shape:
Generate Strudel code for a <genre/style> track that evokes <mood/scene>.
- Tempo: ...
- Time Signature: ...
- Instruments/Layers: ...
- Mood: ...
- Style/Groove: ...
- Drum Pattern Notes: ...
- Harmony: ...
- Melody/Lead: ...
- Structure: ...
- Effects/Automation: ...
- Mixing/Texture: ...
- Comments Requirement: "Include comments describing each layer and its purpose."

OUTPUT (STRICT)
- Output ONLY a single executable Strudel/JS expression (no markdown fences, no prose before/after).
- Start the expression with: slowcat(
- Include brief JS comments (// ...) describing each layer and its purpose inside each section stack (to satisfy "Comments Requirement").
- No globals, no let/const, no helper functions, no .play(), no tempo setters (no setcps/setCps).
- Keep it SIMPLE: 3–5 layers max at any moment (drums + bass + harmony + optional lead + optional fx). Avoid clutter.

ALLOWED BUILDING BLOCKS (use ONLY these to avoid runtime errors)
- s("samplepattern")
- note("pitchpattern").s("samplename")
- Modifiers only: .gain(x) .lpf(x) .hpf(x) .room(x) .delay(x) .pan(x) .slow(n) .fast(n)
- Combinators only: stack(...) slowcat(...)
(Comments are allowed, but do not introduce any other functions.)

AVAILABLE SAMPLES (use ONLY these names)
Drums: bd, sd, hh, cp, hh27, cr, perc, tabla, hand, rm
Drum Machines: 808, 808bd, 808sd, 808hc, 808oh, clubkick
Bass: bass, bass1, bass2, bass3, jvbass, jungbass
Melodic: casio, arpy, pluck, sitar, gtr, jazz, pad, superpiano
Synth: sine, saw, moog, juno, hoover, stab, blip, bleep
Effects: noise, metal, industrial, glitch, space, wind
Voice: mouth, numbers, alphabet
Nature: birds, insect, crow, bubble
IMPORTANT: never use "piano" (use "casio" or "superpiano"), never use "sawtooth" (use "saw").

HOW TO TRANSLATE THE BRIEF (PRIORITIES)
1) Structure first (simple phrases, gentle variation)
- Read "Structure" for loop length and variation plan.
- Implement sections with slowcat( section1, section2, ... ).
- Each section is stack(layers...).slow(BARS).
- Default if unclear: 4 sections of 4 bars each (Intro 4, Main 8, Break 4, Outro 4) OR 3 sections (4, 8, 4). Keep total under ~24 bars.

2) Tempo without tempo setters
- Strudel has no global BPM here; use "Tempo" only to choose pattern density:
  • 60–90 BPM: simpler drums (hh*4 or hh*6 feel), longer notes, fewer hits.
  • 90–130 BPM: standard pop/house density (hh*8, steady backbeat).
  • 130–175 BPM: higher density (hh*16 or hats with occasional rolls), tighter bass rhythm.
- Never call a global tempo API.

3) Time signature + grid rule (avoid drift)
- 4/4: write 16-step bar patterns (16 tokens including ~).
- 3/4: write 12-step bar patterns.
- 6/8 or shuffle/triplet feel: use 12-step patterns and describe the "lilt" via placement (don't add swing functions).
- Keep all layers aligned in bar length.

4) Instruments/Layers mapping (keep minimal, match the brief)
- Drums: choose 3 core parts: kick (bd/808bd/clubkick), snare/clap (sd/808sd/cp), hats (hh/hh27/808hc/808oh).
- Bass: bass/jvbass/jungbass for electronic; bass1/bass3 for rounder; sine for subby.
- Harmony: pad/jazz/casio/superpiano (use chord blocks like "[c3,e3,g3]").
- Lead: moog/juno/arpy/pluck/bleep/blip (only if "Melody/Lead" says it's present).
- FX: noise/wind/glitch/space/metal for risers/air (sparingly).

5) Groove + drum notes (make it feel intentional)
- Use kick/snare placement to match the brief:
  • Four-on-the-floor: bd on each beat.
  • Backbeat: snare/clap on 2 and 4 (or equivalent).
  • Hip-hop: fewer kicks, more syncopation, hats with space.
  • Ambient: minimal drums or none; texture + pads.
- Keep patterns short, readable, and consistent.

6) Harmony + melody (simple, sticky, scale-correct)
- If "Harmony" gives a key/scale: honor it by choosing chord tones in that key.
- If not given: pick a safe key for the style (minor for moody, major for bright).
- Chords: use 2–4 chord loop via alternation:
  note("<[c3,eb3,g3] [ab2,c3,eb3] [f2,ab2,c3] [g2,b2,d3]>").s("pad")
- Bass: mostly roots; add a passing note only in the main section.
- Lead: one motif, repeated; vary 1–2 notes in the main section only.

7) Effects/automation (section-to-section, not constant chaos)
- Implement "filter sweep" by raising/lowering .lpf() or .hpf() between sections.
- Implement "space" by changing .room() between sections.
- Implement "delay" on lead only, subtle.
- "Sidechain feel" = leave small rests in bass on kick hits (e.g., "c2 ~ c2 ~").

8) Mixing/texture (safe defaults)
- Gains: kick 0.75–0.9, snare/clap 0.6–0.8, hats 0.3–0.5, bass 0.6–0.85, chords 0.35–0.6, lead 0.45–0.7, fx 0.25–0.5.
- Use filters to carve space: bass lpf 1200–3000, pads lpf 1200–5000 if needed.
- Pan lightly on hats/lead for width (e.g., .pan(-0.2) / .pan(0.2)).

QUALITY BAR (NON-NEGOTIABLE)
- It must sound like one coherent song idea: consistent groove + stable harmony + clear roles.
- It must be buildable and error-free under the allowed function/sample constraints.
- Keep it simple: fewer layers, stronger choices, gentle variation across sections.

TEMPLATE YOU SHOULD FOLLOW (ADAPT TO BRIEF)
slowcat(
  stack(
    // DRUMS: ...
    s("...").gain(...),
    // BASS: ...
    note("...").s("...").gain(...).lpf(...),
    // HARMONY: ...
    note("...").s("...").gain(...).room(...),
    // LEAD (optional): ...
    note("...").s("...").gain(...).delay(...),
    // FX (optional): ...
    s("...").gain(...).hpf(...).room(...)
  ).slow(BARS),
  ...
)

FINAL INSTRUCTION
Read the brief, make concrete choices, and output ONLY the final slowcat(...) expression with section stacks and layer comments. Keep it simple but faithful.`;

    return post<{ processId: string }>('/claude/execute/async', {
      prompt: command,
      systemPrompt,
      model: options?.model || 'claude-opus-4-5-20251101',
      timeoutMs: options?.timeout,
    }, { timeout: 300000 });
  },

  /**
   * Get the status of a specific process
   */
  async getProcessStatus(processId: string): Promise<ClaudeProcess> {
    // Backend returns different shape, need to transform
    interface BackendProcess {
      processId: string;
      status: string;
      createdAt: string;
      startedAt?: string;
      completedAt?: string;
      result?: {
        stdout: string;
        stderr: string;
        exitCode: number | null;
        error?: string;
      };
    }
    const data = await get<BackendProcess>(`/claude/processes/${processId}`);
    return {
      id: data.processId,
      command: '', // Not returned by status endpoint
      status: data.status as ClaudeProcess['status'],
      output: stripMarkdownCodeFences(data.result?.stdout || ''),
      error: data.result?.error || data.result?.stderr,
      exitCode: data.result?.exitCode ?? undefined,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      createdAt: data.createdAt,
    };
  },

  /**
   * Cancel a running process
   */
  async cancelProcess(processId: string): Promise<{ message: string }> {
    return del<{ message: string }>(`/claude/processes/${processId}`);
  },

  /**
   * List all processes with pagination
   */
  async listProcesses(
    params?: PaginationParams & { status?: string }
  ): Promise<PaginatedResult<ClaudeProcess>> {
    return get<PaginatedResult<ClaudeProcess>>('/claude/processes', params);
  },

  /**
   * Get Claude service metrics
   */
  async getMetrics(): Promise<ClaudeMetrics> {
    return get<ClaudeMetrics>('/claude/metrics');
  },

  /**
   * Get Claude service health status
   */
  async getHealth(): Promise<HealthStatus> {
    return get<HealthStatus>('/claude/health');
  },

  /**
   * Get command history
   */
  async getHistory(
    params?: PaginationParams
  ): Promise<PaginatedResult<ClaudeProcess>> {
    return get<PaginatedResult<ClaudeProcess>>('/claude/history', params);
  },

  /**
   * Retry a failed process
   */
  async retryProcess(processId: string): Promise<{ processId: string }> {
    return post<{ processId: string }>(`/claude/processes/${processId}/retry`);
  },
};

export default claudeService;
