# Strudel Real-Time Playback - Frontend Guide

This document provides a comprehensive guide to the frontend real-time Strudel playback system, including the `useStrudelPlayer` hook API, component integration, and best practices.

## Overview

Real-time Strudel playback enables instant audio feedback for live coding patterns directly in the browser. This approach eliminates server round-trips and provides the responsive experience expected from live coding environments.

## useStrudelPlayer Hook

### Location

`client/src/hooks/useStrudelPlayer.ts`

### Import

```typescript
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';
```

### API Reference

#### Returned State

```typescript
interface StrudelPlayerState {
  isLoading: boolean;        // True during module/sample loading
  isInitialized: boolean;    // True after AudioContext created
  isPlaying: boolean;        // True when pattern is playing
  samplesLoaded: boolean;    // True when Dirt-Samples loaded
  error: string | null;      // Error message if any
  currentPattern: string | null; // Currently playing pattern code
}
```

#### Returned Actions

```typescript
interface StrudelPlayerActions {
  initialize: () => Promise<void>;        // Set up audio (requires click)
  play: (pattern: string) => Promise<void>; // Start playing pattern
  stop: () => void;                       // Stop playback
  updatePattern: (pattern: string) => Promise<void>; // Hot-swap pattern
}
```

### Basic Usage

```typescript
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';

function StrudelComponent() {
  const {
    isPlaying,
    isLoading,
    samplesLoaded,
    error,
    play,
    stop,
    updatePattern,
  } = useStrudelPlayer();

  const handlePlay = async () => {
    if (isPlaying) {
      stop();
    } else {
      await play('s("bd sd hh sd")');
    }
  };

  return (
    <div>
      <button onClick={handlePlay} disabled={isLoading}>
        {isPlaying ? 'Stop' : 'Play'}
      </button>
      {samplesLoaded && <span>220+ samples loaded</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
```

### Advanced Usage

#### Hot-Swapping Patterns

Update patterns without stopping playback for true live coding:

```typescript
const [pattern, setPattern] = useState('s("bd sd")');
const { isPlaying, updatePattern } = useStrudelPlayer();

const handlePatternChange = async (newPattern: string) => {
  setPattern(newPattern);
  if (isPlaying) {
    await updatePattern(newPattern);
  }
};
```

#### Keyboard Shortcuts

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Space: Toggle play/stop
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      if (isPlaying) stop();
      else play(pattern);
    }
    // Ctrl+Enter: Evaluate and play
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      play(pattern);
    }
    // Escape: Stop
    if (e.key === 'Escape') {
      stop();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isPlaying, pattern, play, stop]);
```

#### Error Handling

```typescript
const { play, error } = useStrudelPlayer();

const handlePlay = async () => {
  try {
    await play(pattern);
  } catch (err) {
    // Error is also set in state
    console.error('Playback failed:', err);
  }
};

// Display error to user
{error && (
  <Alert variant="destructive">
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

## Integration with Strudel Page

### Location

`client/src/pages/Strudel.tsx`

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Strudel Page                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │    Pattern Editor       │  │      Output Panel           │   │
│  │  ┌───────────────────┐  │  │  ┌───────────────────────┐  │   │
│  │  │    Textarea       │  │  │  │   Process Detail      │  │   │
│  │  │  (pattern code)   │  │  │  │   (offline render)    │  │   │
│  │  └───────────────────┘  │  │  └───────────────────────┘  │   │
│  │                         │  │                             │   │
│  │  [▶ Live Play] [Valid]  │  │  Audio URL / Progress       │   │
│  │  [Render Pattern]       │  │                             │   │
│  │                         │  │                             │   │
│  │  Example Patterns       │  │                             │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Recent Renders                            ││
│  │  Process list from offline rendering                         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### State Flow

```typescript
// 1. User types pattern
const codeValue = watch('code');

// 2. Real-time playback
const { play, stop, isPlaying } = useStrudelPlayer();

// 3. Play button handler
const handlePlayToggle = useCallback(async () => {
  if (!codeValue) return;

  if (isPlaying) {
    stopPattern();
  } else {
    await playPattern(codeValue);
  }
}, [codeValue, isPlaying, playPattern, stopPattern]);

// 4. Render for download (offline)
const onSubmit = (data: PatternFormData) => {
  executeAsync({
    code: data.code,
    options: { duration: data.duration, ... },
  });
};
```

### UI States

| State | Live Play Button | Render Button | Indicator |
|-------|------------------|---------------|-----------|
| Initial | "Live Play" (enabled) | "Render Pattern" | - |
| Loading | "Live Play" (disabled + spinner) | - | "Initializing..." |
| Ready | "Live Play" (enabled) | "Render Pattern" | "220+ samples loaded" |
| Playing | "Stop" (red) | "Render Pattern" | Playing indicator |
| Error | "Live Play" (enabled) | "Render Pattern" | Error message |

## Example Patterns

Located in the `examplePatterns` array in `Strudel.tsx`:

```typescript
const examplePatterns = [
  {
    name: 'Basic Beat',
    code: 's("bd sd bd sd")',
    description: 'Simple kick and snare pattern',
  },
  {
    name: 'Hi-Hat Groove',
    code: 's("hh*8").fast(2)',
    description: 'Fast hi-hat pattern',
  },
  {
    name: 'Melodic',
    code: 'note("c3 e3 g3 c4").sound("piano")',
    description: 'Simple piano melody',
  },
  {
    name: 'Polyrhythm',
    code: 'stack(s("bd*3"), s("sd*5"), s("hh*7"))',
    description: 'Multiple rhythms layered',
  },
];
```

## User Interaction Patterns

### First-Time Use

1. User arrives at Strudel page
2. Types or selects example pattern
3. Clicks "Live Play" button
4. System initializes AudioContext (browser permission)
5. Dirt-Samples begin loading
6. Pattern starts playing immediately
7. Samples finish loading in background

### Pattern Development Workflow

1. Write initial pattern
2. Click "Live Play" to hear it
3. Modify pattern while playing
4. Pattern updates immediately (hot-swap)
5. Iterate until satisfied
6. Optionally click "Render Pattern" for downloadable file

### Keyboard-Driven Workflow

| Shortcut | Action |
|----------|--------|
| `Space` | Toggle play/stop |
| `Ctrl+Enter` | Evaluate and play |
| `Escape` | Stop playback |
| `Ctrl+S` | Save pattern (future) |

## Audio Player Component

For offline-rendered files, a separate `AudioPlayer` component handles playback:

```typescript
function AudioPlayer({ audioUrl }: { audioUrl: string }) {
  // Web Audio API-based player
  // Decodes audio file and provides play/pause/seek
  // ...
}
```

This component:
- Fetches and decodes WAV files
- Provides play/pause controls
- Shows progress bar with seek
- Displays duration
- Download button for file

## Best Practices

### 1. Always Handle Loading States

```typescript
{isLoading && <Spinner />}
{!isInitialized && <span>Click to enable audio</span>}
```

### 2. Show Sample Loading Progress

```typescript
{isInitialized && (
  <Alert>
    <Volume2 className="h-4 w-4" />
    <AlertDescription>
      {samplesLoaded
        ? '220+ samples loaded'
        : 'Loading samples...'}
    </AlertDescription>
  </Alert>
)}
```

### 3. Validate Before Playing

```typescript
const handlePlay = async () => {
  if (!codeValue?.trim()) {
    setError('Please enter a pattern');
    return;
  }
  await play(codeValue);
};
```

### 4. Clean Up on Unmount

The hook handles cleanup automatically:

```typescript
useEffect(() => {
  return () => {
    if (schedulerRef.current) {
      schedulerRef.current.stop();
    }
  };
}, []);
```

### 5. Handle Context Suspension

```typescript
// AudioContext may suspend when tab loses focus
// Hook handles this automatically on play()
if (ctx.state === 'suspended') {
  await ctx.resume();
}
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Click to play" but nothing happens | Audio not initialized | Call from click handler |
| Pattern plays but no drums | Samples not loaded | Wait for `samplesLoaded: true` |
| Choppy audio | High CPU usage | Close other tabs, simplify pattern |
| "Failed to evaluate pattern" | Syntax error | Check console for details |

### Debug Mode

Enable verbose logging:

```typescript
// In useStrudelPlayer.ts
console.log('Audio context state:', audioContextRef.current?.state);
console.log('Samples loaded:', samplesLoaded);
console.log('Current pattern:', currentPattern);
```

## Related Documentation

- [Real-Time Architecture](../backend/strudel-realtime-architecture.md)
- [Approach Selection Guide](../guides/strudel-approach-selection.md)
- [Quick Start Guide](../guides/strudel-quickstart.md)
- [Component Library](./component-library.md)
