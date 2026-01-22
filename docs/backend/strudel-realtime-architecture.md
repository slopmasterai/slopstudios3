# Strudel Real-Time Audio Architecture

This document describes the real-time Web Audio architecture used for instant Strudel pattern playback in the frontend.

## Overview

The real-time playback system provides instant audio feedback for Strudel patterns using the browser's Web Audio API and Superdough audio engine. Unlike offline rendering, real-time playback offers immediate pattern evaluation and sound output with no server round-trip required.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    useStrudelPlayer Hook                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │   State     │  │  Actions    │  │     Refs            │   │   │
│  │  │ - isPlaying │  │ - play()    │  │ - audioContextRef   │   │   │
│  │  │ - isLoading │  │ - stop()    │  │ - schedulerRef      │   │   │
│  │  │ - error     │  │ - update()  │  │                     │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Strudel Modules                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │   │
│  │  │ @strudel/    │  │ @strudel/    │  │    superdough    │    │   │
│  │  │ transpiler   │  │   webaudio   │  │                  │    │   │
│  │  │              │  │              │  │ - samples()      │    │   │
│  │  │ - evaluate() │  │ - repl()     │  │ - superdough()   │    │   │
│  │  │              │  │ - output()   │  │ - getAudioContext│    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Web Audio API                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │   │
│  │  │ AudioContext │  │  Scheduler   │  │ Dirt-Samples     │    │   │
│  │  │              │  │ (50ms loop)  │  │ (220+ categories)│    │   │
│  │  │ - currentTime│  │              │  │                  │    │   │
│  │  │ - destination│  │ - lookahead  │  │ - Loaded on-demand│   │   │
│  │  │ - state      │  │ - 100ms      │  │ - Cached locally │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│                    🔊 Audio Output                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. useStrudelPlayer Hook

**Location:** `client/src/hooks/useStrudelPlayer.ts`

The central hook managing all real-time playback functionality.

#### State Management

```typescript
interface StrudelPlayerState {
  isLoading: boolean;        // Module/sample loading in progress
  isInitialized: boolean;    // AudioContext created successfully
  isPlaying: boolean;        // Pattern currently playing
  samplesLoaded: boolean;    // Dirt-Samples loaded from GitHub
  error: string | null;      // Most recent error message
  currentPattern: string | null; // Active pattern code
}
```

#### Actions

| Action | Description |
|--------|-------------|
| `initialize()` | Creates AudioContext, loads samples (requires user interaction) |
| `play(pattern)` | Evaluates and starts playing a pattern |
| `stop()` | Stops current playback |
| `updatePattern(pattern)` | Updates pattern while playing (hot-swap) |

### 2. Module Loading

Strudel modules are loaded lazily on first use to minimize initial bundle size:

```typescript
const loadModules = async (): Promise<StrudelModules> => {
  const [webaudio, transpiler, core, superdough] = await Promise.all([
    import('@strudel/webaudio'),
    import('@strudel/transpiler'),
    import('@strudel/core'),
    import('superdough'),
  ]);

  // Register global functions for pattern evaluation
  Object.assign(globalThis, core);
  Object.assign(globalThis, await import('@strudel/mini'));

  return { webaudio, transpiler, core, superdough, ... };
};
```

### 3. Audio Context Initialization

Browser autoplay policies require user interaction before audio can play. The `initAudioOnFirstClick()` function handles this:

```typescript
const initialize = async () => {
  const modules = await loadModules();

  // Requires user click/touch to work
  const ctx = await modules.initAudioOnFirstClick();
  audioContextRef.current = ctx;

  // Load samples in background
  await modules.samples(DIRT_SAMPLES_URL);
};
```

### 4. Pattern Evaluation

Patterns are transpiled from Strudel mini-notation to JavaScript:

```typescript
// Input: 's("bd sd hh sd")'
// Output: Evaluated Pattern object with queryArc() method
const evaluatedPattern = await modules.transpiler.evaluate(pattern);
```

### 5. Scheduler

The Strudel REPL scheduler handles real-time event scheduling:

```typescript
const scheduler = modules.repl({
  defaultOutput: modules.webaudioOutput,
  getTime: () => ctx.currentTime,  // Use AudioContext clock
});

scheduler.setPattern(evaluatedPattern);
scheduler.start();
```

**Scheduler Parameters:**
- **Interval:** 50ms (how often to check for events)
- **Lookahead:** 100ms (how far ahead to schedule)
- **Latency:** ~50-150ms total (depends on buffer size)

## Sample Management

### Dirt-Samples Loading

Samples are loaded from the TidalCycles Dirt-Samples repository:

```typescript
const DIRT_SAMPLES_URL = 'github:tidalcycles/dirt-samples';

// Loads sample index and fetches on-demand
await modules.samples(DIRT_SAMPLES_URL);
```

### Available Categories (220+)

Common categories include:
- **Drums:** `bd`, `sd`, `hh`, `cp`, `808`, `909`
- **Bass:** `bass`, `bass0`, `bass1`, `jvbass`, `jungbass`
- **Melodic:** `piano`, `arpy`, `pluck`, `casio`
- **Effects:** `noise`, `metal`, `industrial`
- **Percussion:** `tabla`, `hand`, `perc`, `coins`

### Caching Strategy

1. Sample index JSON loaded from GitHub on initialization
2. Individual samples fetched on first use
3. Decoded AudioBuffers cached in memory
4. Subsequent plays use cached buffers (instant)

## Browser Autoplay Policy Handling

Modern browsers block audio playback until user interaction. The system handles this via:

1. **User Click Required:** `initialize()` must be called from a click handler
2. **Context Resume:** If context becomes suspended, resume on next interaction
3. **State Tracking:** UI shows "Click to enable audio" when needed

```typescript
// Resume suspended context
if (ctx.state === 'suspended') {
  await ctx.resume();
}
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Audio context not initialized` | `play()` called before `initialize()` | Call `initialize()` from user click |
| `Failed to load Dirt-Samples` | Network error / GitHub rate limit | Retry or use synth fallback |
| `Pattern evaluation failed` | Invalid Strudel syntax | Check pattern for errors |
| `AudioContext suspended` | Browser autoplay policy | Resume on user interaction |

### Graceful Degradation

If samples fail to load:
- Log warning but continue
- Synthesized sounds (sine, saw, etc.) still work
- User sees "loading samples..." indicator

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Time to first sound | <2s | After user click |
| Pattern evaluation | <50ms | For typical patterns |
| Scheduler latency | 50-150ms | Configurable via lookahead |
| Sample load time | 1-5s | Depends on network |
| Memory usage | ~50-200MB | With samples cached |

## Integration Points

### Strudel Page Component

**Location:** `client/src/pages/Strudel.tsx`

```typescript
const {
  isPlaying,
  samplesLoaded,
  play,
  stop,
  error
} = useStrudelPlayer();

// Play button handler
const handlePlayToggle = async () => {
  if (isPlaying) {
    stop();
  } else {
    await play(patternCode);
  }
};
```

### State Synchronization

The hook maintains internal state that components can observe:
- `isPlaying` - Show play/stop button state
- `samplesLoaded` - Show sample loading progress
- `error` - Display error messages to user

## Comparison with Offline Rendering

| Aspect | Real-Time | Offline |
|--------|-----------|---------|
| Latency | 50-150ms | 5-30 seconds |
| Sample quality | Full Dirt-Samples | Custom synthesis fallback |
| File output | No (audio only) | Yes (WAV download) |
| Server load | None | High |
| Browser tab required | Yes | No (server-side) |
| Live coding | Yes | No |

## Troubleshooting

### Audio Not Playing

1. Check browser console for errors
2. Ensure `initialize()` called from user click
3. Check `audioContext.state` is 'running'
4. Verify pattern syntax is valid

### Samples Not Loading

1. Check network tab for failed requests
2. Verify GitHub is accessible
3. Check for rate limiting (GitHub API)
4. Look for CORS errors

### High Latency

1. Reduce browser tab count
2. Close CPU-intensive applications
3. Check for WebGL/Canvas rendering
4. Consider reducing pattern complexity

## Related Documentation

- [Strudel Integration Overview](./strudel-integration.md)
- [Strudel API Reference](./strudel-api-reference.md)
- [Frontend Playback Guide](../frontend/strudel-realtime-playback.md)
- [Approach Selection Guide](../guides/strudel-approach-selection.md)
