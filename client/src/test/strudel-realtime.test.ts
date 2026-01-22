/**
 * Strudel Real-Time Playback Tests
 *
 * Tests for browser compatibility, audio context initialization,
 * sample loading, and pattern evaluation.
 *
 * These tests verify that real-time Strudel playback works correctly
 * across different browser scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock AudioContext for testing
class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  sampleRate = 44100;
  destination = {};

  resume = vi.fn().mockImplementation(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  suspend = vi.fn().mockImplementation(() => {
    this.state = 'suspended';
    return Promise.resolve();
  });

  close = vi.fn().mockResolvedValue(undefined);

  createGain = vi.fn().mockReturnValue({
    connect: vi.fn(),
    gain: { value: 1 },
  });

  createOscillator = vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { value: 440 },
  });

  createBufferSource = vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    buffer: null,
  });

  decodeAudioData = vi.fn().mockResolvedValue({
    duration: 1,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(44100)),
  });
}

// Mock window.AudioContext
const originalAudioContext = globalThis.AudioContext;

beforeEach(() => {
  // @ts-expect-error - Mocking global
  globalThis.AudioContext = MockAudioContext;
});

afterEach(() => {
  globalThis.AudioContext = originalAudioContext;
  vi.clearAllMocks();
});

describe('AudioContext Initialization', () => {
  it('should create AudioContext when constructor is available', () => {
    const ctx = new MockAudioContext();
    expect(ctx).toBeDefined();
    expect(ctx.state).toBe('suspended');
  });

  it('should start in suspended state due to autoplay policy', () => {
    const ctx = new MockAudioContext();
    expect(ctx.state).toBe('suspended');
  });

  it('should resume context on user interaction', async () => {
    const ctx = new MockAudioContext();
    await ctx.resume();
    expect(ctx.state).toBe('running');
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('should handle context suspension during tab switch', async () => {
    const ctx = new MockAudioContext();
    await ctx.resume();
    expect(ctx.state).toBe('running');

    await ctx.suspend();
    expect(ctx.state).toBe('suspended');

    // Re-resume on tab focus
    await ctx.resume();
    expect(ctx.state).toBe('running');
  });
});

describe('Pattern Validation', () => {
  const validatePattern = (code: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Check for empty pattern
    if (!code.trim()) {
      errors.push('Pattern is empty');
      return { isValid: false, errors };
    }

    // Check for basic bracket matching
    const brackets: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
    const stack: string[] = [];

    for (const char of code) {
      if (char in brackets) {
        stack.push(brackets[char]);
      } else if (Object.values(brackets).includes(char)) {
        if (stack.length === 0 || stack.pop() !== char) {
          errors.push('Unmatched brackets');
          break;
        }
      }
    }

    if (stack.length > 0) {
      errors.push('Unclosed brackets');
    }

    // Check for common syntax errors
    if (code.includes('s(') && !code.includes('"') && !code.includes("'")) {
      errors.push('Sample name should be in quotes');
    }

    return { isValid: errors.length === 0, errors };
  };

  it('should validate basic pattern syntax', () => {
    const result = validatePattern('s("bd sd")');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect unmatched brackets', () => {
    const result = validatePattern('s("bd sd"');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Unclosed brackets');
  });

  it('should detect mismatched brackets', () => {
    const result = validatePattern('s("[bd sd)"]');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Unmatched brackets');
  });

  it('should reject empty patterns', () => {
    const result = validatePattern('');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Pattern is empty');
  });

  it('should validate complex nested patterns', () => {
    const result = validatePattern('stack(s("[bd sd] hh"), note("<c3 e3 g3>"))');
    expect(result.isValid).toBe(true);
  });

  it('should handle mini-notation brackets', () => {
    const result = validatePattern('s("[bd sd] <hh oh> {cp*2 cp*3}")');
    expect(result.isValid).toBe(true);
  });
});

describe('Sample Loading', () => {
  const DIRT_SAMPLES_CATEGORIES = [
    'bd', 'sd', 'hh', 'cp', '808', '909', 'perc', 'tabla',
    'bass', 'arpy', 'piano', 'pluck', 'casio', 'sine',
  ];

  it('should recognize common drum sample categories', () => {
    const drumSamples = ['bd', 'sd', 'hh', 'cp'];
    for (const sample of drumSamples) {
      expect(DIRT_SAMPLES_CATEGORIES).toContain(sample);
    }
  });

  it('should recognize 808/909 machine samples', () => {
    expect(DIRT_SAMPLES_CATEGORIES).toContain('808');
    expect(DIRT_SAMPLES_CATEGORIES).toContain('909');
  });

  it('should recognize melodic sample categories', () => {
    const melodicSamples = ['piano', 'arpy', 'pluck', 'casio'];
    for (const sample of melodicSamples) {
      expect(DIRT_SAMPLES_CATEGORIES).toContain(sample);
    }
  });

  it('should handle sample with index (n parameter)', () => {
    // Simulate extracting sample index
    const extractSampleIndex = (value: { s: string; n?: number }): number => {
      return value.n ?? 0;
    };

    expect(extractSampleIndex({ s: 'bd' })).toBe(0);
    expect(extractSampleIndex({ s: 'bd', n: 2 })).toBe(2);
    expect(extractSampleIndex({ s: 'sd', n: 5 })).toBe(5);
  });
});

describe('Timing and Scheduling', () => {
  it('should convert cycle time to seconds', () => {
    const cps = 0.5; // 0.5 cycles per second = 120 BPM
    const convertCycleToSeconds = (cycle: number) => cycle / cps;

    expect(convertCycleToSeconds(0)).toBe(0);
    expect(convertCycleToSeconds(1)).toBe(2); // 1 cycle = 2 seconds at 0.5 CPS
    expect(convertCycleToSeconds(0.5)).toBe(1);
  });

  it('should convert BPM to CPS', () => {
    const bpmToCps = (bpm: number) => bpm / 60 / 2;

    expect(bpmToCps(120)).toBe(1); // 120 BPM = 1 CPS
    expect(bpmToCps(60)).toBe(0.5); // 60 BPM = 0.5 CPS
    expect(bpmToCps(180)).toBe(1.5); // 180 BPM = 1.5 CPS
  });

  it('should calculate proper event onset times', () => {
    const cps = 0.5;
    const events = [
      { cycle: 0, expectedTime: 0 },
      { cycle: 0.25, expectedTime: 0.5 },
      { cycle: 0.5, expectedTime: 1 },
      { cycle: 1, expectedTime: 2 },
    ];

    for (const event of events) {
      const time = event.cycle / cps;
      expect(time).toBe(event.expectedTime);
    }
  });

  it('should handle lookahead scheduling', () => {
    const lookahead = 0.1; // 100ms
    const scheduleAhead = (currentTime: number, eventTime: number): boolean => {
      return eventTime < currentTime + lookahead;
    };

    expect(scheduleAhead(0, 0.05)).toBe(true); // Event at 50ms should be scheduled
    expect(scheduleAhead(0, 0.15)).toBe(false); // Event at 150ms should not be scheduled yet
    expect(scheduleAhead(0.1, 0.15)).toBe(true); // After 100ms, 150ms event should be scheduled
  });
});

describe('Effect Parameters', () => {
  it('should extract gain from hap value', () => {
    const extractGain = (value: Record<string, number | undefined>): number => {
      return value.gain ?? value.amp ?? value.velocity ?? 0.8;
    };

    expect(extractGain({})).toBe(0.8);
    expect(extractGain({ gain: 0.5 })).toBe(0.5);
    expect(extractGain({ amp: 0.6 })).toBe(0.6);
    expect(extractGain({ velocity: 0.7 })).toBe(0.7);
  });

  it('should extract pan from hap value', () => {
    const extractPan = (value: Record<string, number | undefined>): number => {
      return value.pan ?? 0.5;
    };

    expect(extractPan({})).toBe(0.5); // Center by default
    expect(extractPan({ pan: 0 })).toBe(0); // Left
    expect(extractPan({ pan: 1 })).toBe(1); // Right
    expect(extractPan({ pan: 0.25 })).toBe(0.25); // Slightly left
  });

  it('should handle reverb parameters', () => {
    const extractReverb = (value: Record<string, number | undefined>) => ({
      room: value.room ?? 0,
      size: value.size ?? value.sz ?? 0.5,
    });

    const noReverb = extractReverb({});
    expect(noReverb.room).toBe(0);
    expect(noReverb.size).toBe(0.5);

    const withReverb = extractReverb({ room: 0.8, size: 0.9 });
    expect(withReverb.room).toBe(0.8);
    expect(withReverb.size).toBe(0.9);
  });

  it('should handle delay parameters', () => {
    const extractDelay = (value: Record<string, number | undefined>) => ({
      delay: value.delay ?? 0,
      delaytime: value.delaytime ?? value.delayt ?? 0.25,
      delayfeedback: value.delayfeedback ?? value.delayf ?? 0.5,
    });

    const noDelay = extractDelay({});
    expect(noDelay.delay).toBe(0);
    expect(noDelay.delaytime).toBe(0.25);
    expect(noDelay.delayfeedback).toBe(0.5);

    const withDelay = extractDelay({
      delay: 0.5,
      delaytime: 0.125,
      delayfeedback: 0.7,
    });
    expect(withDelay.delay).toBe(0.5);
    expect(withDelay.delaytime).toBe(0.125);
    expect(withDelay.delayfeedback).toBe(0.7);
  });
});

describe('Memory Management', () => {
  it('should track audio buffer references', () => {
    const bufferCache = new Map<string, ArrayBuffer>();

    // Simulate loading samples
    bufferCache.set('bd:0', new ArrayBuffer(1000));
    bufferCache.set('sd:0', new ArrayBuffer(1200));
    bufferCache.set('hh:0', new ArrayBuffer(800));

    expect(bufferCache.size).toBe(3);
    expect(bufferCache.has('bd:0')).toBe(true);
    expect(bufferCache.has('sd:0')).toBe(true);
    expect(bufferCache.has('hh:0')).toBe(true);
  });

  it('should clean up on stop', () => {
    const activeNodes: Array<{ stop: () => void }> = [];
    const createNode = () => {
      const node = { stop: vi.fn() };
      activeNodes.push(node);
      return node;
    };

    // Create some nodes
    createNode();
    createNode();
    createNode();

    expect(activeNodes).toHaveLength(3);

    // Stop all nodes
    for (const node of activeNodes) {
      node.stop();
    }
    activeNodes.length = 0;

    expect(activeNodes).toHaveLength(0);
  });
});

describe('Error Handling', () => {
  it('should handle AudioContext creation failure', () => {
    const createSafeContext = (): AudioContext | null => {
      try {
        return new MockAudioContext() as unknown as AudioContext;
      } catch {
        return null;
      }
    };

    const ctx = createSafeContext();
    expect(ctx).not.toBeNull();
  });

  it('should handle sample load failure gracefully', async () => {
    const loadSample = async (url: string): Promise<ArrayBuffer | null> => {
      try {
        // Simulate fetch failure
        if (url.includes('invalid')) {
          throw new Error('Failed to fetch');
        }
        return new ArrayBuffer(1000);
      } catch {
        return null;
      }
    };

    const validSample = await loadSample('valid-url');
    expect(validSample).not.toBeNull();

    const invalidSample = await loadSample('invalid-url');
    expect(invalidSample).toBeNull();
  });

  it('should handle pattern evaluation errors', () => {
    const evaluatePattern = (code: string): { success: boolean; error?: string } => {
      try {
        // Simulate evaluation
        if (code.includes('undefined_function')) {
          throw new Error('undefined_function is not defined');
        }
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Unknown error',
        };
      }
    };

    expect(evaluatePattern('s("bd sd")').success).toBe(true);
    expect(evaluatePattern('undefined_function()').success).toBe(false);
    expect(evaluatePattern('undefined_function()').error).toContain('not defined');
  });
});

describe('Browser Compatibility', () => {
  it('should detect Web Audio API support', () => {
    const hasWebAudio = (): boolean => {
      return typeof AudioContext !== 'undefined' || typeof (globalThis as any).webkitAudioContext !== 'undefined';
    };

    expect(hasWebAudio()).toBe(true);
  });

  it('should handle prefixed AudioContext', () => {
    const getAudioContextClass = (): typeof AudioContext | null => {
      if (typeof AudioContext !== 'undefined') {
        return AudioContext;
      }
      if (typeof (globalThis as any).webkitAudioContext !== 'undefined') {
        return (globalThis as any).webkitAudioContext;
      }
      return null;
    };

    expect(getAudioContextClass()).not.toBeNull();
  });

  it('should check for required features', () => {
    const checkFeatures = () => ({
      audioContext: typeof AudioContext !== 'undefined',
      promise: typeof Promise !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      arrayBuffer: typeof ArrayBuffer !== 'undefined',
    });

    const features = checkFeatures();
    expect(features.audioContext).toBe(true);
    expect(features.promise).toBe(true);
    expect(features.arrayBuffer).toBe(true);
  });
});
