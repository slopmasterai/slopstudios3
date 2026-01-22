import { useEffect, useCallback, useState } from 'react';
import { useSocketStore } from '@/stores/socket.store';
import {
  subscribeToEvent,
  emitEvent,
  joinRoom,
  leaveRoom,
  getSocket,
} from '@/lib/socket';
import { stripMarkdownCodeFences } from '@/lib/utils';

// Generic socket hook for connection management
export function useSocket() {
  const { connected, error, reconnecting, reconnectAttempt, connect, disconnect } =
    useSocketStore();

  useEffect(() => {
    connect();
    return () => {
      // Don't disconnect on unmount, let the store manage it
    };
  }, [connect]);

  return {
    socket: getSocket(),
    connected,
    error,
    reconnecting,
    reconnectAttempt,
    connect,
    disconnect,
  };
}

// Hook for subscribing to a specific event
export function useSocketEvent<T = unknown>(
  event: string,
  callback: (data: T) => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    const unsubscribe = subscribeToEvent<T>(event, callback);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}

// Hook for emitting events
export function useSocketEmit() {
  const emit = useCallback(<T = unknown>(event: string, data?: T) => {
    emitEvent(event, data);
  }, []);

  return { emit };
}

// Hook for joining/leaving rooms
export function useSocketRoom(room: string) {
  useEffect(() => {
    joinRoom(room);
    return () => {
      leaveRoom(room);
    };
  }, [room]);
}

// Claude-specific streaming hook
export function useClaudeStream(processId: string | null) {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming' | 'complete' | 'error'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);

  // Subscribe to progress events
  useSocketEvent<{ processId: string; output: string }>(
    'claude:progress',
    (data) => {
      if (data.processId === processId) {
        setOutput((prev) => prev + data.output);
        setStatus('streaming');
      }
    },
    [processId]
  );

  // Subscribe to complete events
  useSocketEvent<{ processId: string; output: string }>(
    'claude:complete',
    (data) => {
      if (data.processId === processId) {
        // Strip markdown code fences from final output
        setOutput(stripMarkdownCodeFences(data.output));
        setStatus('complete');
      }
    },
    [processId]
  );

  // Subscribe to error events
  useSocketEvent<{ processId: string; error: string }>(
    'claude:error',
    (data) => {
      if (data.processId === processId) {
        setError(data.error);
        setStatus('error');
      }
    },
    [processId]
  );

  // Reset state when processId changes
  useEffect(() => {
    setOutput('');
    setError(null);
    setStatus('idle');
  }, [processId]);

  return { output, status, error, isStreaming: status === 'streaming' };
}

// Strudel-specific streaming hook
export function useStrudelStream(processId: string | null) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState<'idle' | 'rendering' | 'complete' | 'error'>(
    'idle'
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to progress events
  useSocketEvent<{ processId: string; progress: number; stage: string }>(
    'strudel:progress',
    (data) => {
      if (data.processId === processId) {
        setProgress(data.progress);
        setStage(data.stage);
        setStatus('rendering');
      }
    },
    [processId]
  );

  // Subscribe to complete events
  useSocketEvent<{ processId: string; audioUrl?: string }>(
    'strudel:complete',
    (data) => {
      if (data.processId === processId) {
        setProgress(100);
        setAudioUrl(data.audioUrl || null);
        setStatus('complete');
      }
    },
    [processId]
  );

  // Subscribe to error events
  useSocketEvent<{ processId: string; error: string }>(
    'strudel:error',
    (data) => {
      if (data.processId === processId) {
        setError(data.error);
        setStatus('error');
      }
    },
    [processId]
  );

  // Reset state when processId changes
  useEffect(() => {
    setProgress(0);
    setStage('');
    setAudioUrl(null);
    setError(null);
    setStatus('idle');
  }, [processId]);

  return {
    progress,
    stage,
    status,
    audioUrl,
    error,
    isRendering: status === 'rendering',
  };
}

// Workflow-specific streaming hook
export function useWorkflowStream(workflowId: string | null) {
  const [steps, setSteps] = useState<
    Array<{ step: number; agentId: string; result: unknown }>
  >([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<
    'idle' | 'running' | 'completed' | 'failed'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  // Subscribe to workflow started
  useSocketEvent<{ workflowId: string }>(
    'agent:workflow:started',
    (data) => {
      if (data.workflowId === workflowId) {
        setStatus('running');
        setSteps([]);
      }
    },
    [workflowId]
  );

  // Subscribe to step completed
  useSocketEvent<{
    workflowId: string;
    step: number;
    agentId: string;
    result: unknown;
  }>(
    'agent:workflow:step:completed',
    (data) => {
      if (data.workflowId === workflowId) {
        setSteps((prev) => [
          ...prev,
          { step: data.step, agentId: data.agentId, result: data.result },
        ]);
        setCurrentStep(data.step);
      }
    },
    [workflowId]
  );

  // Subscribe to workflow completed
  useSocketEvent<{ workflowId: string }>(
    'agent:workflow:completed',
    (data) => {
      if (data.workflowId === workflowId) {
        setStatus('completed');
      }
    },
    [workflowId]
  );

  // Subscribe to workflow failed
  useSocketEvent<{ workflowId: string; error: string }>(
    'agent:workflow:failed',
    (data) => {
      if (data.workflowId === workflowId) {
        setError(data.error);
        setStatus('failed');
      }
    },
    [workflowId]
  );

  // Reset state when workflowId changes
  useEffect(() => {
    setSteps([]);
    setCurrentStep(0);
    setError(null);
    setStatus('idle');
  }, [workflowId]);

  return {
    steps,
    currentStep,
    status,
    error,
    isRunning: status === 'running',
    isCompleted: status === 'completed',
    isFailed: status === 'failed',
  };
}

// Self-critique streaming hook
export function useSelfCritiqueStream(executionId: string | null) {
  const [iterations, setIterations] = useState<
    Array<{
      iteration: number;
      score: number;
      output: string;
      feedback: string;
    }>
  >([]);
  const [status, setStatus] = useState<
    'idle' | 'running' | 'converged' | 'completed' | 'error'
  >('idle');
  const [finalOutput, setFinalOutput] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to iteration events
  // Backend uses 'executionId' field for identifying critique sessions
  // Backend sends scores.overall, not score directly
  useSocketEvent<{
    executionId: string;
    iteration: number;
    scores?: { overall: number; criteria?: Record<string, number> };
    score?: number; // fallback
    output?: string;
    feedback?: string;
  }>(
    'agent:critique:iteration',
    (data) => {
      if (data.executionId === executionId) {
        console.log('[SelfCritique] Iteration received:', data);
        setStatus('running');
        // Extract score from scores.overall or fallback to score
        const score = data.scores?.overall ?? data.score ?? 0;
        setIterations((prev) => [
          ...prev,
          {
            iteration: data.iteration,
            score,
            output: data.output || '',
            feedback: data.feedback || '',
          },
        ]);
      }
    },
    [executionId]
  );

  // Subscribe to converged events
  // Backend uses 'iterations' not 'totalIterations'
  useSocketEvent<{
    executionId: string;
    finalScore: number;
    iterations?: number;
    totalIterations?: number; // fallback
  }>(
    'agent:critique:converged',
    (data) => {
      if (data.executionId === executionId) {
        console.log('[SelfCritique] Converged:', data);
        setStatus('converged');
        setFinalScore(data.finalScore);
      }
    },
    [executionId]
  );

  // Subscribe to completed events
  // Backend wraps the result in a 'result' object
  useSocketEvent<{
    executionId: string;
    result?: {
      finalOutput: unknown;
      finalScore: number;
      iterations: Array<{
        iteration: number;
        output: unknown;
        critique?: { overallScore: number; feedback: string };
      }>;
    };
    // Fallback fields in case backend sends them directly
    finalOutput?: string;
    finalScore?: number;
    iterations?: Array<{
      iteration: number;
      output: string;
      critique?: { overallScore: number; feedback: string };
    }>;
  }>(
    'agent:critique:completed',
    (data) => {
      if (data.executionId === executionId) {
        console.log('[SelfCritique] Completed:', data);
        setStatus('completed');

        // Extract from nested result or fallback to direct fields
        const finalOutputValue = data.result?.finalOutput ?? data.finalOutput;
        const finalScoreValue = data.result?.finalScore ?? data.finalScore ?? 0;
        const iterationsValue = data.result?.iterations ?? data.iterations;

        setFinalOutput(typeof finalOutputValue === 'string' ? finalOutputValue : String(finalOutputValue ?? ''));
        setFinalScore(finalScoreValue);

        // Update iterations with full data
        if (iterationsValue) {
          setIterations(
            iterationsValue.map((iter) => ({
              iteration: iter.iteration,
              score: iter.critique?.overallScore ?? 0,
              output: typeof iter.output === 'string' ? iter.output : String(iter.output ?? ''),
              feedback: iter.critique?.feedback ?? '',
            }))
          );
        }
      }
    },
    [executionId]
  );

  // Subscribe to error events
  useSocketEvent<{ executionId: string; error: string }>(
    'agent:critique:error',
    (data) => {
      if (data.executionId === executionId) {
        console.error('[SelfCritique] Error:', data);
        setError(data.error);
        setStatus('error');
      }
    },
    [executionId]
  );

  // Reset state when executionId changes
  useEffect(() => {
    setIterations([]);
    setFinalOutput(null);
    setFinalScore(0);
    setError(null);
    setStatus('idle');
  }, [executionId]);

  return {
    iterations,
    status,
    finalOutput,
    finalScore,
    error,
    isRunning: status === 'running',
    isCompleted: status === 'completed' || status === 'converged',
    isError: status === 'error',
  };
}

export default useSocket;
