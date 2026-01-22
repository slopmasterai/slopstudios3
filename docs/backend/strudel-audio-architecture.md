# Strudel Audio Architecture Deep Dive

This document provides comprehensive technical documentation of Strudel's audio
system architecture, based on research from the official Strudel repository on
Codeberg and official documentation. It serves as a migration guide from the
current custom synthesis implementation to Strudel's proven audio engine.

## Executive Summary

The current implementation uses custom Web Audio synthesis with basic
oscillators and noise generation. This causes three main issues:

1. **Windy static noise** from custom noise generation in drum synthesis
2. **Missing instruments** due to limited synthesized sounds (~150 in sound
   library)
3. **Sporadic drum beats** from timing/scheduling problems

The solution is to integrate Strudel's Superdough audio engine, which provides
real sample playback, proper scheduling, and a comprehensive effects chain.

## Table of Contents

1. [Repository Structure](#repository-structure)
2. [Superdough Audio Engine](#superdough-audio-engine)
3. [Scheduler and Timing System](#scheduler-and-timing-system)
4. [Effects Chain](#effects-chain)
5. [Sample Library Management](#sample-library-management)
6. [Web Audio Integration Patterns](#web-audio-integration-patterns)
7. [Migration Strategy](#migration-strategy)
8. [Gap Analysis](#gap-analysis)

---

## Repository Structure

### Strudel Monorepo Organization

The Strudel codebase is organized as a monorepo hosted at
`https://codeberg.org/uzu/strudel` with the following structure:

```
strudel/
├── packages/           # Individual npm packages
│   ├── core/           # @strudel/core - Pattern engine
│   ├── mini/           # @strudel/mini - Mini-notation parser
│   ├── transpiler/     # @strudel/transpiler - Code transformation
│   ├── webaudio/       # @strudel/webaudio - Web Audio bindings
│   └── superdough/     # superdough - Audio engine (standalone)
├── website/            # Documentation site (strudel.cc)
├── samples/            # Sample banks
├── test/               # Test suite
└── bench/              # Performance benchmarks
```

### Build System

- **Package Manager:** pnpm with workspace configuration
- **Monorepo Tool:** Lerna for coordinated versioning
- **Build System:** npm scripts
- **Testing:** Vitest

### Key Packages and Their Roles

| Package               | Purpose                                  | Our Usage |
| --------------------- | ---------------------------------------- | --------- |
| `@strudel/core`       | Pattern primitives, TimeSpan, Haps       | ✅ Used   |
| `@strudel/mini`       | Mini-notation parsing                    | ✅ Used   |
| `@strudel/transpiler` | Code transpilation and syntax sugar      | ✅ Used   |
| `@strudel/webaudio`   | Thin binding to superdough               | ⚠️ Unused |
| `superdough`          | Audio engine (sampler + synth + effects) | ❌ Unused |

---

## Superdough Audio Engine

### Overview

Superdough is a standalone Web Audio sampler and synthesizer designed for live
coding. It is the default audio output for Strudel but can be used independently
in any web-based music system.

### Core API

```javascript
import { superdough, samples, initAudioOnFirstClick } from 'superdough';

// Initialize audio (handles browser autoplay policy)
initAudioOnFirstClick();

// Load samples
await samples('github:tidalcycles/dirt-samples');

// Trigger a sound
superdough(
  {
    s: 'bd', // sample name
    n: 0, // sample index
    gain: 0.8, // volume
    pan: 0.5, // stereo position
    room: 0.3, // reverb send
    delay: 0.2, // delay send
    lpf: 2000, // lowpass filter
  },
  audioContext.currentTime, // deadline (when to play)
  0.5 // duration in seconds
);
```

### Sound Sources

Superdough supports multiple sound generation methods:

1. **Sample Playback**

   - Loads samples from URLs or GitHub repositories
   - Supports multiple samples per name (selectable via `n` parameter)
   - Automatic pitch detection for melodic samples

2. **Waveform Synthesis**

   - Six basic waveforms: sine, triangle, sawtooth, square, pulse, noise
   - FM synthesis with configurable modulation
   - ZZFX-style sound effects synthesis

3. **Pitched Samples**
   - Samples can define base pitches
   - Automatic pitch shifting to match requested notes

### Value Object Schema

The superdough function accepts a value object with these parameters:

```typescript
interface SuperdoughValue {
  // Sound selection
  s?: string; // Sample/sound name
  n?: number; // Sample index within bank
  sound?: string; // Alias for s

  // Pitch
  note?: string | number; // Note name or MIDI number
  freq?: number; // Direct frequency in Hz

  // Amplitude
  gain?: number; // Volume (0-1, exponential)
  velocity?: number; // Alias (0-1)
  amp?: number; // Alias

  // Spatial
  pan?: number; // Stereo position (0=left, 0.5=center, 1=right)
  orbit?: number; // Effect bus routing

  // Envelope (ADSR)
  attack?: number; // Attack time
  decay?: number; // Decay time
  sustain?: number; // Sustain level (0-1)
  release?: number; // Release time

  // Filters
  lpf?: number; // Lowpass frequency
  hpf?: number; // Highpass frequency
  bpf?: number; // Bandpass frequency
  lpq?: number; // Lowpass Q/resonance
  hpq?: number; // Highpass Q
  bpq?: number; // Bandpass Q

  // Effects
  room?: number; // Reverb send (0-1)
  roomsize?: number; // Reverb room size
  delay?: number; // Delay send (0-1)
  delaytime?: number; // Delay time
  delayfeedback?: number; // Delay feedback

  // Modulation
  crush?: number; // Bit crushing (1-16)
  coarse?: number; // Sample rate reduction
  distort?: number; // Distortion amount
  shape?: number; // Waveshaping
}
```

---

## Scheduler and Timing System

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Pattern Code                                  │
│                    s("bd sd hh sd")                                 │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ evaluate()
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Pattern Object                                │
│              { queryArc(begin, end) → Hap[] }                       │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Scheduler                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  setInterval(50ms) {                                          │  │
│  │    const now = audioContext.currentTime;                      │  │
│  │    const begin = timeToCycles(now);                           │  │
│  │    const end = timeToCycles(now + interval + minLatency);     │  │
│  │    const haps = pattern.queryArc(begin, end);                 │  │
│  │    haps.forEach(hap => {                                      │  │
│  │      if (hap.hasOnset()) {                                    │  │
│  │        const deadline = cyclesToTime(hap.whole.begin);        │  │
│  │        superdough(hap.value, deadline, hap.duration);         │  │
│  │      }                                                        │  │
│  │    });                                                        │  │
│  │  }                                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Superdough                                    │
│              superdough(value, deadline, duration)                   │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Web Audio API                                   │
│   AudioNodes scheduled at precise times using audioContext.time     │
└─────────────────────────────────────────────────────────────────────┘
```

### Timing Parameters

| Parameter     | Value | Description                          |
| ------------- | ----- | ------------------------------------ |
| Query Interval | 50ms  | How often the scheduler checks for events |
| Min Latency    | 100ms | Buffer before events trigger         |
| Total Latency  | 50-150ms | Range between evaluation and playback |

### The Tale of Two Clocks

Strudel implements the "Tale of Two Clocks" pattern, the de facto standard for
Web Audio scheduling:

1. **JavaScript Clock** (`setInterval`): Runs in a Web Worker, triggers every
   50ms
2. **AudioContext Clock** (`audioContext.currentTime`): High-precision timing
   for scheduling audio nodes

The scheduler queries the pattern using JavaScript timing but schedules audio
nodes using the precise AudioContext clock.

### Pattern Query Mechanics

```javascript
// Patterns are queried by cycle time (0-1 = one cycle)
const haps = pattern.queryArc(0, 1); // Query first cycle

// Each Hap contains:
{
  whole: { begin: Fraction, end: Fraction },  // Event boundaries
  part: { begin: Fraction, end: Fraction },   // Visible portion
  value: { s: 'bd', gain: 0.8, ... },         // Sound parameters
  hasOnset(): boolean                          // True if event starts here
}
```

### CPS (Cycles Per Second)

- Default: 0.5 CPS = 120 BPM (one cycle = 2 seconds)
- BPM to CPS: `cps = bpm / 60 / 2`
- Time to Cycles: `cycles = time * cps`
- Cycles to Time: `time = cycles / cps`

---

## Effects Chain

### Signal Flow

Strudel processes audio through a strictly ordered signal chain:

```
Sound Source (Sample/Synth)
         │
         ▼
┌─────────────────────────────────────┐
│         LOCAL EFFECTS               │
│  (per-event, in order if called)    │
├─────────────────────────────────────┤
│  1. Detune / Phase Vocoder          │
│  2. Gain                            │
│  3. Lowpass Filter (lpf)            │
│  4. Highpass Filter (hpf)           │
│  5. Bandpass Filter (bpf)           │
│  6. Vowel Filter                    │
│  7. Sample Rate Reduction (coarse)  │
│  8. Bit Crushing (crush)            │
│  9. Waveshape (shape)               │
│ 10. Distortion (distort)            │
│ 11. Tremolo                         │
│ 12. Compressor                      │
│ 13. Panning (pan)                   │
│ 14. Phaser                          │
│ 15. Postgain                        │
└─────────────────────────────────────┘
         │
         ├──────────────────────────────┐
         │                              │
         ▼                              ▼
┌─────────────────┐         ┌─────────────────────────┐
│   Dry Signal    │         │      Effect Sends       │
└────────┬────────┘         │  ┌─────────┐ ┌───────┐  │
         │                  │  │  Delay  │ │Reverb │  │
         │                  │  └────┬────┘ └───┬───┘  │
         │                  │       │          │      │
         │                  └───────┴──────────┴──────┘
         │                              │
         └──────────────┬───────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   Orbit Mixer   │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Stereo Output  │
              └─────────────────┘
```

### Orbit System

"Orbits" are global parameter contexts that share effect chains:

- Default orbit: 1
- Patterns with same orbit share delay/reverb
- Use `.orbit(n)` to assign different effect buses
- Avoid parameter conflicts on shared orbits

### Effect Parameters Reference

#### Filters

| Effect    | Parameters                | Range           |
| --------- | ------------------------- | --------------- |
| `lpf`     | Cutoff frequency, Q       | 0-20000 Hz, 0-50 |
| `hpf`     | Cutoff frequency, Q       | 0-20000 Hz, 0-50 |
| `bpf`     | Center frequency, Q       | 0-20000 Hz, 0-50 |
| `vowel`   | Vowel shape (a,e,i,o,u)   | String          |

#### Dynamics

| Effect       | Parameters                    | Range      |
| ------------ | ----------------------------- | ---------- |
| `gain`       | Volume (exponential)          | 0-1+       |
| `velocity`   | Volume multiplier             | 0-1        |
| `compressor` | threshold, ratio, knee, attack, release | Various |

#### Distortion

| Effect    | Parameters              | Range    |
| --------- | ----------------------- | -------- |
| `coarse`  | Fake resampling factor  | 1-32+    |
| `crush`   | Bit depth               | 1-16     |
| `distort` | Distortion amount       | 0-10+    |
| `shape`   | Waveshaping amount      | 0-1      |

#### Spatial

| Effect | Parameters        | Range               |
| ------ | ----------------- | ------------------- |
| `pan`  | Stereo position   | 0=left, 0.5=center, 1=right |

#### Global (Orbit-Based)

| Effect  | Parameters              | Range    |
| ------- | ----------------------- | -------- |
| `room`  | Reverb send level       | 0-1      |
| `roomsize` | Room dimensions      | 0-10     |
| `delay` | Delay send level        | 0-1      |
| `delaytime` | Delay duration      | Seconds  |
| `delayfeedback` | Feedback amount | 0-1 (avoid ≥1) |

---

## Sample Library Management

### Dirt-Samples Repository

The standard sample library is hosted at
`github:tidalcycles/Dirt-Samples` with ~220 sound categories:

- **Drum machines:** 808, 909, dr55, dr110
- **Percussion:** tabla, latin instruments
- **Bass:** bass0-3, jungbass, bassdm
- **Synth:** juno, moog, sid, fm
- **Vocal:** alphabet, numbers, speech
- **Ambient/FX:** pads, wind, birds

### Sample Loading Methods

```javascript
// 1. GitHub shorthand
await samples('github:tidalcycles/dirt-samples');

// 2. Direct URL to strudel.json
await samples(
  'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json'
);

// 3. Inline sample map
await samples(
  {
    bd: ['bd/BT0AADA.wav', 'bd/BT0AAD0.wav'],
    sd: ['sd/rytm-01-classic.wav', 'sd/rytm-00-hard.wav'],
  },
  'github:tidalcycles/dirt-samples'
);
```

### strudel.json Format

```json
{
  "_base": "https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/",
  "bd": ["bd/BT0A0A7.wav", "bd/BT0A0D0.wav", "bd/BT0A0D3.wav"],
  "sd": ["sd/rytm-00-hard.wav", "sd/rytm-01-classic.wav"],
  "hh": ["hh/000_hh3closedhh.wav"]
}
```

### Pitched Sample Mapping

For melodic samples, specify base pitches:

```javascript
await samples({
  moog: {
    g2: 'moog/004_G2.wav',
    g3: 'moog/005_G3.wav',
    g4: 'moog/006_G4.wav',
  },
});
```

---

## Web Audio Integration Patterns

### OfflineAudioContext for Rendering

For server-side or offline rendering:

```javascript
import { OfflineAudioContext } from 'web-audio-engine';

async function renderPattern(pattern, duration, sampleRate) {
  const channels = 2;
  const totalSamples = duration * sampleRate;

  const offlineCtx = new OfflineAudioContext(channels, totalSamples, sampleRate);

  // Query pattern for all events
  const cps = 0.5;
  const numCycles = duration * cps;
  const haps = pattern.queryArc(0, numCycles);

  // Schedule each event
  for (const hap of haps) {
    if (!hap.hasOnset()) continue;

    const startTime = hap.whole.begin.valueOf() / cps;
    const hapDuration = (hap.whole.end.valueOf() - hap.whole.begin.valueOf()) / cps;

    // Create and schedule audio nodes for this event
    await scheduleSound(offlineCtx, hap.value, startTime, hapDuration);
  }

  // Render
  const renderedBuffer = await offlineCtx.startRendering();
  return renderedBuffer;
}
```

### WAV Export

```javascript
function audioBufferToWav(buffer, sampleRate, channels) {
  const length = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert float samples to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Uint8Array(arrayBuffer);
}
```

---

## Migration Strategy

### Phase 1: Add Superdough Dependency

```bash
npm install superdough
```

Update package.json:

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

### Phase 2: Implement Sample Loading

Replace the limited `SAMPLE_MAP` in `sample-cache.service.ts` with Strudel's
sample loading:

```typescript
// New: src/services/strudel-samples.service.ts
import { samples } from 'superdough';

const STRUDEL_SAMPLES_URL =
  'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json';

export async function loadStrudelSamples(): Promise<void> {
  await samples(STRUDEL_SAMPLES_URL);
  logger.info('Strudel samples loaded from Dirt-Samples repository');
}
```

### Phase 3: Replace Custom Synthesis

Replace `renderPatternToAudio` with Superdough-based rendering:

```typescript
async function renderPatternToAudio(
  pattern: any,
  duration: number,
  sampleRate: number,
  channels: number,
  cps: number = 0.5,
  onProgress?: (progress: number) => void
): Promise<Float32Array> {
  const offlineCtx = new NodeOfflineAudioContext(
    channels,
    duration * sampleRate,
    sampleRate
  );

  // Query all events
  const numCycles = duration * cps;
  const haps = pattern.queryArc(0, numCycles);

  // Use superdough for each event
  for (const hap of haps) {
    if (!hap.hasOnset()) continue;

    const startTime = hap.whole.begin.valueOf() / cps;
    const hapDuration = (hap.whole.end.valueOf() - hap.whole.begin.valueOf()) / cps;

    // superdough handles sample loading, synthesis, and effects
    await superdoughOffline(offlineCtx, hap.value, startTime, hapDuration);
  }

  const rendered = await offlineCtx.startRendering();
  return interleavedBuffer(rendered);
}
```

### Phase 4: Add Effects Chain

The effects chain comes free with Superdough. Pattern parameters automatically
route through the proper effects:

```javascript
// This "just works" with Superdough
s('bd sd hh sd')
  .gain(0.8)
  .room(0.3) // Reverb
  .delay(0.2) // Delay
  .lpf(2000); // Lowpass filter
```

### Phase 5: Update Client Integration

Update `client/src/hooks/useStrudel.ts` to use `@strudel/webaudio` for real-time
playback:

```typescript
import { initAudioOnFirstClick, getAudioContext, webaudioOutput } from '@strudel/webaudio';
import { repl } from '@strudel/core';

export function useStrudel() {
  const [scheduler, setScheduler] = useState<any>(null);

  useEffect(() => {
    initAudioOnFirstClick();
  }, []);

  const play = useCallback(async (code: string) => {
    const ctx = getAudioContext();
    const pattern = await evaluate(code);

    const newScheduler = repl({
      defaultOutput: webaudioOutput,
      getTime: () => ctx.currentTime,
    });

    newScheduler.setPattern(pattern);
    newScheduler.start();
    setScheduler(newScheduler);
  }, []);

  const stop = useCallback(() => {
    scheduler?.stop();
  }, [scheduler]);

  return { play, stop };
}
```

---

## Gap Analysis

### Current Implementation vs. Strudel

| Feature                  | Current                      | Strudel/Superdough         |
| ------------------------ | ---------------------------- | -------------------------- |
| Sample playback          | ~15 sample names, CDN fetch  | ~220 categories, lazy load |
| Synthesis                | Custom oscillators + noise   | Multiple synth engines     |
| Drum sounds              | Synthesized approximations   | Real samples               |
| Effects chain            | None                         | 15+ effects in order       |
| Reverb/Delay             | Not implemented              | Full orbit-based routing   |
| Scheduler                | Custom query loop            | 50ms interval + lookahead  |
| Timing precision         | JavaScript-based             | AudioContext clock-based   |
| Sample pitch shifting    | Disabled (incorrect)         | Automatic with base pitch  |
| Filter envelopes         | Not implemented              | Full ADSR per filter       |

### Root Causes of Current Issues

1. **Windy static noise:**

   - Cause: Custom noise generation using `Math.random()` creates harsh noise
   - Fix: Use Superdough's sampler with real hi-hat/snare samples

2. **Missing instruments:**

   - Cause: Only ~15 sample names mapped, synthesized fallback for others
   - Fix: Load full Dirt-Samples library via strudel.json

3. **Sporadic drum beats:**
   - Cause: Timing based on JavaScript clock, no lookahead scheduling
   - Fix: Use Strudel's scheduler with AudioContext clock synchronization

### Files to Modify

| File                                         | Changes                                 |
| -------------------------------------------- | --------------------------------------- |
| `src/services/strudel.service.ts`            | Replace `renderPatternToAudio`          |
| `src/services/sample-cache.service.ts`       | Replace with Superdough sample loading  |
| `client/src/hooks/useStrudel.ts`             | Use `@strudel/webaudio` for playback    |
| `client/src/pages/Strudel.tsx`               | Update UI for real-time playback        |
| `src/routes/strudel.routes.ts`               | No changes needed                       |
| `src/websocket/handlers/strudel.handler.ts`  | No changes needed                       |

---

## Testing and Validation

### Test Pattern Library

Create comprehensive test patterns covering all features:

```javascript
// Basic drum pattern
const basicDrums = 's("bd sd hh sd")';

// Melodic pattern
const melodic = 'note("c3 e3 g3 c4").s("piano")';

// Effects test
const effectsTest = 's("bd sd").room(0.3).delay(0.2).lpf(1000)';

// Complex layered pattern
const complex = `stack(
  s("bd*4"),
  s("hh*8").gain(0.5),
  note("c3 e3 g3 c4").s("piano")
)`;
```

### Audio Quality Validation

1. Compare rendered audio spectrum to expected frequencies
2. Verify timing accuracy within 5ms tolerance
3. Check for absence of clicks/pops at event boundaries
4. Validate effects chain processing order

### Performance Benchmarks

- Render 10 seconds of audio in < 2 seconds
- Memory usage under 500MB during render
- CPU usage under 80% on single core

---

## Resources

- [Strudel Repository (Codeberg)](https://codeberg.org/uzu/strudel)
- [Strudel Documentation](https://strudel.cc)
- [Superdough npm](https://www.npmjs.com/package/superdough)
- [Dough Documentation](https://dough.strudel.cc/)
- [Strudel Technical Manual - REPL](https://strudel.cc/technical-manual/repl/)
- [Strudel Technical Manual - Patterns](https://strudel.cc/technical-manual/patterns/)
- [Strudel Effects Reference](https://strudel.cc/learn/effects/)
- [Strudel Samples Guide](https://strudel.cc/learn/samples/)
- [Dirt-Samples Repository](https://github.com/tidalcycles/Dirt-Samples)
- [Web Audio API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
