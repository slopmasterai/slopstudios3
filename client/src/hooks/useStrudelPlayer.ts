/**
 * useStrudelPlayer Hook
 * Provides real-time Strudel pattern playback using @strudel/web
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// Global initialization state
let strudelInitialized = false;
let strudelInitPromise: Promise<void> | null = null;

export interface StrudelPlayerState {
  isLoading: boolean;
  isInitialized: boolean;
  isPlaying: boolean;
  samplesLoaded: boolean;
  error: string | null;
  currentPattern: string | null;
}

export interface StrudelPlayerActions {
  initialize: () => Promise<void>;
  play: (pattern: string) => Promise<void>;
  stop: () => void;
  updatePattern: (pattern: string) => Promise<void>;
}

export function useStrudelPlayer(): StrudelPlayerState & StrudelPlayerActions {
  const [state, setState] = useState<StrudelPlayerState>({
    isLoading: false,
    isInitialized: false,
    isPlaying: false,
    samplesLoaded: false,
    error: null,
    currentPattern: null,
  });

  const patternRef = useRef<any>(null);

  /**
   * Initialize Strudel with samples
   */
  const initStrudel = useCallback(async () => {
    if (strudelInitialized) return;

    if (strudelInitPromise) {
      await strudelInitPromise;
      return;
    }

    console.log('[StrudelPlayer] Initializing Strudel...');

    strudelInitPromise = (async () => {
      const { initStrudel: init, samples } = await import('@strudel/web');

      await init({
        prebake: async () => {
          console.log('[StrudelPlayer] Loading Dirt-Samples...');
          await samples('github:tidalcycles/dirt-samples');
          console.log('[StrudelPlayer] Samples loaded!');
        },
        afterEval: () => {
          // Called after pattern evaluation
        },
      });

      strudelInitialized = true;
      console.log('[StrudelPlayer] Strudel initialized!');
    })();

    await strudelInitPromise;
  }, []);

  const initialize = useCallback(async () => {
    if (state.isInitialized) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await initStrudel();

      setState((prev) => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        samplesLoaded: true,
        error: null,
      }));

    } catch (error) {
      console.error('[StrudelPlayer] Init error:', error);
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Init failed',
        isLoading: false,
      }));
    }
  }, [state.isInitialized, initStrudel]);

  const play = useCallback(async (pattern: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (!strudelInitialized) {
        await initStrudel();
      }

      // Stop any existing pattern
      if (patternRef.current) {
        patternRef.current.stop();
      }

      console.log('[StrudelPlayer] Playing:', pattern.substring(0, 50));

      // Use @strudel/web's evaluate which properly extends patterns with .play()
      const strudelWeb = await import('@strudel/web');

      // @strudel/web's evaluate returns a pattern with .play()
      const evaluatedPattern = await strudelWeb.evaluate(pattern);

      // Call .play() on the pattern
      if (typeof evaluatedPattern?.play === 'function') {
        evaluatedPattern.play();
        patternRef.current = evaluatedPattern;
      } else {
        // Fallback: try using the repl
        console.log('[StrudelPlayer] Using repl fallback...');
        await strudelWeb.repl({ defaultOutput: strudelWeb.webaudioOutput });
        const pat = await strudelWeb.evaluate(pattern);
        pat?.play?.();
        patternRef.current = pat;
      }

      console.log('[StrudelPlayer] Playing!');
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isPlaying: true,
        isInitialized: true,
        samplesLoaded: true,
        currentPattern: pattern,
        error: null,
      }));

    } catch (error) {
      console.error('[StrudelPlayer] Play error:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Play failed'
      }));
    }
  }, [initStrudel]);

  const stop = useCallback(async () => {
    console.log('[StrudelPlayer] Stopping');

    try {
      // Use hush() from @strudel/web to stop all sounds
      const { hush } = await import('@strudel/web');
      hush();
    } catch (e) {
      // Fallback
      if (patternRef.current?.stop) {
        patternRef.current.stop();
      }
    }

    patternRef.current = null;
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const updatePattern = useCallback(async (pattern: string) => {
    if (!state.isPlaying) {
      return play(pattern);
    }

    try {
      const strudelWeb = await import('@strudel/web');
      const evaluatedPattern = await strudelWeb.evaluate(pattern);

      // Stop old, start new
      if (patternRef.current?.stop) {
        patternRef.current.stop();
      }

      evaluatedPattern?.play?.();
      patternRef.current = evaluatedPattern;

      setState((prev) => ({ ...prev, currentPattern: pattern, error: null }));
      console.log('[StrudelPlayer] Pattern updated');
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Update failed'
      }));
    }
  }, [state.isPlaying, play]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (patternRef.current?.stop) {
        patternRef.current.stop();
      }
    };
  }, []);

  return { ...state, initialize, play, stop, updatePattern };
}

export default useStrudelPlayer;
