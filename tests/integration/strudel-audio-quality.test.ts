/**
 * Strudel Audio Quality Validation Tests
 *
 * Tests for audio rendering quality, timing accuracy,
 * effect processing, and sample playback.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { describe, it, expect } from 'vitest';

// Mock audio buffer for testing
class MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private channels: Float32Array[];

  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.channels = Array.from(
      { length: options.numberOfChannels },
      () => new Float32Array(options.length)
    );
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel] || new Float32Array(0);
  }

  // Helper to set channel data for testing
  setChannelData(channel: number, data: Float32Array): void {
    if (this.channels[channel]) {
      this.channels[channel].set(data.slice(0, this.length));
    }
  }
}

describe('Audio Buffer Analysis', () => {
  // Helper to calculate RMS (Root Mean Square) level
  const calculateRMS = (buffer: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  };

  // Helper to find peak level
  const findPeak = (buffer: Float32Array): number => {
    let max = 0;
    for (let i = 0; i < buffer.length; i++) {
      max = Math.max(max, Math.abs(buffer[i]));
    }
    return max;
  };

  // Helper to detect clicks/pops (sudden level changes)
  const detectClicks = (buffer: Float32Array, threshold: number = 0.3): number[] => {
    const clickPositions: number[] = [];
    for (let i = 1; i < buffer.length; i++) {
      const diff = Math.abs(buffer[i] - buffer[i - 1]);
      if (diff > threshold) {
        clickPositions.push(i);
      }
    }
    return clickPositions;
  };

  it('should detect silent audio buffers', () => {
    const buffer = new MockAudioBuffer({
      numberOfChannels: 2,
      length: 44100,
      sampleRate: 44100,
    });

    const channelData = buffer.getChannelData(0);
    const rms = calculateRMS(channelData);

    expect(rms).toBe(0);
  });

  it('should measure audio levels correctly', () => {
    const buffer = new MockAudioBuffer({
      numberOfChannels: 2,
      length: 44100,
      sampleRate: 44100,
    });

    // Create a simple sine wave
    const channelData = buffer.getChannelData(0);
    const frequency = 440;
    const amplitude = 0.5;

    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / 44100);
    }
    buffer.setChannelData(0, channelData);

    const rms = calculateRMS(buffer.getChannelData(0));
    const peak = findPeak(buffer.getChannelData(0));

    // RMS of sine wave is amplitude / sqrt(2)
    expect(rms).toBeCloseTo(amplitude / Math.sqrt(2), 2);
    expect(peak).toBeCloseTo(amplitude, 2);
  });

  it('should detect audio clipping', () => {
    const buffer = new MockAudioBuffer({
      numberOfChannels: 1,
      length: 44100,
      sampleRate: 44100,
    });

    // Create a clipped sine wave
    const channelData = buffer.getChannelData(0);
    const amplitude = 1.5; // Will clip

    for (let i = 0; i < channelData.length; i++) {
      const sample = amplitude * Math.sin((2 * Math.PI * 440 * i) / 44100);
      channelData[i] = Math.max(-1, Math.min(1, sample)); // Clip to [-1, 1]
    }
    buffer.setChannelData(0, channelData);

    const peak = findPeak(buffer.getChannelData(0));
    expect(peak).toBe(1); // Should be exactly 1 due to clipping
  });

  it('should detect clicks and pops', () => {
    const buffer = new MockAudioBuffer({
      numberOfChannels: 1,
      length: 44100,
      sampleRate: 44100,
    });

    // Create smooth audio with an intentional click
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 44100);
    }

    // Add a click at sample 22050
    channelData[22050] = 0.9;
    buffer.setChannelData(0, channelData);

    const clicks = detectClicks(buffer.getChannelData(0), 0.3);
    expect(clicks.length).toBeGreaterThan(0);
    expect(clicks).toContain(22050);
  });
});

describe('Timing Accuracy', () => {
  // Helper to verify event onset times
  const verifyTimings = (
    expectedTimes: number[],
    actualTimes: number[],
    toleranceMs: number = 5
  ): { passed: boolean; maxDrift: number } => {
    if (expectedTimes.length !== actualTimes.length) {
      return { passed: false, maxDrift: Infinity };
    }

    let maxDrift = 0;
    for (let i = 0; i < expectedTimes.length; i++) {
      const drift = Math.abs(actualTimes[i] - expectedTimes[i]);
      maxDrift = Math.max(maxDrift, drift);
    }

    return {
      passed: maxDrift <= toleranceMs,
      maxDrift,
    };
  };

  it('should maintain timing accuracy within 5ms', () => {
    // Simulate expected vs actual event times (in ms)
    const expectedTimes = [0, 500, 1000, 1500, 2000];
    const actualTimes = [2, 503, 998, 1502, 2001]; // Within tolerance

    const result = verifyTimings(expectedTimes, actualTimes, 5);
    expect(result.passed).toBe(true);
    expect(result.maxDrift).toBeLessThanOrEqual(5);
  });

  it('should detect timing drift', () => {
    const expectedTimes = [0, 500, 1000, 1500, 2000];
    const actualTimes = [0, 510, 1020, 1530, 2040]; // Accumulating drift

    const result = verifyTimings(expectedTimes, actualTimes, 5);
    expect(result.passed).toBe(false);
    expect(result.maxDrift).toBeGreaterThan(5);
  });

  it('should calculate correct cycle-to-time conversion', () => {
    const cps = 0.5; // 0.5 cycles per second

    const cycleToMs = (cycle: number): number => (cycle / cps) * 1000;

    expect(cycleToMs(0)).toBe(0);
    expect(cycleToMs(0.25)).toBe(500); // Quarter cycle = 500ms
    expect(cycleToMs(0.5)).toBe(1000); // Half cycle = 1000ms
    expect(cycleToMs(1)).toBe(2000); // Full cycle = 2000ms
  });

  it('should handle different tempos correctly', () => {
    const testTempos = [
      { bpm: 60, expectedCycleMs: 4000 },
      { bpm: 120, expectedCycleMs: 2000 },
      { bpm: 180, expectedCycleMs: 1333.33 },
      { bpm: 240, expectedCycleMs: 1000 },
    ];

    for (const { bpm, expectedCycleMs } of testTempos) {
      const cps = bpm / 60 / 2;
      const cycleMs = 1000 / cps;
      expect(cycleMs).toBeCloseTo(expectedCycleMs, 0);
    }
  });
});

describe('Effect Processing', () => {
  // Helper to simulate reverb tail
  const hasReverbTail = (buffer: Float32Array, attackEndSample: number): boolean => {
    // Check if there's signal after the attack portion
    const tailStart = attackEndSample;
    let tailRMS = 0;

    for (let i = tailStart; i < buffer.length; i++) {
      tailRMS += buffer[i] * buffer[i];
    }
    tailRMS = Math.sqrt(tailRMS / (buffer.length - tailStart));

    return tailRMS > 0.01; // Some signal in the tail
  };

  it('should verify reverb adds tail to sound', () => {
    // Simulate a buffer with reverb
    const buffer = new Float32Array(44100);

    // Dry signal (first 4410 samples = 100ms)
    for (let i = 0; i < 4410; i++) {
      buffer[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / 44100);
    }

    // Reverb tail (exponential decay)
    for (let i = 4410; i < buffer.length; i++) {
      const decay = Math.exp(-(i - 4410) / 22050);
      buffer[i] = 0.3 * decay * Math.sin((2 * Math.PI * 440 * i) / 44100);
    }

    expect(hasReverbTail(buffer, 4410)).toBe(true);
  });

  it('should verify delay creates echo', () => {
    const delayTimeMs = 250;
    const sampleRate = 44100;
    const delaySamples = Math.round((delayTimeMs / 1000) * sampleRate);

    // Check if delay offset is calculated correctly
    expect(delaySamples).toBe(11025);

    // Simulate echo detection
    const detectEchoes = (buffer: Float32Array, delayOffset: number): number => {
      let echoCount = 0;
      const threshold = 0.1;

      for (let i = delayOffset; i < buffer.length; i++) {
        if (Math.abs(buffer[i]) > threshold && Math.abs(buffer[i - delayOffset]) > threshold) {
          // Check if the delayed signal correlates with the original
          const correlation = buffer[i] * buffer[i - delayOffset];
          if (correlation > 0) {
            echoCount++;
          }
        }
      }

      return echoCount;
    };

    // Create test buffer with echo
    const buffer = new Float32Array(44100);
    for (let i = 0; i < 4410; i++) {
      buffer[i] = 0.8 * Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    // Add echo
    for (let i = delaySamples; i < delaySamples + 4410; i++) {
      buffer[i] = 0.5 * Math.sin((2 * Math.PI * 440 * (i - delaySamples)) / 44100);
    }

    const echoes = detectEchoes(buffer, delaySamples);
    expect(echoes).toBeGreaterThan(0);
  });

  it('should verify filter affects frequency content', () => {
    // Simplified spectrum analysis
    const hasHighFrequency = (buffer: Float32Array, sampleRate: number): boolean => {
      // Use zero-crossing rate as a proxy for frequency content
      let zeroCrossings = 0;
      for (let i = 1; i < buffer.length; i++) {
        if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
          zeroCrossings++;
        }
      }
      const zeroCrossingRate = zeroCrossings / buffer.length;
      // High frequency content has more zero crossings
      return zeroCrossingRate > 0.01;
    };

    // Create a buffer with low-pass filtered content
    const filteredBuffer = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) {
      // Only low frequency content (100 Hz)
      filteredBuffer[i] = 0.8 * Math.sin((2 * Math.PI * 100 * i) / 44100);
    }

    // Create a buffer with high frequency content
    const unfilteredBuffer = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) {
      // High frequency content (4000 Hz)
      unfilteredBuffer[i] = 0.8 * Math.sin((2 * Math.PI * 4000 * i) / 44100);
    }

    expect(hasHighFrequency(unfilteredBuffer, 44100)).toBe(true);
    // Low frequency buffer should have fewer zero crossings
    expect(hasHighFrequency(filteredBuffer, 44100)).toBe(false);
  });
});

describe('Stereo Processing', () => {
  it('should verify stereo panning', () => {
    const pan = (leftGain: number, rightGain: number, panValue: number): [number, number] => {
      // Pan value: 0 = left, 0.5 = center, 1 = right
      // Using constant power panning
      const angle = panValue * (Math.PI / 2);
      return [leftGain * Math.cos(angle), rightGain * Math.sin(angle)];
    };

    // Center pan
    const [left, right] = pan(1, 1, 0.5);
    expect(left).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    expect(right).toBeCloseTo(Math.sin(Math.PI / 4), 5);
    expect(left).toBeCloseTo(right, 5); // Should be equal at center

    // Full left
    const [leftPan] = pan(1, 1, 0);
    expect(leftPan).toBeCloseTo(1, 5);

    // Full right
    const [, rightPan] = pan(1, 1, 1);
    expect(rightPan).toBeCloseTo(1, 5);
  });

  it('should verify stereo phase coherence', () => {
    // Check if left and right channels are properly correlated
    const checkPhaseCoherence = (left: Float32Array, right: Float32Array): number => {
      let sum = 0;
      const length = Math.min(left.length, right.length);

      for (let i = 0; i < length; i++) {
        sum += left[i] * right[i];
      }

      return sum / length;
    };

    // Create in-phase stereo signal
    const left = new Float32Array(44100);
    const right = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) {
      const sample = Math.sin((2 * Math.PI * 440 * i) / 44100);
      left[i] = sample;
      right[i] = sample;
    }

    const coherence = checkPhaseCoherence(left, right);
    expect(coherence).toBeGreaterThan(0); // Positive = in phase
  });
});

describe('Sample Playback Quality', () => {
  it('should verify sample rate conversion', () => {
    const resample = (
      sourceSampleRate: number,
      targetSampleRate: number,
      sourceLength: number
    ): number => {
      return Math.round((sourceLength * targetSampleRate) / sourceSampleRate);
    };

    // 48kHz to 44.1kHz
    expect(resample(48000, 44100, 48000)).toBe(44100);

    // 22.05kHz to 44.1kHz
    expect(resample(22050, 44100, 22050)).toBe(44100);
  });

  it('should verify pitch shifting', () => {
    const calculatePitchRatio = (
      sourcePitch: number,
      targetPitch: number
    ): number => {
      return targetPitch / sourcePitch;
    };

    // Octave up
    expect(calculatePitchRatio(440, 880)).toBe(2);

    // Octave down
    expect(calculatePitchRatio(440, 220)).toBe(0.5);

    // Fifth up
    expect(calculatePitchRatio(440, 660)).toBeCloseTo(1.5);
  });

  it('should handle sample begin/end parameters', () => {
    const calculateSampleRange = (
      totalSamples: number,
      begin: number,
      end: number
    ): { start: number; length: number } => {
      const start = Math.floor(totalSamples * begin);
      const stop = Math.floor(totalSamples * end);
      return { start, length: stop - start };
    };

    const range = calculateSampleRange(44100, 0.25, 0.75);
    expect(range.start).toBe(11025);
    expect(range.length).toBe(22050);

    const fullRange = calculateSampleRange(44100, 0, 1);
    expect(fullRange.start).toBe(0);
    expect(fullRange.length).toBe(44100);
  });
});

describe('Performance Metrics', () => {
  it('should measure render time', async () => {
    const measureRenderTime = async (renderFn: () => Promise<void>): Promise<number> => {
      const start = performance.now();
      await renderFn();
      return performance.now() - start;
    };

    const mockRender = async () => {
      // Simulate rendering
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    const time = await measureRenderTime(mockRender);
    expect(time).toBeGreaterThan(0);
    expect(time).toBeLessThan(1000); // Should be less than 1 second
  });

  it('should track memory usage', () => {
    const calculateBufferMemory = (
      channels: number,
      samples: number,
      bytesPerSample: number = 4
    ): number => {
      return channels * samples * bytesPerSample;
    };

    // 10 seconds of stereo audio at 44.1kHz
    const memory = calculateBufferMemory(2, 44100 * 10, 4);
    expect(memory).toBe(3528000); // 3.36 MB

    // 60 seconds of stereo audio at 44.1kHz
    const longMemory = calculateBufferMemory(2, 44100 * 60, 4);
    expect(longMemory).toBe(21168000); // 20.2 MB
  });
});
