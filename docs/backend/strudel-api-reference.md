# Strudel API Reference

Complete API reference for the Strudel audio system, including Superdough
parameters, pattern functions, and effects.

## Table of Contents

1. [Superdough API](#superdough-api)
2. [Pattern Functions](#pattern-functions)
3. [Sound Parameters](#sound-parameters)
4. [Effects Parameters](#effects-parameters)
5. [Mini-Notation Reference](#mini-notation-reference)
6. [Service API](#service-api)

---

## Superdough API

### Core Functions

#### `superdough(value, deadline, duration)`

Triggers a sound event at the specified time.

| Parameter  | Type   | Description                           |
| ---------- | ------ | ------------------------------------- |
| `value`    | Object | Sound parameters (see below)          |
| `deadline` | number | AudioContext time to start            |
| `duration` | number | Duration in seconds                   |

```javascript
superdough({ s: 'bd', gain: 0.8 }, audioContext.currentTime, 0.5);
```

#### `samples(source, baseUrl?)`

Loads audio samples from a source.

| Parameter | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| `source`  | string/Object | URL to strudel.json or sample map |
| `baseUrl` | string | Optional base URL for relative paths  |

```javascript
// Load from GitHub
await samples('github:tidalcycles/dirt-samples');

// Load from URL
await samples('https://example.com/samples/strudel.json');

// Inline sample map
await samples({
  bd: ['bd/kick1.wav', 'bd/kick2.wav'],
  sd: ['sd/snare1.wav'],
}, 'https://example.com/samples/');
```

#### `initAudioOnFirstClick()`

Initializes audio context on user interaction (required for browser autoplay policy).

```javascript
initAudioOnFirstClick();
```

#### `getAudioContext()`

Returns the global AudioContext instance.

```javascript
const ctx = getAudioContext();
console.log(ctx.currentTime);
```

---

## Pattern Functions

### Sound Selection

#### `s(pattern)` / `sound(pattern)`

Selects samples by name.

```javascript
s('bd sd hh sd');           // Basic pattern
s('bd:1 sd:0 hh:2 sd:3');   // With sample index
s('<bd bd:1 bd:2>');        // Alternating samples
```

#### `n(pattern)`

Selects sample index within a bank.

```javascript
s('bd').n('0 1 2 3');       // Cycle through samples
s('arpy').n(run(8));        // Run through first 8
```

### Pitch

#### `note(pattern)`

Sets note pitch using note names or MIDI numbers.

```javascript
note('c3 e3 g3 c4');        // Note names
note('60 64 67 72');        // MIDI numbers
note('c3').add(12);         // Transpose up octave
```

#### `freq(pattern)`

Sets frequency directly in Hz.

```javascript
freq(440);                  // A4
freq('220 440 880');        // Octaves of A
```

### Rhythm

#### `fast(factor)`

Speeds up the pattern.

```javascript
s('bd sd').fast(2);         // Twice as fast
s('bd sd').fast('<1 2 4>'); // Varying speed
```

#### `slow(factor)`

Slows down the pattern.

```javascript
s('bd sd hh sd').slow(2);   // Half speed
```

#### `euclid(pulses, steps, rotation?)`

Creates Euclidean rhythms.

```javascript
s('bd').euclid(3, 8);       // 3 pulses in 8 steps
s('bd').euclid(5, 8, 2);    // Rotated by 2
```

### Structure

#### `stack(...patterns)`

Layers patterns simultaneously.

```javascript
stack(
  s('bd*4'),
  s('~ sd ~ sd'),
  s('hh*8').gain(0.5)
);
```

#### `cat(...patterns)` / `seq(...patterns)`

Sequences patterns one after another.

```javascript
cat(
  s('bd*4'),
  s('sd*4'),
  s('hh*4')
);
```

#### `every(n, fn)`

Applies function every n cycles.

```javascript
s('bd sd hh sd').every(4, fast(2));
```

#### `sometimes(fn)` / `often(fn)` / `rarely(fn)`

Applies function with probability.

```javascript
s('bd sd').sometimes(fast(2));  // 50% chance
s('bd sd').often(fast(2));      // 75% chance
s('bd sd').rarely(fast(2));     // 25% chance
```

### Transformation

#### `rev()`

Reverses the pattern.

```javascript
s('bd sd hh cp').rev();     // cp hh sd bd
```

#### `jux(fn)` / `juxBy(amount, fn)`

Applies function to right channel only.

```javascript
s('bd sd').jux(rev);        // Stereo reversal
s('bd sd').juxBy(0.5, rev); // 50% stereo width
```

#### `off(time, fn)`

Overlays delayed, transformed version.

```javascript
note('c3 e3 g3').off(0.125, add(7));  // Canon effect
```

---

## Sound Parameters

### Amplitude

| Parameter    | Range   | Default | Description              |
| ------------ | ------- | ------- | ------------------------ |
| `gain`       | 0-1+    | 0.8     | Volume (exponential)     |
| `velocity`   | 0-1     | 1       | Volume multiplier        |
| `amp`        | 0-1     | 1       | Alias for velocity       |

```javascript
s('bd sd').gain(0.5);
s('bd sd').velocity(0.7);
```

### Envelope (ADSR)

| Parameter | Range     | Default | Description       |
| --------- | --------- | ------- | ----------------- |
| `attack`  | 0-10s     | 0.001   | Attack time       |
| `decay`   | 0-10s     | 0.05    | Decay time        |
| `sustain` | 0-1       | 0.6     | Sustain level     |
| `release` | 0-10s     | 0.1     | Release time      |

```javascript
note('c3').attack(0.1).decay(0.2).sustain(0.5).release(0.3);
```

### Spatial

| Parameter | Range | Default | Description                     |
| --------- | ----- | ------- | ------------------------------- |
| `pan`     | 0-1   | 0.5     | Stereo position (0=L, 1=R)      |
| `orbit`   | 0-11  | 0       | Effect bus routing              |

```javascript
s('bd').pan(0);         // Hard left
s('bd').pan(1);         // Hard right
s('bd').pan(0.5);       // Center
s('bd').orbit(1);       // Use orbit 1 effects
```

### Sample Control

| Parameter   | Range   | Default | Description                |
| ----------- | ------- | ------- | -------------------------- |
| `begin`     | 0-1     | 0       | Sample start point         |
| `end`       | 0-1     | 1       | Sample end point           |
| `speed`     | -10-10  | 1       | Playback speed             |
| `loop`      | 0/1     | 0       | Loop sample                |
| `loopBegin` | 0-1     | 0       | Loop start point           |
| `loopEnd`   | 0-1     | 1       | Loop end point             |
| `cut`       | 0-127   | -       | Cut group (stops previous) |

```javascript
s('break').begin(0).end(0.5);        // First half
s('break').speed(2);                  // Double speed
s('break').speed(-1);                 // Reverse
s('hh').cut(1);                       // Cut group 1
```

---

## Effects Parameters

### Filters

#### Lowpass Filter

| Parameter   | Range     | Default | Description        |
| ----------- | --------- | ------- | ------------------ |
| `lpf`       | 20-20000  | -       | Cutoff frequency   |
| `cutoff`    | 20-20000  | -       | Alias for lpf      |
| `lpq`       | 0-50      | 1       | Resonance/Q        |
| `resonance` | 0-50      | 1       | Alias for lpq      |

```javascript
s('bd sd hh sd').lpf(500);
s('bd sd hh sd').lpf(1000).lpq(10);
```

#### Highpass Filter

| Parameter | Range    | Default | Description      |
| --------- | -------- | ------- | ---------------- |
| `hpf`     | 20-20000 | -       | Cutoff frequency |
| `hpq`     | 0-50     | 1       | Resonance/Q      |

```javascript
s('hh*8').hpf(2000);
```

#### Bandpass Filter

| Parameter | Range    | Default | Description       |
| --------- | -------- | ------- | ----------------- |
| `bpf`     | 20-20000 | -       | Center frequency  |
| `bpq`     | 0-50     | 1       | Bandwidth/Q       |

```javascript
s('noise').bpf(1000).bpq(5);
```

#### Vowel Filter

| Parameter | Values         | Description    |
| --------- | -------------- | -------------- |
| `vowel`   | a,e,i,o,u,...  | Formant filter |

```javascript
s('bd sd').vowel('a e i o u');
```

### Distortion

| Parameter | Range | Default | Description            |
| --------- | ----- | ------- | ---------------------- |
| `distort` | 0-10  | 0       | Waveshaping distortion |
| `shape`   | 0-1   | 0       | Waveshaping amount     |
| `crush`   | 1-16  | -       | Bit depth reduction    |
| `coarse`  | 1-32  | -       | Sample rate reduction  |

```javascript
s('bd sd').distort(2);
s('bd sd').crush(4);         // 4-bit audio
s('bd sd').coarse(8);        // Retro sound
```

### Reverb (Global/Orbit)

| Parameter  | Range   | Default | Description         |
| ---------- | ------- | ------- | ------------------- |
| `room`     | 0-1     | 0       | Reverb send level   |
| `roomsize` | 0-10    | 2       | Room size           |
| `roomfade` | 0-10    | 0.75    | Decay time (seconds)|
| `roomlp`   | 20-20000| 18000   | Lowpass frequency   |
| `roomdim`  | 20-20000| 4000    | -60dB frequency     |

```javascript
s('bd sd').room(0.5).roomsize(4);
```

### Delay (Global/Orbit)

| Parameter       | Range | Default | Description       |
| --------------- | ----- | ------- | ----------------- |
| `delay`         | 0-1   | 0       | Delay send level  |
| `delaytime`     | 0-10  | 0.25    | Delay time (sec)  |
| `delayfeedback` | 0-1   | 0.5     | Feedback amount   |

```javascript
s('bd ~ sd ~').delay(0.3).delaytime(0.125).delayfeedback(0.4);
```

### Phaser

| Parameter      | Range    | Default | Description      |
| -------------- | -------- | ------- | ---------------- |
| `phaser`       | 0-20     | -       | LFO speed        |
| `phaserdepth`  | 0-1      | 0.75    | Effect depth     |
| `phasercenter` | 20-20000 | 1000    | Center frequency |
| `phasersweep`  | 0-4000   | 2000    | Sweep range      |

```javascript
s('bd sd hh sd').phaser(0.5).phaserdepth(0.8);
```

### Tremolo

| Parameter      | Range   | Default | Description    |
| -------------- | ------- | ------- | -------------- |
| `tremolo`      | 0-50    | -       | LFO speed      |
| `tremolodepth` | 0-1     | 1       | Depth          |

```javascript
note('c3').tremolo(8).tremolodepth(0.5);
```

---

## Mini-Notation Reference

### Basic Elements

| Syntax    | Description              | Example           |
| --------- | ------------------------ | ----------------- |
| `x y z`   | Sequence                 | `bd sd hh`        |
| `[x y]`   | Group (subdivide)        | `[bd sd] hh`      |
| `<x y>`   | Alternation              | `<bd sd> hh`      |
| `x*n`     | Repeat n times           | `hh*4`            |
| `x/n`     | Slow down by n           | `bd/2`            |
| `x!n`     | Replicate n times        | `bd!4`            |
| `x?`      | Random chance (50%)      | `bd?`             |
| `x?n`     | Random chance (n%)       | `bd?25`           |
| `~`       | Rest/silence             | `bd ~ sd ~`       |
| `x:n`     | Sample index             | `bd:2`            |
| `x@n`     | Duration weight          | `bd@3 sd`         |
| `_`       | Extend previous          | `bd _ _ sd`       |

### Examples

```javascript
// Basic drum pattern
s('bd sd [~ bd] sd');

// Hi-hat variations
s('hh*8');
s('[hh hh hh] hh');

// Alternating pattern
s('<bd bd:1 bd:2> sd');

// Random elements
s('bd sd? hh sd');

// Weighted duration
s('bd@3 sd');  // bd lasts 3/4, sd lasts 1/4
```

---

## Service API

### Strudel Service Functions

#### `initializeStrudelService(config?)`

Initializes the Strudel service.

```typescript
interface StrudelServiceConfig {
  maxConcurrentRenders: number;    // Default: 3
  renderTimeoutMs: number;         // Default: 60000
  maxPatternLength: number;        // Default: 100000
  maxRenderDuration: number;       // Default: 300 seconds
  defaultSampleRate: number;       // Default: 44100
  enableQueue: boolean;            // Default: true
  maxQueueSize: number;            // Default: 50
}

await initializeStrudelService({
  maxConcurrentRenders: 5,
  renderTimeoutMs: 120000,
});
```

#### `validateStrudelPattern(code)`

Validates pattern syntax.

```typescript
const result = await validateStrudelPattern('s("bd sd hh sd")');
// Returns:
{
  isValid: boolean;
  errors: Array<{
    message: string;
    line?: number;
    column?: number;
    code: string;
    suggestion?: string;
  }>;
  warnings: Array<{
    message: string;
    code: string;
  }>;
  validationTimeMs: number;
}
```

#### `executeStrudelPattern(config)`

Executes pattern and renders audio.

```typescript
interface StrudelProcessConfig {
  userId: string;
  code: string;
  processId?: string;
  options?: {
    duration?: number;      // Default: 10
    sampleRate?: number;    // Default: 44100
    channels?: number;      // Default: 2
    format?: 'wav';
    tempo?: number;         // BPM
  };
  priority?: number;
  requestId?: string;
  socketId?: string;
}

const result = await executeStrudelPattern({
  userId: 'user123',
  code: 's("bd sd hh sd")',
  options: { duration: 10 },
});

// Returns:
{
  processId: string;
  success: boolean;
  status: 'complete' | 'failed' | 'queued';
  validation?: StrudelValidationResult;
  audioBuffer?: number[];
  audioData?: string;       // Base64 WAV
  audioMetadata?: {
    duration: number;
    sampleRate: number;
    channels: number;
    format: string;
    fileSize: number;
  };
  timing: {
    startedAt: Date;
    completedAt: Date;
    validationTimeMs: number;
    renderTimeMs: number;
    totalTimeMs: number;
  };
  error?: string;
}
```

#### `cancelStrudelProcess(processId)`

Cancels a rendering process.

```typescript
const cancelled = await cancelStrudelProcess('strudel_abc123');
```

#### `getStrudelProcessStatus(processId)`

Gets process status.

```typescript
const status = await getStrudelProcessStatus('strudel_abc123');
// Returns:
{
  processId: string;
  status: 'pending' | 'queued' | 'validating' | 'rendering' | 'complete' | 'failed' | 'cancelled';
  progress: number;          // 0-100
  queuePosition?: number;
  validation?: StrudelValidationResult;
  result?: {
    audioData: string;
    audioMetadata: AudioMetadata;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

#### `getStrudelServiceHealth()`

Returns service health status.

```typescript
const health = await getStrudelServiceHealth();
// Returns:
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  transpiler: { available: boolean; version?: string };
  audioRenderer: { available: boolean };
  processes: {
    active: number;
    queued: number;
    maxConcurrent: number;
  };
  uptimeSeconds: number;
  redis: { connected: boolean };
}
```

### WebSocket Events

#### Client → Server

| Event             | Payload                       | Description              |
| ----------------- | ----------------------------- | ------------------------ |
| `strudel:validate` | `{ code: string }`           | Validate pattern         |
| `strudel:execute`  | `{ code, options }`          | Start execution          |
| `strudel:cancel`   | `{ processId: string }`      | Cancel process           |
| `strudel:status`   | `{ processId: string }`      | Get process status       |

#### Server → Client

| Event              | Payload                       | Description              |
| ------------------ | ----------------------------- | ------------------------ |
| `strudel:validated` | `StrudelValidationResult`    | Validation complete      |
| `strudel:queued`    | `{ processId, position }`    | Process queued           |
| `strudel:progress`  | `{ processId, progress, message }` | Progress update   |
| `strudel:complete`  | `{ processId, audioData, audioMetadata }` | Render complete |
| `strudel:error`     | `{ processId, error }`       | Error occurred           |

---

## Error Codes

| Code                   | Description                        |
| ---------------------- | ---------------------------------- |
| `SYNTAX_ERROR`         | JavaScript syntax error            |
| `PATTERN_TOO_LONG`     | Exceeds max pattern length         |
| `INFINITE_LOOP`        | Potential infinite loop detected   |
| `NOT_A_PATTERN`        | Code doesn't evaluate to pattern   |
| `TRANSPILE_ERROR`      | Pattern transpilation failed       |
| `TRANSPILER_UNAVAILABLE` | Transpiler module not loaded     |
| `RENDER_ERROR`         | Audio rendering failed             |
| `TIMEOUT_ERROR`        | Render exceeded timeout            |
| `QUEUE_FULL`           | Render queue at capacity           |
| `RATE_LIMIT_EXCEEDED`  | Too many requests                  |

---

## Sample Categories

Common Dirt-Samples categories:

### Drums

| Name | Description        | Variations |
| ---- | ------------------ | ---------- |
| `bd` | Bass drum          | 24         |
| `sd` | Snare drum         | 51         |
| `hh` | Hi-hat             | 13         |
| `oh` | Open hi-hat        | 4          |
| `cp` | Clap               | 2          |
| `rim`| Rim shot           | 4          |
| `tom`| Tom                | 6          |
| `cr` | Crash              | 6          |

### 808

| Name    | Description    |
| ------- | -------------- |
| `808`   | Mixed 808      |
| `808bd` | 808 kick       |
| `808sd` | 808 snare      |
| `808hc` | 808 closed hat |
| `808oh` | 808 open hat   |
| `808cy` | 808 cymbal     |
| `808lt` | 808 low tom    |
| `808mt` | 808 mid tom    |
| `808ht` | 808 high tom   |

### Melodic

| Name    | Description    |
| ------- | -------------- |
| `arpy`  | Arp sounds     |
| `bass`  | Bass sounds    |
| `moog`  | Moog synth     |
| `pluck` | Pluck sounds   |
| `pad`   | Pad sounds     |
| `piano` | Piano          |
| `keys`  | Keys           |
| `gtr`   | Guitar         |

See full list: [Dirt-Samples Repository](https://github.com/tidalcycles/Dirt-Samples)
