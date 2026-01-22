/**
 * Strudel Effects Service Tests
 * Tests for audio effects chain functionality
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import {
  extractEffectParams,
  applyLowpassFilter,
  applyHighpassFilter,
  applyBandpassFilter,
  applyDistortion,
  applyBitCrush,
  applySampleRateReduction,
  applyPanning,
  applyReverb,
  applyDelay,
  buildEffectsChain,
  applyPostProcessingEffects,
} from '../../src/services/strudel-effects.service';

// Mock AudioContext
const createMockAudioContext = () => ({
  createBiquadFilter: jest.fn(() => ({
    type: '',
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: jest.fn(),
  })),
  createGain: jest.fn(() => ({
    gain: { value: 0 },
    connect: jest.fn(),
  })),
  createWaveShaper: jest.fn(() => ({
    curve: null,
    oversample: '',
    connect: jest.fn(),
  })),
  createDelay: jest.fn(() => ({
    delayTime: { value: 0 },
    connect: jest.fn(),
  })),
});

describe('Strudel Effects Service', () => {
  describe('extractEffectParams', () => {
    it('should extract filter parameters', () => {
      const value = { lpf: 1000, lpq: 2, hpf: 100, hpq: 1.5, bpf: 500, bpq: 3 };
      const params = extractEffectParams(value);

      expect(params.lpf).toBe(1000);
      expect(params.lpq).toBe(2);
      expect(params.hpf).toBe(100);
      expect(params.hpq).toBe(1.5);
      expect(params.bpf).toBe(500);
      expect(params.bpq).toBe(3);
    });

    it('should extract cutoff and resonance aliases', () => {
      const value = { cutoff: 2000, resonance: 4 };
      const params = extractEffectParams(value);

      expect(params.lpf).toBe(2000);
      expect(params.lpq).toBe(4);
    });

    it('should extract distortion parameters', () => {
      const value = { shape: 0.5, distort: 0.8 };
      const params = extractEffectParams(value);

      expect(params.shape).toBe(0.5);
      expect(params.distort).toBe(0.8);
    });

    it('should extract lofi parameters', () => {
      const value = { coarse: 4, crush: 8 };
      const params = extractEffectParams(value);

      expect(params.coarse).toBe(4);
      expect(params.crush).toBe(8);
    });

    it('should extract spatial parameters', () => {
      const value = { pan: 0.7, room: 0.5, roomsize: 4, delay: 0.3, delaytime: 0.25, delayfeedback: 0.4 };
      const params = extractEffectParams(value);

      expect(params.pan).toBe(0.7);
      expect(params.room).toBe(0.5);
      expect(params.roomsize).toBe(4);
      expect(params.delay).toBe(0.3);
      expect(params.delaytime).toBe(0.25);
      expect(params.delayfeedback).toBe(0.4);
    });

    it('should extract gain parameters', () => {
      const value = { gain: 0.8, postgain: 1.2 };
      const params = extractEffectParams(value);

      expect(params.gain).toBe(0.8);
      expect(params.postgain).toBe(1.2);
    });

    it('should return empty object for null/undefined', () => {
      expect(extractEffectParams(null)).toEqual({});
      expect(extractEffectParams(undefined)).toEqual({});
    });

    it('should return empty object for non-objects', () => {
      expect(extractEffectParams('string')).toEqual({});
      expect(extractEffectParams(123)).toEqual({});
    });
  });

  describe('applyLowpassFilter', () => {
    it('should create and connect a lowpass filter', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyLowpassFilter(ctx, source, 1000, 2);

      expect(ctx.createBiquadFilter).toHaveBeenCalled();
      expect(source.connect).toHaveBeenCalled();
      expect(result.type).toBe('lowpass');
      expect(result.frequency.value).toBe(1000);
      expect(result.Q.value).toBe(2);
    });

    it('should clamp frequency to valid range', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const lowResult = applyLowpassFilter(ctx, source, 5, 1);
      expect(lowResult.frequency.value).toBe(20);

      const highResult = applyLowpassFilter(ctx, source, 25000, 1);
      expect(highResult.frequency.value).toBe(20000);
    });
  });

  describe('applyHighpassFilter', () => {
    it('should create and connect a highpass filter', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyHighpassFilter(ctx, source, 500, 1.5);

      expect(ctx.createBiquadFilter).toHaveBeenCalled();
      expect(result.type).toBe('highpass');
      expect(result.frequency.value).toBe(500);
    });
  });

  describe('applyBandpassFilter', () => {
    it('should create and connect a bandpass filter', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyBandpassFilter(ctx, source, 1000, 2);

      expect(ctx.createBiquadFilter).toHaveBeenCalled();
      expect(result.type).toBe('bandpass');
      expect(result.frequency.value).toBe(1000);
    });
  });

  describe('applyDistortion', () => {
    it('should create a waveshaper with soft clipping curve', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyDistortion(ctx, source, 0.5);

      expect(ctx.createWaveShaper).toHaveBeenCalled();
      expect(result.curve).not.toBeNull();
      expect(result.oversample).toBe('2x');
    });

    it('should return source unchanged for zero amount', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyDistortion(ctx, source, 0);

      expect(result).toBe(source);
    });
  });

  describe('applyBitCrush', () => {
    it('should quantize audio to specified bit depth', () => {
      const buffer = new Float32Array([0.5, -0.5, 0.25, -0.25]);
      const result = applyBitCrush(buffer, 4);

      // Check that values are quantized
      expect(result).not.toEqual(buffer);
      expect(result.length).toBe(buffer.length);
    });

    it('should return original buffer for 16 bits or more', () => {
      const buffer = new Float32Array([0.5, -0.5, 0.25, -0.25]);
      const result = applyBitCrush(buffer, 16);

      expect(result).toBe(buffer);
    });

    it('should return original buffer for invalid bits', () => {
      const buffer = new Float32Array([0.5, -0.5, 0.25, -0.25]);
      const result = applyBitCrush(buffer, 0);

      expect(result).toBe(buffer);
    });
  });

  describe('applySampleRateReduction', () => {
    it('should reduce sample rate by holding samples', () => {
      const buffer = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = applySampleRateReduction(buffer, 2);

      expect(result).toEqual(new Float32Array([1, 1, 3, 3, 5, 5, 7, 7]));
    });

    it('should return original buffer for factor <= 1', () => {
      const buffer = new Float32Array([1, 2, 3, 4]);
      const result = applySampleRateReduction(buffer, 1);

      expect(result).toBe(buffer);
    });
  });

  describe('applyPanning', () => {
    it('should create left and right gain nodes', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const { leftGain, rightGain } = applyPanning(ctx, source, 0.5);

      expect(ctx.createGain).toHaveBeenCalledTimes(2);
      expect(leftGain).toBeDefined();
      expect(rightGain).toBeDefined();
    });

    it('should pan full left at pan=0', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const { leftGain, rightGain } = applyPanning(ctx, source, 0);

      // At pan=0 (full left), left should be ~1 and right should be ~0
      expect(leftGain.gain.value).toBeCloseTo(1, 1);
      expect(rightGain.gain.value).toBeCloseTo(0, 1);
    });

    it('should pan full right at pan=1', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const { leftGain, rightGain } = applyPanning(ctx, source, 1);

      // At pan=1 (full right), left should be ~0 and right should be ~1
      expect(leftGain.gain.value).toBeCloseTo(0, 1);
      expect(rightGain.gain.value).toBeCloseTo(1, 1);
    });

    it('should center at pan=0.5', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const { leftGain, rightGain } = applyPanning(ctx, source, 0.5);

      // At center, both should be equal (roughly 0.707)
      expect(leftGain.gain.value).toBeCloseTo(rightGain.gain.value, 1);
    });
  });

  describe('applyReverb', () => {
    it('should create reverb effect with multiple delay lines', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyReverb(ctx, source, 0.5, 4);

      expect(ctx.createGain).toHaveBeenCalled();
      expect(ctx.createDelay).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return source unchanged for zero amount', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyReverb(ctx, source, 0, 4);

      expect(result).toBe(source);
    });
  });

  describe('applyDelay', () => {
    it('should create delay effect with feedback', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyDelay(ctx, source, 0.5, 0.25, 0.3);

      expect(ctx.createDelay).toHaveBeenCalled();
      expect(ctx.createGain).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return source unchanged for zero mix', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const result = applyDelay(ctx, source, 0, 0.25, 0.3);

      expect(result).toBe(source);
    });
  });

  describe('buildEffectsChain', () => {
    it('should return stereo outputs', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      const { leftOutput, rightOutput } = buildEffectsChain(ctx, source, {});

      expect(leftOutput).toBeDefined();
      expect(rightOutput).toBeDefined();
    });

    it('should apply filters when specified', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      buildEffectsChain(ctx, source, { lpf: 1000, hpf: 100 });

      // Should create at least 2 biquad filters (lpf + hpf)
      expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(2);
    });

    it('should apply distortion when specified', () => {
      const ctx = createMockAudioContext();
      const source = { connect: jest.fn() };

      buildEffectsChain(ctx, source, { distort: 0.5 });

      expect(ctx.createWaveShaper).toHaveBeenCalled();
    });
  });

  describe('applyPostProcessingEffects', () => {
    it('should apply bit crushing', () => {
      const buffer = new Float32Array([0.5, -0.5, 0.25, -0.25]);
      const result = applyPostProcessingEffects(buffer, { crush: 8 });

      expect(result).not.toBe(buffer);
    });

    it('should apply sample rate reduction', () => {
      const buffer = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = applyPostProcessingEffects(buffer, { coarse: 2 });

      expect(result).toEqual(new Float32Array([1, 1, 3, 3, 5, 5, 7, 7]));
    });

    it('should return original buffer with no effects', () => {
      const buffer = new Float32Array([0.5, -0.5, 0.25, -0.25]);
      const result = applyPostProcessingEffects(buffer, {});

      expect(result).toBe(buffer);
    });
  });
});
