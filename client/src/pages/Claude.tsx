import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Play,
  Loader2,
  X,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Music,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useClaude, useClaudeProcess } from '@/hooks/useClaude';
import { useClaudeStream } from '@/hooks/useSocket';
import { formatRelativeTime, truncate } from '@/lib/utils';
import type { ProcessStatus } from '@/types';

const commandSchema = z.object({
  command: z.string().min(1, 'Command is required'),
  timeout: z.number().min(1000).max(300000).optional(),
  model: z.string().optional(),
});

type CommandFormData = z.infer<typeof commandSchema>;

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

// Process detail panel component
function ProcessDetail({ processId }: { processId: string }) {
  const { data: process, isLoading } = useClaudeProcess(processId);
  const { output: streamOutput, isStreaming } = useClaudeStream(
    process?.status === 'running' ? processId : null
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (!process) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Process not found
      </div>
    );
  }

  const displayOutput = isStreaming ? streamOutput : process.output;

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
        <Label>Command</Label>
        <div className="rounded-md bg-muted p-3 font-mono text-sm">
          {process.command}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Output</Label>
        <div className="max-h-96 overflow-auto rounded-md bg-black p-4 font-mono text-sm text-green-400">
          <pre className="whitespace-pre-wrap">{displayOutput || 'No output yet...'}</pre>
          {isStreaming && <span className="animate-pulse">_</span>}
        </div>
      </div>

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

type GenerationStep = 'input' | 'elaborating' | 'elaborated' | 'generating' | 'complete';

// localStorage key for persisting state
const CLAUDE_STATE_KEY = 'claude-generation-state';

interface PersistedState {
  selectedProcessId: string | null;
  elaboratedPrompt: string | null;
  originalPrompt: string;
  generationStep: GenerationStep;
}

function loadPersistedState(): PersistedState {
  try {
    const saved = localStorage.getItem(CLAUDE_STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PersistedState;
      // Don't restore 'elaborating' or 'generating' states - they're transient
      if (parsed.generationStep === 'elaborating' || parsed.generationStep === 'generating') {
        parsed.generationStep = 'input';
      }
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return {
    selectedProcessId: null,
    elaboratedPrompt: null,
    originalPrompt: '',
    generationStep: 'input',
  };
}

export function Claude() {
  const initialState = loadPersistedState();
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(initialState.selectedProcessId);
  const [elaboratedPrompt, setElaboratedPrompt] = useState<string | null>(initialState.elaboratedPrompt);
  const [originalPrompt, setOriginalPrompt] = useState<string>(initialState.originalPrompt);
  const [generationStep, setGenerationStep] = useState<GenerationStep>(initialState.generationStep);
  const [elaborationProcessId, setElaborationProcessId] = useState<string | null>(null);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    const stateToSave: PersistedState = {
      selectedProcessId,
      elaboratedPrompt,
      originalPrompt,
      generationStep,
    };
    localStorage.setItem(CLAUDE_STATE_KEY, JSON.stringify(stateToSave));
  }, [selectedProcessId, elaboratedPrompt, originalPrompt, generationStep]);

  const {
    processes,
    isProcessesLoading,
    executeAsync,
    elaboratePromptAsync,
    cancelProcess,
    retryProcess,
    isElaborating,
    isCancelling,
    refetchProcesses,
  } = useClaude();

  // Poll for elaboration result
  const { data: elaborationProcess } = useClaudeProcess(elaborationProcessId || '');

  // Watch for elaboration completion
  useEffect(() => {
    if (elaborationProcessId) {
      console.log('[Claude] Polling elaboration process:', elaborationProcessId, 'status:', elaborationProcess?.status, 'output:', elaborationProcess?.output?.slice(0, 100));
    }
    if (elaborationProcess?.status === 'completed' && elaborationProcess.output) {
      console.log('[Claude] Elaboration completed with output:', elaborationProcess.output);
      setElaboratedPrompt(elaborationProcess.output);
      setGenerationStep('elaborated');
      setElaborationProcessId(null);
    } else if (elaborationProcess?.status === 'failed') {
      console.error('[Claude] Elaboration process failed:', elaborationProcess?.error);
      setGenerationStep('input');
      setElaborationProcessId(null);
    }
  }, [elaborationProcess?.status, elaborationProcess?.output, elaborationProcess?.error, elaborationProcessId]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm<CommandFormData>({
    resolver: zodResolver(commandSchema),
    defaultValues: {
      timeout: 300000, // 5 minutes - Claude CLI can take a while
      model: 'claude-opus-4-5-20251101', // Default to Opus 4.5
    },
  });

  // Step 1: Start the elaboration process
  const onSubmit = async (data: CommandFormData) => {
    console.log('[Claude] Starting elaboration with:', data.command);
    setOriginalPrompt(data.command);
    setGenerationStep('elaborating');
    setElaboratedPrompt(null);

    try {
      const result = await elaboratePromptAsync({
        prompt: data.command,
        options: {
          timeout: data.timeout,
          model: data.model,
        },
      });
      console.log('[Claude] Elaboration started, processId:', result.processId);
      setElaborationProcessId(result.processId);
    } catch (error) {
      console.error('[Claude] Elaboration failed:', error);
      setGenerationStep('input');
    }
  };

  // Step 2: Generate Strudel code from elaborated prompt
  const handleGenerateCode = () => {
    if (!elaboratedPrompt) {
      console.error('[Claude] Cannot generate code: no elaborated prompt');
      return;
    }

    console.log('[Claude] Starting code generation with elaborated prompt:', elaboratedPrompt.slice(0, 100));
    setGenerationStep('generating');
    executeAsync(
      {
        command: elaboratedPrompt,
        options: {
          timeout: 300000,
          model: 'claude-opus-4-5-20251101',
        },
      },
      {
        onSuccess: (result) => {
          console.log('[Claude] Code generation started, processId:', result.processId);
          setSelectedProcessId(result.processId);
          setGenerationStep('complete');
          reset();
        },
        onError: (error) => {
          console.error('[Claude] Code generation failed:', error);
          setGenerationStep('elaborated'); // Go back to elaborated step
        },
      }
    );
  };

  // Reset the flow to start over
  const handleRestart = () => {
    setGenerationStep('input');
    setElaboratedPrompt(null);
    setOriginalPrompt('');
    setElaborationProcessId(null);
    setSelectedProcessId(null);
    // Clear persisted state
    localStorage.removeItem(CLAUDE_STATE_KEY);
  };

  const handleCancel = (processId: string) => {
    cancelProcess(processId);
  };

  const handleRetry = (processId: string) => {
    retryProcess(processId, {
      onSuccess: (result) => {
        setSelectedProcessId(result.processId);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Claude AI</h1>
        <p className="text-muted-foreground">
          Execute Claude CLI commands and manage processes
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Command Input / Elaboration Flow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Music Generation
            </CardTitle>
            <CardDescription>
              {generationStep === 'input' && 'Describe what kind of music you want to create'}
              {generationStep === 'elaborating' && 'Elaborating your request into musical details...'}
              {generationStep === 'elaborated' && 'Review the elaborated prompt, then generate code'}
              {generationStep === 'generating' && 'Generating Strudel code...'}
              {generationStep === 'complete' && 'Code generated! Check the output panel'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step indicator */}
            <div className="mb-6 flex items-center justify-center gap-2 text-sm">
              <div className={`flex items-center gap-1 ${generationStep === 'input' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${generationStep === 'input' ? 'bg-primary text-primary-foreground' : 'bg-green-500 text-white'}`}>
                  {generationStep !== 'input' ? <CheckCircle className="h-4 w-4" /> : '1'}
                </span>
                <span>Request</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className={`flex items-center gap-1 ${generationStep === 'elaborating' || generationStep === 'elaborated' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${generationStep === 'elaborating' ? 'bg-primary text-primary-foreground' : generationStep === 'elaborated' || generationStep === 'generating' || generationStep === 'complete' ? 'bg-green-500 text-white' : 'bg-muted'}`}>
                  {generationStep === 'elaborating' ? <Loader2 className="h-4 w-4 animate-spin" /> : (generationStep === 'elaborated' || generationStep === 'generating' || generationStep === 'complete') ? <CheckCircle className="h-4 w-4" /> : '2'}
                </span>
                <span>Elaborate</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className={`flex items-center gap-1 ${generationStep === 'generating' || generationStep === 'complete' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${generationStep === 'generating' ? 'bg-primary text-primary-foreground' : generationStep === 'complete' ? 'bg-green-500 text-white' : 'bg-muted'}`}>
                  {generationStep === 'generating' ? <Loader2 className="h-4 w-4 animate-spin" /> : generationStep === 'complete' ? <CheckCircle className="h-4 w-4" /> : '3'}
                </span>
                <span>Generate</span>
              </div>
            </div>

            {/* Step 1: Input Form */}
            {generationStep === 'input' && (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="command">What kind of music do you want?</Label>
                  <Textarea
                    id="command"
                    placeholder="e.g., Create a hip hop beat, Make something chill and ambient, Funky disco groove..."
                    rows={4}
                    {...register('command')}
                    className={errors.command ? 'border-destructive' : ''}
                  />
                  {errors.command && (
                    <p className="text-sm text-destructive">
                      {errors.command.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="timeout">Timeout (ms)</Label>
                    <Input
                      id="timeout"
                      type="number"
                      min={1000}
                      max={300000}
                      step={1000}
                      {...register('timeout', { valueAsNumber: true })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="model">Model</Label>
                    <Select
                      defaultValue="claude-opus-4-5-20251101"
                      onValueChange={(value) => setValue('model', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-opus-4-5-20251101">Claude Opus 4.5 (Latest)</SelectItem>
                        <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                        <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                        <SelectItem value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isElaborating}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Elaborate & Generate
                </Button>
              </form>
            )}

            {/* Step 2: Elaborating */}
            {generationStep === 'elaborating' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-muted bg-muted/50 p-4">
                  <Label className="text-muted-foreground">Your request:</Label>
                  <p className="mt-1 font-medium">{originalPrompt}</p>
                </div>
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Claude is elaborating your request into detailed musical terms...
                  </p>
                </div>
                <Button variant="outline" className="w-full" onClick={handleRestart}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            )}

            {/* Step 3: Elaborated - Show result and proceed */}
            {generationStep === 'elaborated' && elaboratedPrompt && (
              <div className="space-y-4">
                <div className="rounded-lg border border-muted bg-muted/50 p-4">
                  <Label className="text-muted-foreground">Your request:</Label>
                  <p className="mt-1 font-medium">{originalPrompt}</p>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <Label className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    Elaborated Musical Description:
                  </Label>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{elaboratedPrompt}</p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleRestart}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Start Over
                  </Button>
                  <Button className="flex-1" onClick={handleGenerateCode}>
                    <Play className="mr-2 h-4 w-4" />
                    Generate Code
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Generating */}
            {generationStep === 'generating' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-muted bg-muted/50 p-4">
                  <Label className="text-muted-foreground">Your request:</Label>
                  <p className="mt-1 font-medium">{originalPrompt}</p>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <Label className="flex items-center gap-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                    Elaborated Musical Description:
                  </Label>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{elaboratedPrompt}</p>
                </div>

                <div className="flex flex-col items-center justify-center py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Generating Strudel code from the musical description...
                  </p>
                </div>
              </div>
            )}

            {/* Step 5: Complete */}
            {generationStep === 'complete' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Code Generated Successfully!</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Check the Output panel on the right to see the generated Strudel code.
                    Copy it to the Strudel tab to play your music!
                  </p>
                </div>

                {elaboratedPrompt && (
                  <div className="rounded-lg border border-muted bg-muted/50 p-4">
                    <Label className="flex items-center gap-2 text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
                      Musical Description Used:
                    </Label>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{elaboratedPrompt}</p>
                  </div>
                )}

                <Button className="w-full" onClick={handleRestart}>
                  <Music className="mr-2 h-4 w-4" />
                  Create New Music
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Process Output / Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>
              {selectedProcessId
                ? `Viewing process ${selectedProcessId}`
                : 'Select a process to view details'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedProcessId ? (
              <ProcessDetail processId={selectedProcessId} />
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                Execute a command or select a process to view output
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Process List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Processes</CardTitle>
            <CardDescription>Your recent Claude command executions</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchProcesses()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isProcessesLoading ? (
            <div className="flex items-center justify-center p-8">
              <Spinner />
            </div>
          ) : processes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No processes yet. Execute a command to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {processes.map((process) => (
                <div
                  key={process.id}
                  className={`flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent cursor-pointer ${
                    selectedProcessId === process.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedProcessId(process.id)}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(process.status)}
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {truncate(process.command, 50)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(process.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(process.status)}
                    {process.status === 'running' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(process.id);
                        }}
                        disabled={isCancelling}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    {process.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(process.id);
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
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
  );
}

export default Claude;
