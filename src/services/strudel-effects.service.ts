/**
 * Strudel Effects Service
 * Implements Superdough's 15+ effect chain in correct order
 * Effects are applied in the following order for consistent audio processing
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { logger } from '../utils/logger.js';

/**
 * Effects chain order (matching Superdough)
 * 1. Gain (input gain)
 * 2. Lowpass Filter (lpf)
 * 3. Highpass Filter (hpf)
 * 4. Bandpass Filter (bpf)
 * 5. Vowel Filter
 * 6. Sample Rate Reduction (coarse)
 * 7. Bit Crushing (crush)
 * 8. Waveshape (shape)
 * 9. Distortion (distort)
 * 10. Tremolo
 * 11. Compressor
 * 12. Panning (pan)
 * 13. Phaser
 * 14. Postgain (output gain)
 */

/**
 * Effect parameters extracted from hap value
 */
export interface EffectParams {
  // Filters
  lpf?: number; // Lowpass filter cutoff frequency
  lpq?: number; // Lowpass filter Q/resonance
  hpf?: number; // Highpass filter cutoff frequency
  hpq?: number; // Highpass filter Q/resonance
  bpf?: number; // Bandpass filter center frequency
  bpq?: number; // Bandpass filter Q

  // Vowel filter
  vowel?: string; // Vowel sound (a, e, i, o, u)

  // Lo-fi effects
  coarse?: number; // Sample rate reduction
  crush?: number; // Bit crushing (1-16 bits)

  // Distortion
  shape?: number; // Waveshaper amount (0-1)
  distort?: number; // Distortion amount (0-1+)

  // Modulation
  tremolo?: number; // Tremolo depth
  tremoloRate?: number; // Tremolo rate in Hz

  // Dynamics
  compressor?: number; // Compressor threshold

  // Spatial
  pan?: number; // Panning (0-1, where 0.5 is center)

  // Phase
  phaser?: number; // Phaser depth
  phaserRate?: number; // Phaser rate

  // Reverb and Delay (handled separately for global/orbit effects)
  room?: number; // Reverb amount
  roomsize?: number; // Reverb size
  delay?: number; // Delay mix
  delaytime?: number; // Delay time in seconds
  delayfeedback?: number; // Delay feedback amount

  // Gain
  gain?: number; // Input/output gain
  postgain?: number; // Post-effects gain
}

/**
 * Extract effect parameters from a hap value object
 */
export function extractEffectParams(value: any): EffectParams {
  const params: EffectParams = {};

  if (typeof value !== 'object' || value === null) {
    return params;
  }

  // Filters
  if (typeof value.lpf === 'number') params.lpf = value.lpf;
  if (typeof value.lpq === 'number') params.lpq = value.lpq;
  if (typeof value.cutoff === 'number') params.lpf = value.cutoff;
  if (typeof value.resonance === 'number') params.lpq = value.resonance;
  if (typeof value.hpf === 'number') params.hpf = value.hpf;
  if (typeof value.hpq === 'number') params.hpq = value.hpq;
  if (typeof value.bpf === 'number') params.bpf = value.bpf;
  if (typeof value.bpq === 'number') params.bpq = value.bpq;

  // Vowel
  if (typeof value.vowel === 'string') params.vowel = value.vowel;

  // Lo-fi
  if (typeof value.coarse === 'number') params.coarse = value.coarse;
  if (typeof value.crush === 'number') params.crush = value.crush;

  // Distortion
  if (typeof value.shape === 'number') params.shape = value.shape;
  if (typeof value.distort === 'number') params.distort = value.distort;

  // Modulation
  if (typeof value.tremolo === 'number') params.tremolo = value.tremolo;
  if (typeof value.tremoloRate === 'number') params.tremoloRate = value.tremoloRate;

  // Dynamics
  if (typeof value.compressor === 'number') params.compressor = value.compressor;

  // Spatial
  if (typeof value.pan === 'number') params.pan = value.pan;

  // Phaser
  if (typeof value.phaser === 'number') params.phaser = value.phaser;
  if (typeof value.phaserRate === 'number') params.phaserRate = value.phaserRate;

  // Reverb/Delay
  if (typeof value.room === 'number') params.room = value.room;
  if (typeof value.roomsize === 'number') params.roomsize = value.roomsize;
  if (typeof value.delay === 'number') params.delay = value.delay;
  if (typeof value.delaytime === 'number') params.delaytime = value.delaytime;
  if (typeof value.delayfeedback === 'number') params.delayfeedback = value.delayfeedback;

  // Gain
  if (typeof value.gain === 'number') params.gain = value.gain;
  if (typeof value.postgain === 'number') params.postgain = value.postgain;

  return params;
}

/**
 * Apply lowpass filter to audio node chain
 */
export function applyLowpassFilter(
  ctx: any,
  source: any,
  cutoff: number,
  q: number = 1
): any {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.max(20, Math.min(20000, cutoff));
  filter.Q.value = Math.max(0.001, Math.min(30, q));
  source.connect(filter);
  return filter;
}

/**
 * Apply highpass filter to audio node chain
 */
export function applyHighpassFilter(
  ctx: any,
  source: any,
  cutoff: number,
  q: number = 1
): any {
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = Math.max(20, Math.min(20000, cutoff));
  filter.Q.value = Math.max(0.001, Math.min(30, q));
  source.connect(filter);
  return filter;
}

/**
 * Apply bandpass filter to audio node chain
 */
export function applyBandpassFilter(
  ctx: any,
  source: any,
  center: number,
  q: number = 1
): any {
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = Math.max(20, Math.min(20000, center));
  filter.Q.value = Math.max(0.001, Math.min(30, q));
  source.connect(filter);
  return filter;
}

/**
 * Apply distortion using WaveShaper node
 * Uses soft clipping curve: (π + amount) * x / (π + amount * |x|)
 */
export function applyDistortion(
  ctx: any,
  source: any,
  amount: number
): any {
  if (amount <= 0) {
    return source;
  }

  const waveshaper = ctx.createWaveShaper();
  const samples = 8192;
  const curve = new Float32Array(samples);
  const k = amount * 100; // Scale amount

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Soft clipping formula
    curve[i] = ((Math.PI + k) * x) / (Math.PI + k * Math.abs(x));
  }

  waveshaper.curve = curve;
  waveshaper.oversample = '2x';
  source.connect(waveshaper);
  return waveshaper;
}

/**
 * Apply bit crushing effect
 * Note: This modifies the audio buffer directly (post-processing)
 */
export function applyBitCrush(
  buffer: Float32Array,
  bits: number
): Float32Array {
  if (bits >= 16 || bits <= 0) {
    return buffer;
  }

  const crushed = new Float32Array(buffer.length);
  const levels = Math.pow(2, bits);

  for (let i = 0; i < buffer.length; i++) {
    // Quantize to bit depth
    crushed[i] = Math.round((buffer[i] ?? 0) * levels) / levels;
  }

  return crushed;
}

/**
 * Apply sample rate reduction (coarse)
 * Note: This modifies the audio buffer directly (post-processing)
 */
export function applySampleRateReduction(
  buffer: Float32Array,
  factor: number
): Float32Array {
  if (factor <= 1) {
    return buffer;
  }

  const reduced = new Float32Array(buffer.length);
  const step = Math.floor(factor);

  for (let i = 0; i < buffer.length; i++) {
    // Hold sample value for 'step' samples
    reduced[i] = buffer[Math.floor(i / step) * step] ?? 0;
  }

  return reduced;
}

/**
 * Apply panning with equal power law
 * Returns left and right gain nodes
 */
export function applyPanning(
  ctx: any,
  source: any,
  pan: number
): { leftGain: any; rightGain: any } {
  // Convert pan from 0-1 to -1 to 1
  const normalizedPan = pan * 2 - 1;

  // Equal power panning using angle-based calculation
  const angle = ((normalizedPan + 1) * Math.PI) / 4;
  const leftGainValue = Math.cos(angle);
  const rightGainValue = Math.sin(angle);

  const leftGain = ctx.createGain();
  const rightGain = ctx.createGain();

  leftGain.gain.value = leftGainValue;
  rightGain.gain.value = rightGainValue;

  source.connect(leftGain);
  source.connect(rightGain);

  return { leftGain, rightGain };
}

/**
 * Apply reverb effect using multiple delay lines (Schroeder reverb approximation)
 */
export function applyReverb(
  ctx: any,
  source: any,
  amount: number,
  size: number = 4
): any {
  if (amount <= 0) {
    return source;
  }

  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const outputGain = ctx.createGain();

  // Mix levels
  dryGain.gain.value = 1 - amount * 0.5;
  wetGain.gain.value = amount;

  // Create multiple delay lines for diffusion
  const delayTimes = [0.029, 0.037, 0.041, 0.053, 0.067, 0.073, 0.079, 0.083];
  const decayFactors = [0.9, 0.88, 0.86, 0.84, 0.82, 0.80, 0.78, 0.76];

  // Dry path
  source.connect(dryGain);
  dryGain.connect(outputGain);

  // Wet path with multiple delay lines
  for (let i = 0; i < delayTimes.length; i++) {
    const delay = ctx.createDelay(0.5);
    const feedback = ctx.createGain();

    delay.delayTime.value = (delayTimes[i] ?? 0.03) * (size / 4);
    feedback.gain.value = (decayFactors[i] ?? 0.8) * amount * 0.3;

    source.connect(delay);
    delay.connect(feedback);
    feedback.connect(wetGain);
  }

  wetGain.connect(outputGain);

  return outputGain;
}

/**
 * Apply delay effect with feedback
 */
export function applyDelay(
  ctx: any,
  source: any,
  mix: number,
  time: number = 0.25,
  feedback: number = 0.3
): any {
  if (mix <= 0) {
    return source;
  }

  const delayNode = ctx.createDelay(2.0);
  const feedbackGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const dryGain = ctx.createGain();
  const outputGain = ctx.createGain();

  delayNode.delayTime.value = Math.max(0.001, Math.min(2, time));
  feedbackGain.gain.value = Math.min(0.95, feedback); // Prevent runaway feedback
  wetGain.gain.value = mix;
  dryGain.gain.value = 1 - mix * 0.3; // Keep dry signal prominent

  // Dry path
  source.connect(dryGain);
  dryGain.connect(outputGain);

  // Wet path with feedback
  source.connect(delayNode);
  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode); // Feedback loop
  delayNode.connect(wetGain);
  wetGain.connect(outputGain);

  return outputGain;
}

/**
 * Build the complete effects chain for a sound
 * Returns stereo output nodes (leftOutput, rightOutput)
 *
 * Superdough effect order:
 * 1. Gain (input gain)
 * 2. Lowpass Filter (lpf)
 * 3. Highpass Filter (hpf)
 * 4. Bandpass Filter (bpf)
 * 5. Vowel Filter (formant filter)
 * 6. Sample Rate Reduction (coarse) - applied to buffer in post-processing
 * 7. Bit Crushing (crush) - applied to buffer in post-processing
 * 8. Waveshape (shape)
 * 9. Distortion (distort)
 * 10. Tremolo (LFO amplitude modulation)
 * 11. Compressor (dynamics)
 * 12. Panning (pan)
 * 13. Phaser (all-pass filter chain with LFO)
 * 14. Postgain (output gain)
 *
 * Reverb and delay are routed through orbit/shared buses for efficiency
 */
export function buildEffectsChain(
  ctx: any,
  source: any,
  params: EffectParams,
  orbitBus?: OrbitBus
): { leftOutput: any; rightOutput: any; dryOutput?: any } {
  let currentNode = source;

  // 1. Input Gain
  if (params.gain !== undefined && params.gain !== 1) {
    const inputGain = ctx.createGain();
    inputGain.gain.value = Math.max(0, params.gain);
    currentNode.connect(inputGain);
    currentNode = inputGain;
  }

  // 2. Lowpass Filter
  if (params.lpf !== undefined && params.lpf < 20000) {
    currentNode = applyLowpassFilter(ctx, currentNode, params.lpf, params.lpq || 1);
  }

  // 3. Highpass Filter
  if (params.hpf !== undefined && params.hpf > 20) {
    currentNode = applyHighpassFilter(ctx, currentNode, params.hpf, params.hpq || 1);
  }

  // 4. Bandpass Filter
  if (params.bpf !== undefined) {
    currentNode = applyBandpassFilter(ctx, currentNode, params.bpf, params.bpq || 1);
  }

  // 5. Vowel Filter (formant filter banks)
  if (params.vowel !== undefined && params.vowel.length > 0) {
    currentNode = applyVowelFilter(ctx, currentNode, params.vowel);
  }

  // 6-7. Coarse/Crush are post-processing effects (applied to buffer before audio graph)

  // 8. Waveshape
  if (params.shape !== undefined && params.shape > 0) {
    currentNode = applyDistortion(ctx, currentNode, params.shape);
  }

  // 9. Distortion
  if (params.distort !== undefined && params.distort > 0) {
    currentNode = applyDistortion(ctx, currentNode, params.distort);
  }

  // 10. Tremolo (LFO modulating gain)
  if (params.tremolo !== undefined && params.tremolo > 0) {
    currentNode = applyTremolo(ctx, currentNode, params.tremolo, params.tremoloRate || 4);
  }

  // 11. Compressor (dynamics processing)
  if (params.compressor !== undefined) {
    currentNode = applyCompressor(ctx, currentNode, params.compressor);
  }

  // 12. Panning - apply before phaser for per-voice panning
  const pan = params.pan !== undefined ? params.pan : 0.5;
  const { leftGain, rightGain } = applyPanning(ctx, currentNode, pan);

  // Store reference to pre-phaser node for send effects
  let leftOutput = leftGain;
  let rightOutput = rightGain;

  // 13. Phaser (applied to stereo signal)
  if (params.phaser !== undefined && params.phaser > 0) {
    // Apply phaser to left channel
    const leftPhased = applyPhaser(ctx, leftGain, params.phaser, params.phaserRate || 0.5);
    // Apply phaser to right channel with slight rate offset for stereo width
    const rightPhased = applyPhaser(ctx, rightGain, params.phaser, (params.phaserRate || 0.5) * 1.02);
    leftOutput = leftPhased;
    rightOutput = rightPhased;
  }

  // 14. Postgain
  if (params.postgain !== undefined && params.postgain !== 1) {
    const leftPostgain = ctx.createGain();
    const rightPostgain = ctx.createGain();
    leftPostgain.gain.value = Math.max(0, params.postgain);
    rightPostgain.gain.value = Math.max(0, params.postgain);
    leftOutput.connect(leftPostgain);
    rightOutput.connect(rightPostgain);
    leftOutput = leftPostgain;
    rightOutput = rightPostgain;
  }

  // Route to orbit buses for shared reverb/delay if available
  if (orbitBus) {
    const reverbAmount = params.room || 0;
    const delayAmount = params.delay || 0;

    if (reverbAmount > 0 || delayAmount > 0) {
      // Create a mono mix for send effects
      const sendMix = ctx.createGain();
      sendMix.gain.value = 0.5;
      leftOutput.connect(sendMix);
      rightOutput.connect(sendMix);

      // Send to orbit bus
      if (reverbAmount > 0) {
        const reverbSendGain = ctx.createGain();
        reverbSendGain.gain.value = Math.min(1, Math.max(0, reverbAmount));
        sendMix.connect(reverbSendGain);
        reverbSendGain.connect(orbitBus.reverbSend);
      }

      if (delayAmount > 0) {
        const delaySendGain = ctx.createGain();
        delaySendGain.gain.value = Math.min(1, Math.max(0, delayAmount));
        sendMix.connect(delaySendGain);
        delaySendGain.connect(orbitBus.delaySend);
      }
    }
  } else {
    // Fallback: apply reverb and delay inline when no orbit bus is available
    if (params.room !== undefined && params.room > 0) {
      // Apply reverb to left/right channels
      const leftReverb = applyReverb(ctx, leftOutput, params.room, params.roomsize || 4);
      const rightReverb = applyReverb(ctx, rightOutput, params.room, params.roomsize || 4);
      leftOutput = leftReverb;
      rightOutput = rightReverb;
    }

    if (params.delay !== undefined && params.delay > 0) {
      // Apply delay to left/right channels
      const leftDelay = applyDelay(
        ctx,
        leftOutput,
        params.delay,
        params.delaytime || 0.25,
        params.delayfeedback || 0.3
      );
      const rightDelay = applyDelay(
        ctx,
        rightOutput,
        params.delay,
        (params.delaytime || 0.25) * 1.1, // Slight offset for stereo width
        params.delayfeedback || 0.3
      );
      leftOutput = leftDelay;
      rightOutput = rightDelay;
    }
  }

  return { leftOutput, rightOutput };
}

/**
 * Apply post-processing effects to rendered audio buffer
 * These effects modify the buffer directly (bit crush, sample rate reduction)
 */
export function applyPostProcessingEffects(
  buffer: Float32Array,
  params: EffectParams
): Float32Array {
  let processed = buffer;

  // Apply sample rate reduction
  if (params.coarse !== undefined && params.coarse > 1) {
    processed = applySampleRateReduction(processed, params.coarse);
    logger.debug({ coarse: params.coarse }, 'Applied sample rate reduction');
  }

  // Apply bit crushing
  if (params.crush !== undefined && params.crush < 16) {
    processed = applyBitCrush(processed, params.crush);
    logger.debug({ crush: params.crush }, 'Applied bit crushing');
  }

  return processed;
}

/**
 * Apply post-processing effects to all channels of an AudioBuffer
 * Returns an array of processed Float32Arrays, one per channel
 * Preserves stereo/multi-channel fidelity
 */
export function applyPostProcessingEffectsMultiChannel(
  audioBuffer: any, // AudioBuffer from Web Audio API
  params: EffectParams
): Float32Array[] {
  const channelCount = audioBuffer.numberOfChannels as number;
  const processedChannels: Float32Array[] = [];

  for (let channel = 0; channel < channelCount; channel++) {
    const channelData = audioBuffer.getChannelData(channel) as Float32Array;
    const processed = applyPostProcessingEffects(channelData, params);
    processedChannels.push(processed);
  }

  return processedChannels;
}

/**
 * Vowel formant frequencies for formant filter
 * Each vowel has 3 formant frequencies (F1, F2, F3) with bandwidths
 */
const vowelFormants: Record<string, { freqs: number[]; bandwidths: number[] }> = {
  a: { freqs: [800, 1200, 2800], bandwidths: [80, 90, 120] },
  e: { freqs: [400, 2200, 2800], bandwidths: [70, 80, 100] },
  i: { freqs: [320, 2500, 3200], bandwidths: [60, 90, 120] },
  o: { freqs: [500, 850, 2800], bandwidths: [70, 80, 100] },
  u: { freqs: [400, 750, 2400], bandwidths: [60, 70, 100] },
};

/**
 * Apply vowel formant filter to audio node chain
 * Creates a parallel bank of bandpass filters tuned to vowel formants
 */
export function applyVowelFilter(
  ctx: any,
  source: any,
  vowel: string
): any {
  const formantData = vowelFormants[vowel.toLowerCase()];
  if (!formantData) {
    return source;
  }

  const { freqs, bandwidths } = formantData;

  // Create a gain node to mix the formant filters
  const outputGain = ctx.createGain();
  outputGain.gain.value = 1.0;

  // Create parallel bandpass filters for each formant
  for (let i = 0; i < freqs.length; i++) {
    const freq = freqs[i] ?? 800;
    const bandwidth = bandwidths[i] ?? 80;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    // Q = frequency / bandwidth
    filter.Q.value = freq / bandwidth;

    // Gain for each formant (lower formants typically louder)
    const formantGain = ctx.createGain();
    formantGain.gain.value = 1.0 / (i + 1);

    source.connect(filter);
    filter.connect(formantGain);
    formantGain.connect(outputGain);
  }

  return outputGain;
}

/**
 * Apply tremolo effect using an LFO modulating gain
 */
export function applyTremolo(
  ctx: any,
  source: any,
  depth: number,
  rate: number = 4
): any {
  if (depth <= 0) {
    return source;
  }

  // Create the signal chain
  const outputGain = ctx.createGain();

  // Create LFO (oscillator)
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = Math.max(0.1, Math.min(20, rate));

  // Create gain to scale LFO output
  const lfoGain = ctx.createGain();
  // Depth controls how much the gain varies (0 = no effect, 1 = full tremolo)
  const clampedDepth = Math.max(0, Math.min(1, depth));
  lfoGain.gain.value = clampedDepth * 0.5;

  // Connect LFO to modulate the output gain
  // LFO output is -1 to 1, scaled by lfoGain
  lfo.connect(lfoGain);
  lfoGain.connect(outputGain.gain);

  // Set base gain (center point of modulation)
  outputGain.gain.value = 1.0 - clampedDepth * 0.5;

  // Connect source through the modulated gain
  source.connect(outputGain);

  // Start the LFO
  lfo.start(0);

  return outputGain;
}

/**
 * Apply compressor effect using DynamicsCompressorNode
 */
export function applyCompressor(
  ctx: any,
  source: any,
  threshold: number,
  ratio: number = 4,
  attack: number = 0.003,
  release: number = 0.25
): any {
  const compressor = ctx.createDynamicsCompressor();

  // Threshold in dB (-100 to 0)
  compressor.threshold.value = Math.max(-100, Math.min(0, threshold));

  // Knee in dB (smoothness of compression curve)
  compressor.knee.value = 30;

  // Ratio (1:1 = no compression, higher = more compression)
  compressor.ratio.value = Math.max(1, Math.min(20, ratio));

  // Attack in seconds
  compressor.attack.value = Math.max(0, Math.min(1, attack));

  // Release in seconds
  compressor.release.value = Math.max(0, Math.min(1, release));

  source.connect(compressor);
  return compressor;
}

/**
 * Apply phaser effect using a chain of all-pass filters modulated by LFO
 */
export function applyPhaser(
  ctx: any,
  source: any,
  depth: number,
  rate: number = 0.5,
  stages: number = 4
): any {
  if (depth <= 0) {
    return source;
  }

  const clampedDepth = Math.max(0, Math.min(1, depth));
  const clampedRate = Math.max(0.1, Math.min(8, rate));
  const numStages = Math.max(2, Math.min(12, Math.floor(stages)));

  // Create dry/wet mix
  const dryGain = ctx.createGain();
  const wetGain = ctx.createGain();
  const outputGain = ctx.createGain();

  dryGain.gain.value = 1 - clampedDepth * 0.5;
  wetGain.gain.value = clampedDepth;

  // Create LFO for modulating all-pass filter frequencies
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = clampedRate;

  // Create all-pass filter chain
  let currentNode = source;
  const allPassFilters: any[] = [];

  for (let i = 0; i < numStages; i++) {
    const allPass = ctx.createBiquadFilter();
    allPass.type = 'allpass';
    // Stagger base frequencies across the spectrum
    const baseFreq = 100 + (i * 300);
    allPass.frequency.value = baseFreq;
    allPass.Q.value = 0.5;

    // Create gain to scale LFO for this filter
    const lfoScaler = ctx.createGain();
    lfoScaler.gain.value = baseFreq * 0.8; // Modulation range

    // Connect LFO to modulate filter frequency
    lfo.connect(lfoScaler);
    lfoScaler.connect(allPass.frequency);

    currentNode.connect(allPass);
    currentNode = allPass;
    allPassFilters.push(allPass);
  }

  // Connect dry path
  source.connect(dryGain);
  dryGain.connect(outputGain);

  // Connect wet path (through all-pass chain)
  currentNode.connect(wetGain);
  wetGain.connect(outputGain);

  // Start LFO
  lfo.start(0);

  return outputGain;
}

/**
 * Orbit bus manager for shared reverb and delay effects
 * Superdough uses "orbits" to share reverb/delay sends across multiple sounds
 */
export interface OrbitBus {
  reverbSend: any;
  delaySend: any;
  reverbReturn: any;
  delayReturn: any;
  outputL: any;
  outputR: any;
}

/**
 * Create orbit buses for shared reverb and delay
 * Returns send nodes that individual sounds can connect to
 */
export function createOrbitBuses(
  ctx: any,
  destinationL: any,
  destinationR: any,
  reverbSize: number = 4,
  delayTime: number = 0.25,
  delayFeedback: number = 0.3
): OrbitBus {
  // Create reverb send/return
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 1.0;

  // Create reverb effect on the bus
  const reverbReturn = createReverbEffect(ctx, reverbSize);
  reverbSend.connect(reverbReturn);

  // Create delay send/return
  const delaySend = ctx.createGain();
  delaySend.gain.value = 1.0;

  // Create delay effect on the bus
  const delayReturn = createDelayEffect(ctx, delayTime, delayFeedback);
  delaySend.connect(delayReturn);

  // Create stereo outputs for the bus
  const outputL = ctx.createGain();
  const outputR = ctx.createGain();

  // Connect reverb and delay returns to stereo output
  reverbReturn.connect(outputL);
  reverbReturn.connect(outputR);
  delayReturn.connect(outputL);
  delayReturn.connect(outputR);

  // Connect to final destinations
  outputL.connect(destinationL);
  outputR.connect(destinationR);

  return {
    reverbSend,
    delaySend,
    reverbReturn,
    delayReturn,
    outputL,
    outputR,
  };
}

/**
 * Create a reverb effect node for orbit bus
 */
function createReverbEffect(ctx: any, size: number = 4): any {
  const outputGain = ctx.createGain();
  outputGain.gain.value = 0.8;

  // Create multiple delay lines for diffusion (Schroeder reverb style)
  const delayTimes = [0.029, 0.037, 0.041, 0.053, 0.067, 0.073, 0.079, 0.083];
  const decayFactors = [0.9, 0.88, 0.86, 0.84, 0.82, 0.80, 0.78, 0.76];

  // Create input gain for the reverb
  const inputGain = ctx.createGain();
  inputGain.gain.value = 1.0;

  // Create parallel delay lines
  for (let i = 0; i < delayTimes.length; i++) {
    const delay = ctx.createDelay(1.0);
    const feedback = ctx.createGain();

    delay.delayTime.value = (delayTimes[i] ?? 0.03) * (size / 4);
    feedback.gain.value = (decayFactors[i] ?? 0.8) * 0.3;

    inputGain.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay); // Feedback loop
    delay.connect(outputGain);
  }

  // Return a node that can receive input
  // We need to expose the input gain as the connection point
  inputGain._output = outputGain;
  return inputGain;
}

/**
 * Create a delay effect node for orbit bus
 */
function createDelayEffect(
  ctx: any,
  time: number = 0.25,
  feedback: number = 0.3
): any {
  const delayNode = ctx.createDelay(2.0);
  const feedbackGain = ctx.createGain();
  const outputGain = ctx.createGain();

  delayNode.delayTime.value = Math.max(0.001, Math.min(2, time));
  feedbackGain.gain.value = Math.min(0.95, feedback);
  outputGain.gain.value = 0.8;

  // Create input gain
  const inputGain = ctx.createGain();
  inputGain.gain.value = 1.0;

  // Connect with feedback
  inputGain.connect(delayNode);
  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);
  delayNode.connect(outputGain);

  inputGain._output = outputGain;
  return inputGain;
}

/**
 * Connect a sound source to orbit buses with specified send amounts
 */
export function connectToOrbitBuses(
  source: any,
  orbitBus: OrbitBus,
  reverbAmount: number,
  delayAmount: number
): void {
  if (reverbAmount > 0) {
    const reverbSendGain = source.context.createGain();
    reverbSendGain.gain.value = Math.min(1, Math.max(0, reverbAmount));
    source.connect(reverbSendGain);
    reverbSendGain.connect(orbitBus.reverbSend);
  }

  if (delayAmount > 0) {
    const delaySendGain = source.context.createGain();
    delaySendGain.gain.value = Math.min(1, Math.max(0, delayAmount));
    source.connect(delaySendGain);
    delaySendGain.connect(orbitBus.delaySend);
  }
}
