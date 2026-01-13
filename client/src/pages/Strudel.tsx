import { useState, useCallback, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Play,
  Square,
  Loader2,
  X,
  RefreshCw,
  Music,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Volume2,
  FileDown,
  Keyboard,
  Radio,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { useStrudel, useStrudelProcess } from '@/hooks/useStrudel';
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';
import { useStrudelStream } from '@/hooks/useSocket';
import { useMusicImprovement } from '@/hooks/useMusicImprovement';
import { MusicDiscussionPanel } from '@/components/features/strudel/MusicDiscussionPanel';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { PatternValidator } from '@/components/features/strudel/PatternValidator';
import { PatternLibrary } from '@/components/features/strudel/PatternLibrary';
import { SampleBrowser } from '@/components/features/strudel/SampleBrowser';
// agentService not needed - using WebSocket for self-critique
import type { ProcessStatus } from '@/types';

const patternSchema = z.object({
  code: z.string().min(1, 'Pattern code is required'),
  duration: z.number().min(1).max(300).optional(),
  sampleRate: z.number().min(8000).max(96000).optional(),
  format: z.literal('wav').optional(),
});

type PatternFormData = z.infer<typeof patternSchema>;

function getStatusIcon(status: ProcessStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'pending':
    case 'queued':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: ProcessStatus) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    completed: 'default',
    failed: 'destructive',
    cancelled: 'destructive',
    running: 'secondary',
    pending: 'outline',
    queued: 'outline',
  };

  return (
    <Badge variant={variants[status] || 'outline'} className="capitalize">
      {status}
    </Badge>
  );
}

// Audio player component using Web Audio API for reliable playback
function AudioPlayer({ audioUrl }: { audioUrl: string }) {
  const [duration, setDuration] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);

  // Load and decode audio when URL changes
  useEffect(() => {
    let cancelled = false;

    async function loadAudio() {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        const decoded = await audioContextRef.current.decodeAudioData(arrayBuffer);
        if (!cancelled) {
          setAudioBuffer(decoded);
          setDuration(decoded.duration);
          console.log('Audio decoded successfully, duration:', decoded.duration);
        }
      } catch (e) {
        console.error('Failed to decode audio:', e);
      }
    }

    loadAudio();
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Update current time during playback
  useEffect(() => {
    let animationFrame: number;

    function updateTime() {
      if (isPlaying && audioContextRef.current) {
        const elapsed =
          audioContextRef.current.currentTime - startTimeRef.current + pauseTimeRef.current;
        setCurrentTime(Math.min(elapsed, duration || 0));
        animationFrame = requestAnimationFrame(updateTime);
      }
    }

    if (isPlaying) {
      animationFrame = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [isPlaying, duration]);

  const play = useCallback(() => {
    if (!audioBuffer || !audioContextRef.current) return;

    // Resume context if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    // Create new source
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);

    // Start from pause position
    const offset = pauseTimeRef.current;
    source.start(0, offset);
    startTimeRef.current = audioContextRef.current.currentTime;
    sourceRef.current = source;

    source.onended = () => {
      if (sourceRef.current === source) {
        setIsPlaying(false);
        pauseTimeRef.current = 0;
        setCurrentTime(0);
      }
    };

    setIsPlaying(true);
  }, [audioBuffer]);

  const pause = useCallback(() => {
    if (sourceRef.current && audioContextRef.current) {
      pauseTimeRef.current =
        audioContextRef.current.currentTime - startTimeRef.current + pauseTimeRef.current;
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const seek = useCallback(
    (time: number) => {
      const wasPlaying = isPlaying;
      if (isPlaying) {
        pause();
      }
      pauseTimeRef.current = time;
      setCurrentTime(time);
      if (wasPlaying) {
        setTimeout(play, 0);
      }
    },
    [isPlaying, pause, play]
  );

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted p-4">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={isPlaying ? pause : play}
          disabled={!audioBuffer}
        >
          {isPlaying ? <span className="h-4 w-4">⏸</span> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="w-full"
            disabled={!audioBuffer}
          />
        </div>
        <span className="text-sm text-muted-foreground min-w-[80px]">
          {formatTime(currentTime)} / {formatTime(duration || 0)}
        </span>
        <Button variant="ghost" size="sm" asChild>
          <a href={audioUrl} download="pattern.wav">
            <Download className="mr-2 h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}

// Process detail component
function ProcessDetail({ processId }: { processId: string }) {
  const { data: process, isLoading } = useStrudelProcess(processId);
  const {
    progress,
    stage,
    isRendering,
    audioUrl: streamAudioUrl,
  } = useStrudelStream(process?.status === 'running' ? processId : null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (!process) {
    return <div className="p-8 text-center text-muted-foreground">Process not found</div>;
  }

  const displayProgress = isRendering ? progress : process.progress;
  const displayAudioUrl = streamAudioUrl || process.audioUrl;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Process ID: {process.id}</p>
          <p className="text-xs text-muted-foreground">
            Created {formatRelativeTime(process.createdAt)}
          </p>
        </div>
        {getStatusBadge(process.status)}
      </div>

      <div className="space-y-2">
        <Label>Pattern Code</Label>
        <div className="rounded-md bg-muted p-3 font-mono text-sm">
          <pre className="whitespace-pre-wrap">{process.code}</pre>
        </div>
      </div>

      {(process.status === 'running' || process.status === 'queued') && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Rendering Progress</span>
            <span>{Math.round(displayProgress)}%</span>
          </div>
          <Progress value={displayProgress} className="h-2" />
          {stage && <p className="text-xs text-muted-foreground">Stage: {stage}</p>}
        </div>
      )}

      {displayAudioUrl && (
        <div className="space-y-2">
          <Label>Audio Output</Label>
          <AudioPlayer audioUrl={displayAudioUrl} />
        </div>
      )}

      {process.error && (
        <div className="space-y-2">
          <Label className="text-destructive">Error</Label>
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {process.error}
          </div>
        </div>
      )}
    </div>
  );
}

// Example patterns - expanded with more diverse examples
const examplePatterns = [
  {
    name: 'Basic Beat',
    code: 's("bd sd bd sd")',
    description: 'Simple kick and snare pattern',
    category: 'drums',
  },
  {
    name: 'Four on Floor',
    code: 'stack(s("bd*4"), s("~ cp ~ cp"), s("hh*8"))',
    description: 'Classic house pattern',
    category: 'drums',
  },
  {
    name: 'Hi-Hat Groove',
    code: 's("hh*8").fast(2)',
    description: 'Fast hi-hat pattern',
    category: 'drums',
  },
  {
    name: 'Breakbeat',
    code: 's("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8")',
    description: 'Syncopated breakbeat',
    category: 'drums',
  },
  {
    name: 'Melodic Arp',
    code: 'note("c3 e3 g3 b3 c4 b3 g3 e3").sound("piano").lpf(2000)',
    description: 'Arpeggiated piano melody',
    category: 'melodic',
  },
  {
    name: 'Bass Line',
    code: 'note("c2 ~ e2 ~, ~ g2 ~ a2").sound("bass").lpf(800)',
    description: 'Simple bass line',
    category: 'melodic',
  },
  {
    name: 'Chord Progression',
    code: 'note("<[c3,e3,g3] [f3,a3,c4] [g3,b3,d4] [c3,e3,g3]>").sound("piano")',
    description: 'I-IV-V-I chord progression',
    category: 'melodic',
  },
  {
    name: 'Polyrhythm',
    code: 'stack(s("bd*3"), s("sd*5"), s("hh*7"))',
    description: 'Multiple rhythms layered',
    category: 'advanced',
  },
  {
    name: 'With Reverb',
    code: 's("bd sd:2 hh sd").room(0.8).size(0.9)',
    description: 'Drums with room reverb',
    category: 'effects',
  },
  {
    name: 'Delay Echo',
    code: 's("cp*2").delay(0.5).delaytime(0.25).delayfeedback(0.6)',
    description: 'Clap with rhythmic delay',
    category: 'effects',
  },
  {
    name: 'Euclidean Rhythm',
    code: 's("bd").euclid(5, 8)',
    description: 'Euclidean pattern (5,8)',
    category: 'advanced',
  },
  {
    name: 'Random Variation',
    code: 's("bd sd hh sd").sometimes(fast(2))',
    description: 'Pattern with random variation',
    category: 'advanced',
  },
];

// Improvement iteration type
interface ImprovementIteration {
  iteration: number;
  qualityScore: number;
  code: string;
  feedback?: string;
}

export function Strudel() {
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [showImprovementPanel, setShowImprovementPanel] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Combined music improvement flow: Self-Critique -> Discussion
  const {
    phase: improvementPhase,
    critiqueIterations,
    isCritiqueCompleted,
    critiqueFinalOutput,
    discussionRounds,
    currentRound,
    currentContributions,
    participantCount,
    consensusScore,
    finalConsensus,
    isDiscussionRunning,
    isDiscussionCompleted,
    discussionError,
    isImproving,
    isComplete: improvementComplete,
    error: improvementError,
    startImprovement,
  } = useMusicImprovement();

  // Map iterations to display format
  const improvementIterations: ImprovementIteration[] = critiqueIterations.map((iter) => ({
    iteration: iter.iteration,
    qualityScore: iter.score,
    code: iter.output,
    feedback: iter.feedback,
  }));
  const {
    processes,
    validation,
    validationError,
    isProcessesLoading,
    isValidating,
    validatePattern,
    executeAsync,
    cancelProcess,
    isExecuting,
    isCancelling,
    executeError,
    refetchProcesses,
  } = useStrudel();

  // Real-time playback using Superdough
  const {
    isLoading: isPlayerLoading,
    isInitialized: isPlayerInitialized,
    isPlaying,
    samplesLoaded,
    error: playerError,
    initialize: _initializePlayer,
    play: playPattern,
    stop: stopPattern,
    updatePattern,
  } = useStrudelPlayer();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset: _reset,
  } = useForm<PatternFormData>({
    resolver: zodResolver(patternSchema),
    defaultValues: {
      duration: 60,
      sampleRate: 44100,
      format: 'wav',
    },
  });

  const codeValue = watch('code');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when typing in textarea
      const target = e.target as HTMLElement;
      const isInTextarea = target.tagName === 'TEXTAREA';

      // Ctrl/Cmd + Enter: Play/Update pattern
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isInTextarea) {
        e.preventDefault();
        if (codeValue) {
          if (isPlaying) {
            updatePattern(codeValue);
          } else {
            playPattern(codeValue);
          }
        }
      }

      // Escape: Stop playback
      if (e.key === 'Escape' && isPlaying) {
        e.preventDefault();
        stopPattern();
      }

      // Ctrl/Cmd + .: Stop playback (like in Strudel REPL)
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        stopPattern();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [codeValue, isPlaying, playPattern, stopPattern, updatePattern]);

  // Handle song improvement with combined flow: Self-Critique -> Discussion
  const handleImprove = useCallback(() => {
    if (!codeValue) return;

    console.log('[Improve] Starting combined improvement flow:', codeValue.substring(0, 50));
    setShowImprovementPanel(true);

    // Build the improvement prompt
    const improvementPrompt = `You are reviewing and improving a Strudel live-coding music pattern.

CURRENT PATTERN:
${codeValue}

Your task is to analyze this pattern and improve it based on the quality criteria provided.

IMPROVEMENT GUIDELINES:
1. Fix any syntax errors or invalid sample names
2. Improve musical structure and coherence
3. Enhance rhythmic variation while maintaining groove
4. Add dynamic contrast (gain, filter sweeps)
5. Improve the overall arrangement and energy arc

CONSTRAINTS - Only use these allowed constructs:
- s("samplepattern")
- note("pitchpattern").s("samplename")
- Modifiers: .gain(x) .lpf(x) .hpf(x) .room(x) .delay(x) .pan(x) .slow(n) .fast(n)
- Combinators: stack(patt1, patt2, ...) slowcat(patt1, patt2, ...)

AVAILABLE SAMPLES ONLY:
Drums: bd, sd, hh, cp, hh27, cr, perc, tabla, hand, rm
Drum Machines: 808, 808bd, 808sd, 808hc, 808oh, clubkick
Bass: bass, bass1, bass2, bass3, jvbass, jungbass
Melodic: casio, arpy, pluck, sitar, gtr, jazz, pad, superpiano
Synth: sine, saw, moog, juno, hoover, stab, blip, bleep
Effects: noise, metal, industrial, glitch, space, wind
Voice: mouth, numbers, alphabet
Nature: birds, insect, crow, bubble

Output ONLY the improved Strudel code. Do NOT wrap in markdown code blocks. Do NOT use \`\`\` or any formatting. Just output the raw code starting with slowcat( or stack( or s(.`;

    startImprovement(codeValue, improvementPrompt);
  }, [codeValue, startImprovement]);

  // Auto-apply final output when critique completes
  useEffect(() => {
    if (isCritiqueCompleted && critiqueFinalOutput) {
      console.log('[Improve] Critique completed, applying final output');
      // Strip markdown code blocks if present
      const cleanCode = critiqueFinalOutput
        .replace(/^```(?:strudel|javascript|js)?\n?/gm, '')
        .replace(/\n?```$/gm, '')
        .trim();

      setValue('code', cleanCode);
      validatePattern(cleanCode);
    }
  }, [isCritiqueCompleted, critiqueFinalOutput, setValue, validatePattern]);

  // Apply a specific iteration's code
  const applyIterationCode = useCallback(
    (code: string) => {
      // Strip markdown code blocks if present
      const cleanCode = code
        .replace(/^```(?:strudel|javascript|js)?\n?/gm, '')
        .replace(/\n?```$/gm, '')
        .trim();
      setValue('code', cleanCode);
      validatePattern(cleanCode);
    },
    [setValue, validatePattern]
  );

  const handleValidate = useCallback(() => {
    if (codeValue) {
      validatePattern(codeValue);
    }
  }, [codeValue, validatePattern]);

  // Handle real-time playback toggle
  const handlePlayToggle = useCallback(async () => {
    if (!codeValue) return;

    if (isPlaying) {
      stopPattern();
    } else {
      try {
        await playPattern(codeValue);
      } catch (error) {
        console.error('Failed to play pattern:', error);
      }
    }
  }, [codeValue, isPlaying, playPattern, stopPattern]);

  const onSubmit = (data: PatternFormData) => {
    executeAsync(
      {
        code: data.code,
        options: {
          duration: data.duration,
          sampleRate: data.sampleRate,
          format: data.format,
        },
      },
      {
        onSuccess: (result) => {
          setSelectedProcessId(result.processId);
        },
      }
    );
  };

  const handleLoadPreset = (code: string) => {
    setValue('code', code);
    validatePattern(code);
  };

  // Handler for PatternLibrary selection
  const handlePatternSelect = useCallback(
    (pattern: { code: string }) => {
      setValue('code', pattern.code);
      validatePattern(pattern.code);
    },
    [setValue, validatePattern]
  );

  // Handler for SampleBrowser selection - inserts sample into pattern
  const handleSampleSelect = useCallback(
    (sampleName: string) => {
      const sampleCode = `s("${sampleName}")`;
      const currentCode = codeValue || '';
      // If there's existing code, append with stack, otherwise just set the sample
      const newCode = currentCode.trim()
        ? `stack(\n  ${currentCode.trim()},\n  ${sampleCode}\n)`
        : sampleCode;
      setValue('code', newCode);
      validatePattern(newCode);
    },
    [codeValue, setValue, validatePattern]
  );

  const handleCancel = (processId: string) => {
    cancelProcess(processId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Strudel Studio</h1>
          <p className="text-muted-foreground">
            Live coding music patterns with real-time playback
          </p>
        </div>
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {isPlaying && (
            <Badge variant="secondary" className="animate-pulse">
              <Radio className="mr-1 h-3 w-3" />
              Playing
            </Badge>
          )}
          {samplesLoaded && (
            <Badge variant="outline">
              <Volume2 className="mr-1 h-3 w-3" />
              220+ samples
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pattern Editor */}
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Pattern Editor
            </CardTitle>
            <CardDescription>
              Write Strudel patterns using mini-notation. Press Ctrl+Enter to play.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Code Editor */}
            <div className="space-y-2">
              <Label htmlFor="code">Pattern Code</Label>
              <Textarea
                id="code"
                placeholder='s("bd sd bd sd")'
                rows={10}
                className={`font-mono text-sm ${errors.code ? 'border-destructive' : ''} ${isPlaying ? 'border-primary' : ''}`}
                {...register('code')}
                ref={(e) => {
                  register('code').ref(e);
                  (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                }}
              />
              {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
              {/* Real-time Pattern Validator */}
              <PatternValidator
                code={codeValue || ''}
                onValidationChange={(_isValid, _errors) => {
                  // Validation state is displayed inline by PatternValidator
                }}
              />
            </div>

            {/* Primary Action: Live Play Button */}
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                size="lg"
                className={`w-full text-lg h-14 ${isPlaying ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}
                onClick={handlePlayToggle}
                disabled={isPlayerLoading || !codeValue}
              >
                {isPlayerLoading ? (
                  <>
                    <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                    Initializing Audio...
                  </>
                ) : isPlaying ? (
                  <>
                    <Square className="mr-2 h-6 w-6" />
                    Stop Playback
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-6 w-6" />
                    Live Play
                  </>
                )}
              </Button>

              {/* Secondary actions row */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  disabled={isValidating || !codeValue}
                  className="flex-1"
                >
                  {isValidating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Validate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleImprove}
                  disabled={isImproving || !codeValue}
                  className="flex-1"
                >
                  {isImproving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Improve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExportOptions(!showExportOptions)}
                  className="flex-1"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export WAV
                </Button>
              </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Keyboard className="h-3 w-3" />
              <span>Ctrl+Enter: Play/Update</span>
              <span className="mx-1">|</span>
              <span>Ctrl+. or Esc: Stop</span>
            </div>

            {/* Improvement Panel */}
            <Collapsible open={showImprovementPanel} onOpenChange={setShowImprovementPanel}>
              <CollapsibleContent className="space-y-3">
                <div className="rounded-lg border p-4 space-y-4 bg-gradient-to-r from-purple-500/5 to-pink-500/5">
                  {/* Header with title and status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <Label className="text-sm font-medium">AI Song Improvement</Label>
                    </div>
                    {isImproving && !isDiscussionRunning && (
                      <Badge variant="secondary" className="animate-pulse">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        {improvementPhase === 'critique' ? 'Improving...' : 'Analyzing...'}
                      </Badge>
                    )}
                    {isDiscussionRunning && (
                      <Badge variant="secondary" className="animate-pulse bg-blue-500/20">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Experts Discussing...
                      </Badge>
                    )}
                    {improvementComplete && (
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Complete
                      </Badge>
                    )}
                  </div>

                  {/* Phase Indicator */}
                  {improvementPhase !== 'idle' && (
                    <div className="flex items-center gap-2 py-2">
                      <div className="flex items-center gap-1">
                        <div
                          className={`h-2.5 w-2.5 rounded-full transition-colors ${
                            improvementPhase === 'critique'
                              ? 'bg-purple-500 animate-pulse'
                              : isCritiqueCompleted
                                ? 'bg-green-500'
                                : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        />
                        <span className="text-xs text-muted-foreground">Self-Critique</span>
                      </div>
                      <div className="h-px flex-1 bg-border" />
                      <div className="flex items-center gap-1">
                        <div
                          className={`h-2.5 w-2.5 rounded-full transition-colors ${
                            improvementPhase === 'discussion'
                              ? 'bg-blue-500 animate-pulse'
                              : isDiscussionCompleted
                                ? 'bg-green-500'
                                : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        />
                        <span className="text-xs text-muted-foreground">Expert Discussion</span>
                      </div>
                    </div>
                  )}

                  {improvementError && (
                    <Alert variant="destructive">
                      <AlertDescription>{improvementError}</AlertDescription>
                    </Alert>
                  )}

                  {isImproving &&
                    improvementIterations.length === 0 &&
                    improvementPhase === 'critique' && (
                      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Agent is analyzing your pattern...
                      </div>
                    )}

                  {improvementIterations.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground">
                        Improvement Iterations ({improvementIterations.length})
                      </Label>
                      <div className="space-y-2">
                        {improvementIterations.map((iter) => (
                          <div
                            key={iter.iteration}
                            className="rounded-md border p-3 space-y-2 hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  Iteration {iter.iteration}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3 text-green-500" />
                                  <span className="text-xs font-medium">
                                    Quality: {Math.round(iter.qualityScore * 100)}%
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => applyIterationCode(iter.code)}
                                disabled={!iter.code}
                              >
                                Apply
                              </Button>
                            </div>
                            {iter.feedback && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {iter.feedback}
                              </p>
                            )}
                            {iter.code && (
                              <div className="max-h-20 overflow-y-auto rounded bg-muted p-2">
                                <pre className="text-xs font-mono whitespace-pre-wrap">
                                  {truncate(iter.code, 200)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Music Discussion Panel - appears after critique completes */}
                  <MusicDiscussionPanel
                    isActive={improvementPhase === 'discussion' || improvementPhase === 'complete'}
                    isRunning={isDiscussionRunning}
                    isCompleted={isDiscussionCompleted}
                    rounds={discussionRounds}
                    currentRound={currentRound}
                    currentContributions={currentContributions}
                    participantCount={participantCount || 4}
                    consensusScore={consensusScore}
                    finalConsensus={finalConsensus}
                    error={discussionError}
                  />

                  {improvementComplete && improvementIterations.length > 0 && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Improvement complete! The best version has been applied to the editor.
                        {isDiscussionCompleted && ' Music experts have reviewed the improvement.'}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Status alerts */}
            {validation && (
              <Alert variant={validation.isValid ? 'default' : 'destructive'}>
                <AlertDescription>
                  {validation.isValid
                    ? 'Pattern is valid'
                    : validation.errors?.map((e) => e.message).join(', ') || 'Validation failed'}
                </AlertDescription>
              </Alert>
            )}

            {validationError && (
              <Alert variant="destructive">
                <AlertDescription>
                  Validation error:{' '}
                  {validationError instanceof Error ? validationError.message : 'Unknown error'}
                </AlertDescription>
              </Alert>
            )}

            {playerError && (
              <Alert variant="destructive">
                <AlertDescription>Playback error: {playerError}</AlertDescription>
              </Alert>
            )}

            {isPlayerInitialized && !isPlaying && (
              <Alert>
                <Volume2 className="h-4 w-4" />
                <AlertDescription>
                  Audio ready
                  {samplesLoaded ? ' - 220+ Dirt-Samples loaded' : ' - loading samples...'}
                </AlertDescription>
              </Alert>
            )}

            {/* Export Options (Collapsible) */}
            <Collapsible open={showExportOptions} onOpenChange={setShowExportOptions}>
              <CollapsibleContent className="space-y-4">
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Export Settings</Label>
                    <Badge variant="outline">Server-side render</Badge>
                  </div>

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="duration" className="text-xs">
                          Duration (s)
                        </Label>
                        <Input
                          id="duration"
                          type="number"
                          min={1}
                          max={300}
                          {...register('duration', { valueAsNumber: true })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sampleRate" className="text-xs">
                          Sample Rate
                        </Label>
                        <Select
                          onValueChange={(value) => setValue('sampleRate', parseInt(value))}
                          defaultValue="44100"
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="22050">22050 Hz</SelectItem>
                            <SelectItem value="44100">44100 Hz</SelectItem>
                            <SelectItem value="48000">48000 Hz</SelectItem>
                            <SelectItem value="96000">96000 Hz</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="format" className="text-xs">
                          Format
                        </Label>
                        <Select
                          onValueChange={(value) => setValue('format', value as 'wav')}
                          defaultValue="wav"
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="wav">WAV</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={isExecuting || !codeValue}>
                      {isExecuting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Rendering...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Render & Download
                        </>
                      )}
                    </Button>
                  </form>

                  {executeError && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Render error:{' '}
                        {executeError instanceof Error ? executeError.message : 'Unknown error'}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Pattern Library */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span>Pattern Library</span>
                  <Badge variant="outline" className="ml-2">
                    Browse Presets
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-lg border p-4">
                  <PatternLibrary onSelectPattern={handlePatternSelect} className="max-h-80" />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Sample Browser */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span>Sample Browser</span>
                  <Badge variant="outline" className="ml-2">
                    220+ Samples
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-lg border p-4">
                  <SampleBrowser onSelectSample={handleSampleSelect} compact className="max-h-80" />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Quick Example Patterns */}
            <div className="space-y-3">
              <Label>Quick Start Patterns</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {examplePatterns.slice(0, 4).map((pattern) => (
                  <Button
                    key={pattern.name}
                    variant="outline"
                    size="sm"
                    className="justify-start h-auto py-2"
                    onClick={() => handleLoadPreset(pattern.code)}
                  >
                    <div className="text-left">
                      <div className="font-medium">{pattern.name}</div>
                      <div className="text-xs text-muted-foreground">{pattern.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Output / Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Rendered Output</CardTitle>
            <CardDescription>
              {selectedProcessId
                ? `Process ${selectedProcessId.slice(0, 8)}...`
                : 'Export a pattern to generate downloadable audio'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedProcessId ? (
              <ProcessDetail processId={selectedProcessId} />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center text-muted-foreground gap-2">
                <FileDown className="h-8 w-8" />
                <p className="text-center text-sm">
                  Use "Export WAV" to render patterns
                  <br />
                  for download as audio files
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Process List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Recent Exports</CardTitle>
              <CardDescription className="text-xs">Your rendered audio files</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetchProcesses()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {isProcessesLoading ? (
              <div className="flex items-center justify-center p-4">
                <Spinner />
              </div>
            ) : processes.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">No exports yet</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {processes.map((process) => (
                  <div
                    key={process.id}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent cursor-pointer ${
                      selectedProcessId === process.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedProcessId(process.id)}
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(process.status)}
                      <div>
                        <p className="text-xs font-medium font-mono">
                          {truncate(process.code, 30)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(process.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {process.status === 'running' && (
                        <Progress value={process.progress} className="h-1.5 w-12" />
                      )}
                      {getStatusBadge(process.status)}
                      {process.status === 'running' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(process.id);
                          }}
                          disabled={isCancelling}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Strudel;
