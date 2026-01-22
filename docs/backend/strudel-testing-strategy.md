# Strudel Audio Testing and Validation Strategy

This document outlines the comprehensive testing strategy for validating the
Strudel audio system migration, ensuring correct audio playback and meeting
quality requirements.

## Testing Objectives

1. **Verify audio quality** - No static noise, correct instruments, consistent timing
2. **Ensure API compatibility** - All endpoints and WebSocket events work correctly
3. **Validate performance** - Render times and resource usage within targets
4. **Confirm sample loading** - All Dirt-Samples categories load and play correctly
5. **Test effects chain** - Filters, reverb, delay function as expected

---

## Test Pattern Library

### Basic Patterns

These patterns test fundamental functionality:

```javascript
// Test 1: Simple drum pattern
const BASIC_DRUMS = 's("bd sd hh sd")';

// Test 2: Four-on-the-floor kick
const FOUR_ON_FLOOR = 's("bd*4")';

// Test 3: Hi-hat pattern
const HIHAT_PATTERN = 's("hh*8")';

// Test 4: Combined drum pattern
const DRUM_KIT = 's("bd sd [~ bd] sd")';

// Test 5: Melodic notes
const MELODIC_NOTES = 'note("c3 e3 g3 c4")';

// Test 6: Sample with gain
const SAMPLE_WITH_GAIN = 's("bd").gain(0.5)';

// Test 7: Panned sound
const PANNED_SOUND = 's("bd").pan(0)';  // Left
const PANNED_RIGHT = 's("bd").pan(1)';  // Right
```

### Sample Category Tests

Test each major sample category:

```javascript
const SAMPLE_TESTS = [
  // Drums
  { name: 'Bass drum (bd)', pattern: 's("bd")' },
  { name: 'Snare drum (sd)', pattern: 's("sd")' },
  { name: 'Hi-hat closed (hh)', pattern: 's("hh")' },
  { name: 'Hi-hat open (oh)', pattern: 's("oh")' },
  { name: 'Clap (cp)', pattern: 's("cp")' },
  { name: 'Rim shot (rim)', pattern: 's("rim")' },
  { name: 'Tom (tom)', pattern: 's("tom")' },

  // 808 drum machine
  { name: '808 kick', pattern: 's("808bd")' },
  { name: '808 snare', pattern: 's("808sd")' },
  { name: '808 hi-hat', pattern: 's("808hc")' },

  // Melodic
  { name: 'Arpy', pattern: 's("arpy")' },
  { name: 'Bass', pattern: 's("bass")' },
  { name: 'Piano (via moog)', pattern: 's("moog")' },
  { name: 'Pluck', pattern: 's("pluck")' },

  // Ambient
  { name: 'Pad', pattern: 's("pad")' },
];
```

### Effects Tests

```javascript
// Lowpass filter
const LPF_TEST = 's("bd sd hh sd").lpf(500)';
const LPF_SWEEP = 's("bd sd hh sd").lpf(sine.range(200, 2000))';

// Highpass filter
const HPF_TEST = 's("hh*8").hpf(2000)';

// Reverb
const REVERB_TEST = 's("bd sd").room(0.5).roomsize(4)';

// Delay
const DELAY_TEST = 's("bd ~ sd ~").delay(0.3).delaytime(0.125).delayfeedback(0.4)';

// Combined effects
const EFFECTS_CHAIN = 's("bd sd hh sd").lpf(1000).room(0.3).delay(0.2).gain(0.8)';
```

### Complex Pattern Tests

```javascript
// Layered pattern
const LAYERED = `stack(
  s("bd*4"),
  s("~ sd ~ sd"),
  s("hh*8").gain(0.5)
)`;

// Euclidean rhythm
const EUCLIDEAN = 's("bd").euclid(3, 8)';

// Speed modulation
const SPEED_MOD = 'note("c3 e3 g3").fast(2)';

// Pattern alternation
const ALTERNATION = 's("<bd sd> hh")';

// Mini-notation grouping
const MINI_NOTATION = 's("[bd sd] hh [~ sd] hh")';
```

---

## Unit Tests

### Pattern Validation Tests

```typescript
// tests/unit/strudel-validation.test.ts
import { validateStrudelPattern } from '../src/services/strudel.service';

describe('Strudel Pattern Validation', () => {
  test('validates basic drum pattern', async () => {
    const result = await validateStrudelPattern('s("bd sd hh sd")');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validates note pattern', async () => {
    const result = await validateStrudelPattern('note("c3 e3 g3")');
    expect(result.isValid).toBe(true);
  });

  test('rejects syntax errors', async () => {
    const result = await validateStrudelPattern('s("bd sd"');
    expect(result.isValid).toBe(false);
    expect(result.errors[0].code).toBe('SYNTAX_ERROR');
  });

  test('rejects infinite loops', async () => {
    const result = await validateStrudelPattern('while(true) {}');
    expect(result.isValid).toBe(false);
    expect(result.errors[0].code).toBe('INFINITE_LOOP');
  });

  test('warns on short patterns', async () => {
    const result = await validateStrudelPattern('s("bd")');
    expect(result.warnings.some(w => w.code === 'SHORT_PATTERN')).toBe(true);
  });
});
```

### Sample Loading Tests

```typescript
// tests/unit/strudel-samples.test.ts
import {
  initStrudelSamples,
  areSamplesLoaded,
  getAvailableSampleCategories,
} from '../src/services/strudel-samples.service';

describe('Strudel Sample Loading', () => {
  beforeAll(async () => {
    await initStrudelSamples();
  }, 30000); // 30 second timeout for sample loading

  test('samples are loaded after init', () => {
    expect(areSamplesLoaded()).toBe(true);
  });

  test('has expected sample categories', async () => {
    const categories = await getAvailableSampleCategories();
    expect(categories).toContain('bd');
    expect(categories).toContain('sd');
    expect(categories).toContain('hh');
    expect(categories).toContain('cp');
    expect(categories).toContain('808');
  });

  test('has melodic samples', async () => {
    const categories = await getAvailableSampleCategories();
    expect(categories).toContain('arpy');
    expect(categories).toContain('bass');
    expect(categories).toContain('moog');
  });
});
```

### Audio Rendering Tests

```typescript
// tests/unit/strudel-rendering.test.ts
import { executeStrudelPattern } from '../src/services/strudel.service';

describe('Strudel Audio Rendering', () => {
  test('renders basic drum pattern', async () => {
    const result = await executeStrudelPattern({
      userId: 'test-user',
      code: 's("bd sd hh sd")',
      options: { duration: 2, sampleRate: 44100, channels: 2 },
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('complete');
    expect(result.audioBuffer).toBeDefined();
    expect(result.audioMetadata.duration).toBe(2);
  });

  test('renders melodic pattern', async () => {
    const result = await executeStrudelPattern({
      userId: 'test-user',
      code: 'note("c3 e3 g3 c4")',
      options: { duration: 4 },
    });

    expect(result.success).toBe(true);
  });

  test('renders pattern with effects', async () => {
    const result = await executeStrudelPattern({
      userId: 'test-user',
      code: 's("bd sd").room(0.3).delay(0.2)',
      options: { duration: 4 },
    });

    expect(result.success).toBe(true);
  });

  test('handles empty pattern gracefully', async () => {
    const result = await executeStrudelPattern({
      userId: 'test-user',
      code: 'silence',
      options: { duration: 1 },
    });

    expect(result.success).toBe(true);
  });

  test('respects duration limit', async () => {
    const result = await executeStrudelPattern({
      userId: 'test-user',
      code: 's("bd")',
      options: { duration: 1000 }, // Exceeds max
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeds maximum');
  });
});
```

### Effects Chain Tests

```typescript
// tests/unit/strudel-effects.test.ts
import {
  applyLowpassFilter,
  applyHighpassFilter,
  applyPanning,
  buildEffectsChain,
} from '../src/services/strudel-effects.service';

describe('Strudel Effects Chain', () => {
  let mockContext: any;
  let mockSource: any;

  beforeEach(() => {
    mockContext = {
      createBiquadFilter: jest.fn(() => ({
        type: '',
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: jest.fn(),
      })),
      createGain: jest.fn(() => ({
        gain: { value: 1 },
        connect: jest.fn(),
      })),
      createWaveShaper: jest.fn(() => ({
        curve: null,
        connect: jest.fn(),
      })),
    };
    mockSource = { connect: jest.fn() };
  });

  test('applies lowpass filter', () => {
    const filter = applyLowpassFilter(mockContext, mockSource, 1000, 2);
    expect(mockContext.createBiquadFilter).toHaveBeenCalled();
    expect(mockSource.connect).toHaveBeenCalled();
  });

  test('applies highpass filter', () => {
    const filter = applyHighpassFilter(mockContext, mockSource, 500);
    expect(mockContext.createBiquadFilter).toHaveBeenCalled();
  });

  test('applies panning', () => {
    const [left, right] = applyPanning(mockContext, mockSource, 0.5);
    expect(mockContext.createGain).toHaveBeenCalledTimes(2);
  });

  test('builds complete effects chain', () => {
    const value = { gain: 0.8, lpf: 1000, pan: 0.3 };
    const result = buildEffectsChain(mockContext, mockSource, value);
    expect(result.leftOutput).toBeDefined();
    expect(result.rightOutput).toBeDefined();
  });
});
```

---

## Integration Tests

### WebSocket Integration

```typescript
// tests/integration/strudel-websocket.test.ts
import { io, Socket } from 'socket.io-client';

describe('Strudel WebSocket Integration', () => {
  let socket: Socket;

  beforeAll((done) => {
    socket = io('http://localhost:3000', {
      auth: { token: TEST_JWT_TOKEN },
    });
    socket.on('connect', done);
  });

  afterAll(() => {
    socket.disconnect();
  });

  test('validates pattern via WebSocket', (done) => {
    socket.emit(
      'strudel:validate',
      { code: 's("bd sd hh sd")' },
      (response: any) => {
        expect(response.isValid).toBe(true);
        done();
      }
    );
  });

  test('executes pattern and receives progress', (done) => {
    const progressUpdates: number[] = [];

    socket.on('strudel:progress', (data: any) => {
      progressUpdates.push(data.progress);
    });

    socket.on('strudel:complete', (data: any) => {
      expect(data.audioData).toBeDefined();
      expect(progressUpdates.length).toBeGreaterThan(0);
      done();
    });

    socket.emit(
      'strudel:execute',
      {
        code: 's("bd sd")',
        options: { duration: 2 },
      },
      (response: any) => {
        expect(response.success).toBe(true);
      }
    );
  }, 30000);

  test('cancels in-progress render', (done) => {
    let processId: string;

    socket.emit(
      'strudel:execute',
      {
        code: 's("bd sd hh sd")',
        options: { duration: 30 },
      },
      (response: any) => {
        processId = response.processId;

        // Cancel after short delay
        setTimeout(() => {
          socket.emit(
            'strudel:cancel',
            { processId },
            (cancelResponse: any) => {
              expect(cancelResponse.cancelled).toBe(true);
              done();
            }
          );
        }, 500);
      }
    );
  });
});
```

### HTTP API Integration

```typescript
// tests/integration/strudel-api.test.ts
import request from 'supertest';
import app from '../src/index';

describe('Strudel HTTP API', () => {
  const authHeader = `Bearer ${TEST_JWT_TOKEN}`;

  test('POST /api/v1/strudel/validate returns validation result', async () => {
    const response = await request(app)
      .post('/api/v1/strudel/validate')
      .set('Authorization', authHeader)
      .send({ code: 's("bd sd hh sd")' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.isValid).toBe(true);
  });

  test('POST /api/v1/strudel/execute renders audio', async () => {
    const response = await request(app)
      .post('/api/v1/strudel/execute')
      .set('Authorization', authHeader)
      .send({
        code: 's("bd sd")',
        options: { duration: 2 },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.audioData).toBeDefined();
  }, 30000);

  test('GET /api/v1/strudel/health returns healthy status', async () => {
    const response = await request(app)
      .get('/api/v1/strudel/health')
      .set('Authorization', authHeader);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('healthy');
  });

  test('POST /api/v1/strudel/execute/async returns process ID', async () => {
    const response = await request(app)
      .post('/api/v1/strudel/execute/async')
      .set('Authorization', authHeader)
      .send({
        code: 's("bd sd hh sd")',
        options: { duration: 10 },
      });

    expect(response.status).toBe(202);
    expect(response.body.data.processId).toBeDefined();
  });
});
```

---

## Audio Quality Validation

### Spectral Analysis

Validate that rendered audio contains expected frequencies:

```typescript
// tests/validation/audio-spectrum.test.ts
import { analyzeSpectrum } from '../test-utils/audio-analysis';

describe('Audio Spectrum Validation', () => {
  test('bass drum has low frequency content', async () => {
    const result = await executeStrudelPattern({
      userId: 'test',
      code: 's("bd")',
      options: { duration: 1, sampleRate: 44100 },
    });

    const spectrum = analyzeSpectrum(result.audioBuffer!, 44100);

    // Bass drum should have significant energy below 200Hz
    const lowFreqEnergy = spectrum.energyInRange(20, 200);
    expect(lowFreqEnergy).toBeGreaterThan(0.3);
  });

  test('hi-hat has high frequency content', async () => {
    const result = await executeStrudelPattern({
      userId: 'test',
      code: 's("hh")',
      options: { duration: 1 },
    });

    const spectrum = analyzeSpectrum(result.audioBuffer!, 44100);

    // Hi-hat should have energy above 5kHz
    const highFreqEnergy = spectrum.energyInRange(5000, 20000);
    expect(highFreqEnergy).toBeGreaterThan(0.2);
  });

  test('lowpass filter removes high frequencies', async () => {
    const unfilteredResult = await executeStrudelPattern({
      userId: 'test',
      code: 's("hh")',
      options: { duration: 1 },
    });

    const filteredResult = await executeStrudelPattern({
      userId: 'test',
      code: 's("hh").lpf(500)',
      options: { duration: 1 },
    });

    const unfilteredHigh = analyzeSpectrum(unfilteredResult.audioBuffer!, 44100)
      .energyInRange(2000, 10000);
    const filteredHigh = analyzeSpectrum(filteredResult.audioBuffer!, 44100)
      .energyInRange(2000, 10000);

    expect(filteredHigh).toBeLessThan(unfilteredHigh * 0.3);
  });
});
```

### Timing Accuracy

```typescript
// tests/validation/audio-timing.test.ts
import { detectOnsets } from '../test-utils/audio-analysis';

describe('Audio Timing Validation', () => {
  test('four-on-the-floor timing is accurate', async () => {
    const result = await executeStrudelPattern({
      userId: 'test',
      code: 's("bd*4")',
      options: { duration: 4, tempo: 120 },
    });

    const onsets = detectOnsets(result.audioBuffer!, 44100);

    // At 120 BPM, beats should be at 0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5 seconds
    const expectedOnsets = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];

    for (let i = 0; i < expectedOnsets.length; i++) {
      const expected = expectedOnsets[i];
      const actual = onsets[i];

      // Allow 10ms tolerance
      expect(Math.abs(actual - expected)).toBeLessThan(0.01);
    }
  });

  test('complex rhythm maintains timing', async () => {
    const result = await executeStrudelPattern({
      userId: 'test',
      code: 's("bd [~ sd] hh [sd hh]")',
      options: { duration: 4 },
    });

    const onsets = detectOnsets(result.audioBuffer!, 44100);

    // Verify we have the expected number of onsets per cycle
    // "bd [~ sd] hh [sd hh]" = 1 + 1 + 1 + 2 = 5 onsets per cycle
    expect(onsets.length).toBeGreaterThanOrEqual(5);
  });
});
```

### No Static/Noise Validation

```typescript
// tests/validation/audio-noise.test.ts
import { calculateSNR, detectClipping } from '../test-utils/audio-analysis';

describe('Audio Noise Validation', () => {
  test('drum pattern has acceptable SNR', async () => {
    const result = await executeStrudelPattern({
      userId: 'test',
      code: 's("bd sd hh sd")',
      options: { duration: 4 },
    });

    const snr = calculateSNR(result.audioBuffer!, 44100);

    // SNR should be at least 30dB
    expect(snr).toBeGreaterThan(30);
  });

  test('no clipping in rendered audio', async () => {
    const result = await executeStrudelPattern({
      userId: 'test',
      code: 's("bd sd hh sd").gain(0.9)',
      options: { duration: 2 },
    });

    const clipping = detectClipping(result.audioBuffer!, 44100);

    // Less than 0.1% of samples should clip
    expect(clipping.percentage).toBeLessThan(0.1);
  });

  test('silence periods are truly silent', async () => {
    const result = await executeStrudelPattern({
      userId: 'test',
      code: 's("bd ~ ~ ~")',
      options: { duration: 4 },
    });

    const buffer = result.audioBuffer!;
    const sampleRate = 44100;

    // Check silence between beats (samples 0.5s to 1.9s)
    const silenceStart = Math.floor(0.6 * sampleRate * 2);
    const silenceEnd = Math.floor(1.8 * sampleRate * 2);

    let maxSilenceLevel = 0;
    for (let i = silenceStart; i < silenceEnd; i++) {
      maxSilenceLevel = Math.max(maxSilenceLevel, Math.abs(buffer[i]));
    }

    // Silence should be below -60dB (0.001)
    expect(maxSilenceLevel).toBeLessThan(0.001);
  });
});
```

---

## Performance Tests

```typescript
// tests/performance/strudel-performance.test.ts
describe('Strudel Performance', () => {
  test('renders 10 seconds in under 2 seconds', async () => {
    const start = Date.now();

    await executeStrudelPattern({
      userId: 'test',
      code: 's("bd sd hh sd")',
      options: { duration: 10 },
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  test('handles complex pattern efficiently', async () => {
    const complexPattern = `stack(
      s("bd*4"),
      s("~ sd ~ sd"),
      s("hh*8").gain(0.5),
      note("c3 e3 g3 c4").s("piano")
    )`;

    const start = Date.now();

    await executeStrudelPattern({
      userId: 'test',
      code: complexPattern,
      options: { duration: 10 },
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test('memory usage stays under 500MB', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    await executeStrudelPattern({
      userId: 'test',
      code: 's("bd sd hh sd")',
      options: { duration: 30 },
    });

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryUsed = (finalMemory - initialMemory) / 1024 / 1024;

    expect(memoryUsed).toBeLessThan(500);
  });

  test('concurrent renders complete within time limit', async () => {
    const start = Date.now();

    await Promise.all([
      executeStrudelPattern({
        userId: 'test1',
        code: 's("bd sd")',
        options: { duration: 5 },
      }),
      executeStrudelPattern({
        userId: 'test2',
        code: 's("hh*8")',
        options: { duration: 5 },
      }),
      executeStrudelPattern({
        userId: 'test3',
        code: 'note("c3 e3 g3")',
        options: { duration: 5 },
      }),
    ]);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });
});
```

---

## Test Utilities

### Audio Analysis Utilities

```typescript
// tests/test-utils/audio-analysis.ts
export function analyzeSpectrum(
  buffer: number[] | Float32Array,
  sampleRate: number
) {
  // Implement FFT-based spectrum analysis
  return {
    energyInRange(lowHz: number, highHz: number): number {
      // Calculate energy in frequency range
      return 0;
    },
  };
}

export function detectOnsets(
  buffer: number[] | Float32Array,
  sampleRate: number
): number[] {
  // Implement onset detection algorithm
  const onsets: number[] = [];
  const threshold = 0.1;
  let prevEnergy = 0;

  const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows

  for (let i = 0; i < buffer.length; i += windowSize) {
    let energy = 0;
    for (let j = 0; j < windowSize && i + j < buffer.length; j++) {
      energy += buffer[i + j] ** 2;
    }
    energy = Math.sqrt(energy / windowSize);

    if (energy > threshold && energy > prevEnergy * 2) {
      onsets.push(i / sampleRate);
    }
    prevEnergy = energy;
  }

  return onsets;
}

export function calculateSNR(
  buffer: number[] | Float32Array,
  sampleRate: number
): number {
  // Calculate signal-to-noise ratio in dB
  let signal = 0;
  let noise = 0;

  // Simplified SNR calculation
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.abs(buffer[i]);
    if (sample > 0.01) {
      signal += sample ** 2;
    } else {
      noise += sample ** 2;
    }
  }

  if (noise === 0) return 100; // Perfect SNR

  return 10 * Math.log10(signal / noise);
}

export function detectClipping(
  buffer: number[] | Float32Array,
  sampleRate: number
): { count: number; percentage: number } {
  let clippedSamples = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) >= 0.99) {
      clippedSamples++;
    }
  }

  return {
    count: clippedSamples,
    percentage: (clippedSamples / buffer.length) * 100,
  };
}
```

---

## Running Tests

```bash
# Run all Strudel tests
npm run test -- --testPathPattern=strudel

# Run unit tests only
npm run test:unit -- --testPathPattern=strudel

# Run integration tests only
npm run test:integration -- --testPathPattern=strudel

# Run performance tests
npm run test -- --testPathPattern=performance/strudel

# Run with coverage
npm run test -- --testPathPattern=strudel --coverage
```

---

## Success Criteria

### Must Pass

- [ ] All sample categories load without errors
- [ ] Basic drum patterns render correctly
- [ ] No static/noise in rendered audio (SNR > 30dB)
- [ ] Timing accuracy within 10ms tolerance
- [ ] All API endpoints return expected responses
- [ ] WebSocket events fire in correct sequence

### Should Pass

- [ ] Effects chain produces expected audio changes
- [ ] Complex layered patterns render correctly
- [ ] Melodic samples play at correct pitches
- [ ] Performance targets met (10s render < 2s)

### Nice to Have

- [ ] All 220 sample categories available
- [ ] Memory usage under 300MB for typical renders
- [ ] Client-side playback smooth at 60fps
