# Strudel Audio System Migration Guide

This guide provides step-by-step instructions for migrating from the current
custom audio synthesis implementation to Strudel's Superdough audio engine.

## Prerequisites

Before starting the migration, ensure you have:

- Node.js 18+ installed
- Access to the codebase repository
- Understanding of the current `strudel.service.ts` implementation
- Familiarity with Web Audio API concepts

## Migration Overview

The migration consists of five phases:

1. **Phase 1:** Add Superdough dependency and update imports
2. **Phase 2:** Implement Strudel sample loading system
3. **Phase 3:** Replace custom synthesis with Superdough rendering
4. **Phase 4:** Add effects chain support
5. **Phase 5:** Update client-side integration

---

## Phase 1: Add Dependencies

### 1.1 Install Superdough

The `superdough` package is the standalone audio engine extracted from Strudel:

```bash
npm install superdough@^1.2.5
```

### 1.2 Verify Current Dependencies

Ensure these packages are at compatible versions:

```json
{
  "dependencies": {
    "@strudel/core": "^1.2.5",
    "@strudel/mini": "^1.2.5",
    "@strudel/transpiler": "^1.2.5",
    "@strudel/webaudio": "^1.2.6",
    "superdough": "^1.2.5",
    "web-audio-engine": "^0.13.4"
  }
}
```

### 1.3 Update Module Loading

Update `src/services/strudel.service.ts` to include Superdough:

```typescript
// Add to existing lazy-loaded modules
let superdough: ((value: any, time: number, duration: number) => void) | null = null;
let loadSamples: ((url: string) => Promise<void>) | null = null;

async function loadStrudelModules(): Promise<boolean> {
  // ... existing code ...

  try {
    // Add Superdough imports
    const superdoughModule = await import('superdough');
    superdough = superdoughModule.superdough;
    loadSamples = superdoughModule.samples;

    return true;
  } catch (error) {
    logger.warn({ error }, 'Failed to load Superdough modules');
    return false;
  }
}
```

---

## Phase 2: Implement Sample Loading

### 2.1 Create New Sample Service

Create `src/services/strudel-samples.service.ts`:

```typescript
/**
 * Strudel Samples Service
 * Loads and manages audio samples from Dirt-Samples repository
 */

import { logger } from '../utils/logger.js';

// Sample loading state
let samplesLoaded = false;
let sampleLoadPromise: Promise<void> | null = null;

// Default sample sources
const SAMPLE_SOURCES = [
  'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json',
];

/**
 * Lazily loads Superdough samples function
 */
async function getLoadSamples(): Promise<(url: string) => Promise<void>> {
  const superdoughModule = await import('superdough');
  return superdoughModule.samples;
}

/**
 * Initialize sample loading from Dirt-Samples
 */
export async function initStrudelSamples(): Promise<void> {
  if (samplesLoaded) return;

  if (sampleLoadPromise) {
    await sampleLoadPromise;
    return;
  }

  sampleLoadPromise = (async () => {
    try {
      const loadSamples = await getLoadSamples();

      logger.info('Loading Strudel samples from Dirt-Samples repository...');

      for (const source of SAMPLE_SOURCES) {
        try {
          await loadSamples(source);
          logger.info({ source }, 'Sample source loaded');
        } catch (error) {
          logger.warn({ error, source }, 'Failed to load sample source');
        }
      }

      samplesLoaded = true;
      logger.info('Strudel samples initialization complete');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Strudel samples');
      throw error;
    }
  })();

  await sampleLoadPromise;
}

/**
 * Check if samples are loaded
 */
export function areSamplesLoaded(): boolean {
  return samplesLoaded;
}

/**
 * Get list of available sample categories
 * Note: This requires accessing Superdough's internal sample map
 */
export async function getAvailableSampleCategories(): Promise<string[]> {
  // Superdough stores samples in an internal map
  // This function would need to access that map
  // For now, return known categories from Dirt-Samples
  return [
    '808',
    '808bd',
    '808cy',
    '808hc',
    '808ht',
    '808lc',
    '808lt',
    '808mc',
    '808mt',
    '808oh',
    '808sd',
    '909',
    'ab',
    'ade',
    'ades2',
    'ades3',
    'ades4',
    'alex',
    'alphabet',
    'amencutup',
    'armora',
    'arpy',
    'auto',
    'bass',
    'bass0',
    'bass1',
    'bass2',
    'bass3',
    'bassdm',
    'bassfoo',
    'battles',
    'bd',
    'bend',
    'bev',
    'bin',
    'birds',
    'birds3',
    'bleep',
    'blip',
    'blue',
    'bottle',
    'breaks125',
    'breaks152',
    'breaks157',
    'breaks165',
    'breath',
    'bubble',
    'can',
    'casio',
    'cb',
    'cc',
    'chin',
    'circus',
    'clak',
    'click',
    'clubkick',
    'co',
    'coins',
    'control',
    'cosmicg',
    'cp',
    'cr',
    'crow',
    'db',
    'diphone',
    'diphone2',
    'dist',
    'dork2',
    'dr',
    'dr2',
    'dr55',
    'dr_few',
    'drum',
    'drumtraks',
    'e',
    'east',
    'electro1',
    'em2',
    'erk',
    'f',
    'feel',
    'feelfx',
    'fest',
    'fire',
    'flick',
    'fm',
    'foo',
    'future',
    'gab',
    'gabba',
    'gabbaloud',
    'gabbalouder',
    'glasstap',
    'glitch',
    'glitch2',
    'gretsch',
    'gtr',
    'h',
    'hand',
    'hardcore',
    'hardkick',
    'haw',
    'hc',
    'hh',
    'hh27',
    'hit',
    'hmm',
    'ho',
    'hoover',
    'house',
    'ht',
    'if',
    'ifdrums',
    'incoming',
    'industrial',
    'insect',
    'invaders',
    'jazz',
    'jungbass',
    'jungle',
    'juno',
    'jvbass',
    'kicklinn',
    'koy',
    'kurt',
    'latibro',
    'led',
    'less',
    'lighter',
    'linnhats',
    'lt',
    'made',
    'made2',
    'mash',
    'mash2',
    'metal',
    'miniyeah',
    'moan',
    'modular',
    'moog',
    'mouth',
    'mp3',
    'msg',
    'mt',
    'mute',
    'newnotes',
    'noise',
    'noise2',
    'notes',
    'numbers',
    'oc',
    'odx',
    'off',
    'oh',
    'pad',
    'padlong',
    'pebbles',
    'perc',
    'peri',
    'pluck',
    'popkick',
    'print',
    'proc',
    'procshort',
    'psr',
    'rave',
    'rave2',
    'ravemono',
    'realclaps',
    'reverbkick',
    'rm',
    'rs',
    'sax',
    'sd',
    'seawolf',
    'sequential',
    'sf',
    'sheffield',
    'short',
    'sid',
    'sine',
    'sitar',
    'sn',
    'space',
    'speakspell',
    'speech',
    'speechless',
    'speedupdown',
    'stab',
    'stomp',
    'subroc3d',
    'sugar',
    'sundance',
    'tabla',
    'tabla2',
    'tablex',
    'tacscan',
    'tech',
    'techno',
    'tink',
    'tok',
    'toys',
    'trump',
    'ul',
    'ulgab',
    'uxay',
    'v',
    'voodoo',
    'wind',
    'wobble',
    'world',
    'xmas',
    'yeah',
  ];
}
```

### 2.2 Update Service Initialization

Update `initializeStrudelService` in `strudel.service.ts`:

```typescript
import { initStrudelSamples } from './strudel-samples.service.js';

export async function initializeStrudelService(
  config?: Partial<StrudelServiceConfig>
): Promise<void> {
  // ... existing config setup ...

  // Load Strudel modules
  const modulesLoaded = await loadStrudelModules();

  // Initialize samples (new)
  if (modulesLoaded) {
    await initStrudelSamples();
  }

  // ... rest of initialization ...
}
```

---

## Phase 3: Replace Custom Synthesis

### 3.1 Create Superdough Offline Renderer

Add this new function to `strudel.service.ts`:

```typescript
/**
 * Renders a sound event using Superdough in offline context
 */
async function renderSuperdoughEvent(
  offlineCtx: any,
  destinationL: any,
  destinationR: any,
  value: any,
  startTime: number,
  duration: number
): Promise<void> {
  // Extract parameters from the hap value
  const sampleName = value.s || value.sound;
  const sampleIndex = typeof value.n === 'number' ? value.n : 0;
  const gain = typeof value.gain === 'number' ? value.gain : 0.8;
  const pan = typeof value.pan === 'number' ? value.pan : 0.5;

  // Try to load and play real sample
  if (sampleName && hasSample(sampleName)) {
    try {
      const sampleBuffer = await getSampleBuffer(sampleName, sampleIndex, offlineCtx);
      if (sampleBuffer) {
        renderSampleBuffer(
          offlineCtx,
          destinationL,
          destinationR,
          sampleBuffer,
          startTime,
          gain,
          pan * 2 - 1, // Convert 0-1 to -1 to 1
          1.0, // playback rate
          extractEffects(value)
        );
        return;
      }
    } catch (error) {
      logger.warn({ error, sampleName }, 'Failed to load sample for Superdough event');
    }
  }

  // Fallback: Check for note-based synthesis
  if (value.note !== undefined || value.freq !== undefined) {
    const frequency = getFrequencyFromHap(value);
    const waveform = value.wave || 'sine';

    renderSynthNote(
      offlineCtx,
      destinationL,
      destinationR,
      frequency,
      startTime,
      duration,
      gain,
      pan * 2 - 1,
      waveform as OscillatorType
    );
    return;
  }

  // Last resort: Use sound library for synthesis
  if (sampleName) {
    await renderDrumSound(
      offlineCtx,
      destinationL,
      destinationR,
      sampleName,
      sampleIndex,
      startTime,
      gain,
      pan * 2 - 1
    );
  }
}

/**
 * Extract effects parameters from hap value
 */
function extractEffects(value: any): SampleEffects {
  const effects: SampleEffects = {};

  if (typeof value.lpf === 'number' || typeof value.cutoff === 'number') {
    effects.lpf = Math.max(1000, value.lpf ?? value.cutoff);
  }
  if (typeof value.hpf === 'number') {
    effects.hpf = value.hpf;
  }
  if (typeof value.room === 'number') {
    effects.room = value.room;
  }
  if (typeof value.delay === 'number') {
    effects.delay = value.delay;
  }

  return effects;
}
```

### 3.2 Update renderPatternToAudio

Replace the event rendering loop in `renderPatternToAudio`:

```typescript
async function renderPatternToAudio(
  pattern: any,
  duration: number,
  sampleRate: number,
  channels: number,
  cps: number = 0.5,
  onProgress?: (progress: number) => void
): Promise<Float32Array> {
  if (!NodeOfflineAudioContext || !strudelCore) {
    throw new Error('Audio rendering modules not available');
  }

  const totalSamples = Math.ceil(duration * sampleRate);
  const offlineCtx = new NodeOfflineAudioContext(channels, totalSamples, sampleRate);

  // Create channel merger for stereo
  const merger = offlineCtx.createChannelMerger(2);
  const leftGain = offlineCtx.createGain();
  const rightGain = offlineCtx.createGain();

  leftGain.connect(merger, 0, 0);
  rightGain.connect(merger, 0, 1);
  merger.connect(offlineCtx.destination);

  // Query pattern for events
  const numCycles = duration * cps;
  let haps: StrudelHap[] = [];

  // ... existing pattern query code ...

  // Sort by onset time
  haps.sort((a, b) => {
    const aBegin = a.whole?.begin?.valueOf?.() ?? 0;
    const bBegin = b.whole?.begin?.valueOf?.() ?? 0;
    return aBegin - bBegin;
  });

  let processedHaps = 0;
  const totalHaps = haps.length || 1;

  // Render each hap using Superdough-style rendering
  for (const hap of haps) {
    if (!hap.hasOnset()) continue;

    const startCycle = hap.whole.begin.valueOf();
    const endCycle = hap.whole.end.valueOf();
    const startTime = startCycle / cps;
    const hapDuration = (endCycle - startCycle) / cps;

    if (startTime >= duration || startTime < 0) continue;

    // Use new Superdough-style renderer
    await renderSuperdoughEvent(
      offlineCtx,
      leftGain,
      rightGain,
      hap.value,
      Math.max(0, startTime),
      Math.min(hapDuration, duration - startTime)
    );

    processedHaps++;
    if (onProgress && processedHaps % 100 === 0) {
      onProgress(Math.round((processedHaps / totalHaps) * 50));
    }
  }

  // Render and return
  onProgress?.(50);
  const renderedBuffer = await offlineCtx.startRendering();
  onProgress?.(90);

  // Convert to interleaved Float32Array
  const numChannels = Math.min(channels, renderedBuffer.numberOfChannels);
  const length = renderedBuffer.length;
  const interleaved = new Float32Array(length * numChannels);

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(renderedBuffer.getChannelData(ch));
  }

  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const channel = channelData[ch];
      interleaved[i * numChannels + ch] = channel ? (channel[i] ?? 0) : 0;
    }
  }

  onProgress?.(100);
  return interleaved;
}
```

---

## Phase 4: Add Effects Chain

### 4.1 Create Effects Processing Module

Create `src/services/strudel-effects.service.ts`:

```typescript
/**
 * Strudel Effects Service
 * Implements the Superdough effects chain for offline rendering
 */

import { logger } from '../utils/logger.js';

/**
 * Effects chain order (matching Superdough)
 */
export const EFFECTS_ORDER = [
  'gain',
  'lpf',
  'hpf',
  'bpf',
  'coarse',
  'crush',
  'distort',
  'pan',
] as const;

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
  filter.frequency.value = cutoff;
  filter.Q.value = q;
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
  filter.frequency.value = cutoff;
  filter.Q.value = q;
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
  filter.frequency.value = center;
  filter.Q.value = q;
  source.connect(filter);
  return filter;
}

/**
 * Apply panning to audio node
 */
export function applyPanning(ctx: any, source: any, pan: number): [any, any] {
  // pan: 0 = left, 0.5 = center, 1 = right
  // Convert to -1 to 1 range
  const panValue = pan * 2 - 1;

  const leftGain = ctx.createGain();
  const rightGain = ctx.createGain();

  // Equal power panning
  const angle = (panValue + 1) * Math.PI / 4;
  leftGain.gain.value = Math.cos(angle);
  rightGain.gain.value = Math.sin(angle);

  source.connect(leftGain);
  source.connect(rightGain);

  return [leftGain, rightGain];
}

/**
 * Apply distortion/waveshaping
 */
export function applyDistortion(ctx: any, source: any, amount: number): any {
  const waveshaper = ctx.createWaveShaper();
  const samples = 44100;
  const curve = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Soft clipping curve
    curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
  }

  waveshaper.curve = curve;
  source.connect(waveshaper);
  return waveshaper;
}

/**
 * Apply bit crushing
 */
export function applyBitCrush(ctx: any, source: any, bits: number): any {
  // Bit crushing is best done via ScriptProcessor or AudioWorklet
  // For OfflineAudioContext, we'll apply it to the buffer after rendering
  // Return source unchanged for now
  return source;
}

/**
 * Process effects chain for a hap value
 */
export function buildEffectsChain(
  ctx: any,
  source: any,
  value: any
): { output: any; leftOutput?: any; rightOutput?: any } {
  let current = source;

  // Apply gain
  if (typeof value.gain === 'number') {
    const gainNode = ctx.createGain();
    gainNode.gain.value = value.gain;
    current.connect(gainNode);
    current = gainNode;
  }

  // Apply lowpass filter
  if (typeof value.lpf === 'number' || typeof value.cutoff === 'number') {
    const cutoff = value.lpf ?? value.cutoff;
    const q = value.lpq ?? value.resonance ?? 1;
    current = applyLowpassFilter(ctx, current, cutoff, q);
  }

  // Apply highpass filter
  if (typeof value.hpf === 'number') {
    const q = value.hpq ?? 1;
    current = applyHighpassFilter(ctx, current, value.hpf, q);
  }

  // Apply bandpass filter
  if (typeof value.bpf === 'number') {
    const q = value.bpq ?? 1;
    current = applyBandpassFilter(ctx, current, value.bpf, q);
  }

  // Apply distortion
  if (typeof value.distort === 'number' && value.distort > 0) {
    current = applyDistortion(ctx, current, value.distort);
  }

  // Apply panning (returns stereo outputs)
  const pan = typeof value.pan === 'number' ? value.pan : 0.5;
  const [leftOutput, rightOutput] = applyPanning(ctx, current, pan);

  return { output: current, leftOutput, rightOutput };
}
```

### 4.2 Integrate Effects into Rendering

Update `renderSuperdoughEvent` to use the effects chain:

```typescript
import { buildEffectsChain } from './strudel-effects.service.js';

async function renderSuperdoughEvent(
  offlineCtx: any,
  destinationL: any,
  destinationR: any,
  value: any,
  startTime: number,
  duration: number
): Promise<void> {
  // ... sample/synth generation code ...

  // After creating the source node, apply effects chain
  const source = /* oscillator or buffer source */;
  const { leftOutput, rightOutput } = buildEffectsChain(offlineCtx, source, value);

  if (leftOutput && rightOutput) {
    leftOutput.connect(destinationL);
    rightOutput.connect(destinationR);
  }
}
```

---

## Phase 5: Update Client Integration

### 5.1 Update useStrudel Hook

Update `client/src/hooks/useStrudel.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

// Lazy load Strudel modules
let strudelModules: {
  initAudioOnFirstClick: () => void;
  getAudioContext: () => AudioContext;
  webaudioOutput: any;
  evaluate: (code: string) => Promise<any>;
  repl: (options: any) => any;
  samples: (url: string) => Promise<void>;
} | null = null;

async function loadStrudelModules() {
  if (strudelModules) return strudelModules;

  const [webaudio, transpiler, core, superdough] = await Promise.all([
    import('@strudel/webaudio'),
    import('@strudel/transpiler'),
    import('@strudel/core'),
    import('superdough'),
  ]);

  strudelModules = {
    initAudioOnFirstClick: webaudio.initAudioOnFirstClick,
    getAudioContext: webaudio.getAudioContext,
    webaudioOutput: webaudio.webaudioOutput,
    evaluate: transpiler.evaluate,
    repl: core.repl,
    samples: superdough.samples,
  };

  return strudelModules;
}

export function useStrudel() {
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schedulerRef = useRef<any>(null);

  // Initialize on mount
  useEffect(() => {
    (async () => {
      try {
        const modules = await loadStrudelModules();
        modules.initAudioOnFirstClick();

        // Load default samples
        await modules.samples('github:tidalcycles/dirt-samples');

        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize');
        setIsLoading(false);
      }
    })();
  }, []);

  const play = useCallback(async (code: string) => {
    try {
      setError(null);
      const modules = await loadStrudelModules();

      // Stop existing playback
      if (schedulerRef.current) {
        schedulerRef.current.stop();
      }

      // Evaluate pattern
      const pattern = await modules.evaluate(code);

      // Create scheduler with web audio output
      const ctx = modules.getAudioContext();
      const scheduler = modules.repl({
        defaultOutput: modules.webaudioOutput,
        getTime: () => ctx.currentTime,
      });

      scheduler.setPattern(pattern);
      scheduler.start();

      schedulerRef.current = scheduler;
      setIsPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback failed');
      setIsPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (schedulerRef.current) {
      schedulerRef.current.stop();
      schedulerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return {
    isLoading,
    isPlaying,
    error,
    play,
    stop,
  };
}
```

### 5.2 Update Strudel Page Component

Update `client/src/pages/Strudel.tsx` to use the new hook:

```typescript
import { useStrudel } from '../hooks/useStrudel';

export function StrudelPage() {
  const [code, setCode] = useState('s("bd sd hh sd")');
  const { isLoading, isPlaying, error, play, stop } = useStrudel();

  const handlePlay = () => {
    if (isPlaying) {
      stop();
    } else {
      play(code);
    }
  };

  return (
    <div className="strudel-page">
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={isLoading}
      />

      <button onClick={handlePlay} disabled={isLoading}>
        {isLoading ? 'Loading...' : isPlaying ? 'Stop' : 'Play'}
      </button>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

---

## Verification Checklist

After completing the migration, verify:

### Audio Quality

- [ ] Drum sounds play without static/noise
- [ ] All sample categories load correctly (bd, sd, hh, cp, etc.)
- [ ] Melodic samples play at correct pitches
- [ ] Effects (reverb, delay, filters) work correctly

### Timing

- [ ] Drum beats are consistent and on-beat
- [ ] Complex patterns maintain timing accuracy
- [ ] No clicks or pops at event boundaries

### Performance

- [ ] 10-second renders complete in < 2 seconds
- [ ] Memory usage stays under 500MB
- [ ] Client-side playback is smooth

### API Compatibility

- [ ] All existing endpoints continue to work
- [ ] WebSocket events fire correctly
- [ ] Progress callbacks update properly

---

## Rollback Plan

If issues arise, rollback by:

1. Revert `strudel.service.ts` changes
2. Remove `superdough` from package.json
3. Restore original `sample-cache.service.ts`
4. Revert client hook changes

Keep the original implementation in a feature branch for reference.

---

## Next Steps

After successful migration:

1. Add more sample categories from Dirt-Samples
2. Implement additional effects (phaser, tremolo, compressor)
3. Add real-time preview in the editor
4. Implement sample preloading for faster playback
5. Add audio visualization components
