# Strudel Migration Guide: Offline Rendering to Real-Time Web Audio

This guide explains why we're prioritizing real-time Web Audio playback over offline rendering and how to migrate your usage patterns.

## Why Migrate?

### Problems with Offline Rendering

The backend offline rendering approach has several limitations:

1. **Windy static noise** - Custom noise generation produces unwanted artifacts
2. **Missing instruments** - Limited sample library compared to full Dirt-Samples
3. **Sporadic drum timing** - Timing issues from OfflineAudioContext scheduling
4. **5-30 second render times** - Not suitable for live coding iteration
5. **Server resource intensive** - High CPU and memory usage per render

### Benefits of Real-Time Playback

The frontend real-time approach provides:

1. **Instant playback** - 50-150ms latency
2. **Full Dirt-Samples** - 220+ sample categories
3. **True live coding** - Hot-swap patterns while playing
4. **No server load** - All processing in browser
5. **Better audio quality** - Native Web Audio with Superdough

## Current State

The codebase already implements **both approaches**:

### Backend (Offline Rendering)

```
src/services/strudel.service.ts       - Main rendering service
src/services/strudel-samples.service.ts - Sample loading
src/services/strudel-effects.service.ts - Effect processing
src/routes/strudel.routes.ts           - REST API
```

### Frontend (Real-Time)

```
client/src/hooks/useStrudelPlayer.ts   - Real-time playback hook
client/src/pages/Strudel.tsx           - UI with both approaches
client/src/hooks/useStrudel.ts         - Offline rendering hook
```

## Migration Steps

### For Users

#### Before: Using Offline Rendering

```typescript
// Old approach - wait for render
const { executeAsync } = useStrudel();

const handleRender = async () => {
  const result = await executeAsync({
    code: 's("bd sd hh sd")',
    options: { duration: 60 },
  });
  // Wait 5-30 seconds...
  // Then play the rendered file
};
```

#### After: Using Real-Time Playback

```typescript
// New approach - instant playback
const { play, stop, isPlaying } = useStrudelPlayer();

const handlePlay = async () => {
  await play('s("bd sd hh sd")');
  // Plays immediately!
};

// Need a file for download? Still use offline as secondary
const { executeAsync } = useStrudel();
const handleExport = () => executeAsync({ code, options });
```

### For Developers

#### Updating Components

```typescript
// Import both hooks
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';
import { useStrudel } from '@/hooks/useStrudel';

function MyComponent() {
  // Real-time for live coding
  const realtime = useStrudelPlayer();

  // Offline for file export
  const offline = useStrudel();

  // Primary action: Live Play
  const handlePlay = () => realtime.play(pattern);

  // Secondary action: Export
  const handleExport = () => offline.executeAsync({
    code: pattern,
    options: { duration: 60 },
  });

  return (
    <>
      {/* Big prominent button for live play */}
      <Button size="lg" onClick={handlePlay}>
        Live Play
      </Button>

      {/* Smaller secondary button for export */}
      <Button variant="outline" onClick={handleExport}>
        Export WAV
      </Button>
    </>
  );
}
```

#### Keyboard Shortcuts

Add live-coding keyboard shortcuts:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Enter: Play/Update pattern
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isPlaying) {
        updatePattern(code);
      } else {
        play(code);
      }
    }

    // Ctrl+. or Escape: Stop
    if ((e.ctrlKey && e.key === '.') || e.key === 'Escape') {
      stop();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [code, isPlaying, play, stop, updatePattern]);
```

### For AI Agents

When helping users with Strudel:

1. **Default to real-time** - Suggest `useStrudelPlayer` for pattern development
2. **Explain the trade-offs** - File export still requires offline rendering
3. **Reference the documentation** - Point to approach selection guide

## Code Examples

### Basic Real-Time Playback

```typescript
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';

function LiveCoder() {
  const {
    isPlaying,
    samplesLoaded,
    play,
    stop,
    updatePattern,
    error,
  } = useStrudelPlayer();

  const [pattern, setPattern] = useState('s("bd sd hh sd")');

  return (
    <div>
      <textarea
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
      />

      <button onClick={() => isPlaying ? stop() : play(pattern)}>
        {isPlaying ? 'Stop' : 'Play'}
      </button>

      {isPlaying && (
        <button onClick={() => updatePattern(pattern)}>
          Update
        </button>
      )}

      {samplesLoaded && <span>220+ samples ready</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
```

### With File Export

```typescript
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';
import { useStrudel } from '@/hooks/useStrudel';

function StrudelStudio() {
  const realtime = useStrudelPlayer();
  const offline = useStrudel();
  const [pattern, setPattern] = useState('s("bd sd hh sd")');

  return (
    <div>
      <textarea value={pattern} onChange={(e) => setPattern(e.target.value)} />

      {/* Primary: Live Play */}
      <button
        className="primary"
        onClick={() => realtime.isPlaying ? realtime.stop() : realtime.play(pattern)}
      >
        {realtime.isPlaying ? 'Stop' : 'Live Play'}
      </button>

      {/* Secondary: Export */}
      <button
        className="secondary"
        onClick={() => offline.executeAsync({
          code: pattern,
          options: { duration: 60 },
        })}
        disabled={offline.isExecuting}
      >
        {offline.isExecuting ? 'Rendering...' : 'Export WAV'}
      </button>

      {/* Show exported files */}
      {offline.processes.filter(p => p.status === 'completed').map(p => (
        <a key={p.id} href={p.audioUrl} download>
          Download
        </a>
      ))}
    </div>
  );
}
```

## UI Changes

The Strudel page has been redesigned to prioritize real-time:

### Before

```
┌─────────────────────────────────────┐
│ Pattern Editor                      │
│ ┌───────────────────────────────┐   │
│ │ s("bd sd bd sd")              │   │
│ └───────────────────────────────┘   │
│                                     │
│ Duration: [60]  Rate: [44100]       │
│                                     │
│ [Render Pattern] (primary)          │
│ [Live Play] (secondary)             │
└─────────────────────────────────────┘
```

### After

```
┌─────────────────────────────────────┐
│ Pattern Editor                      │
│ ┌───────────────────────────────┐   │
│ │ s("bd sd bd sd")              │   │
│ └───────────────────────────────┘   │
│                                     │
│ [▶ Live Play] (primary, large)      │
│ [Validate] [Export WAV]             │
│                                     │
│ Ctrl+Enter: Play | Ctrl+.: Stop     │
│                                     │
│ ▼ Export Settings (collapsed)       │
│   Duration: [60]  Rate: [44100]     │
│   [Render & Download]               │
└─────────────────────────────────────┘
```

## Troubleshooting

### Real-Time Not Working

| Issue | Cause | Solution |
|-------|-------|----------|
| No sound | AudioContext suspended | Click play button (requires interaction) |
| Click to play does nothing | Browser blocking audio | Check console for autoplay errors |
| Samples not loading | GitHub API rate limit | Wait and retry, or use synth sounds |
| Pattern error | Invalid syntax | Check for typos, use Validate button |

### When to Still Use Offline

- Need a downloadable WAV file
- Rendering patterns longer than 60 seconds
- Batch processing multiple patterns
- Server-side automation

## Rollback

If you need to revert to offline-first:

```typescript
// In Strudel.tsx, swap button prominence:
<Button size="lg" onClick={handleRender}>Render Pattern</Button>
<Button size="sm" onClick={handlePlay}>Live Play</Button>
```

However, we recommend keeping real-time as the primary workflow for the best live coding experience.

## Related Documentation

- [Real-Time Architecture](../backend/strudel-realtime-architecture.md)
- [Approach Selection Guide](./strudel-approach-selection.md)
- [Frontend Playback Guide](../frontend/strudel-realtime-playback.md)
- [Quick Start Guide](./strudel-quickstart.md)
