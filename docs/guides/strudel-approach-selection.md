# Strudel Approach Selection Guide

This guide helps you choose between real-time Web Audio playback and offline server-side rendering for Strudel patterns.

## Quick Decision

**Use Real-Time Web Audio (Recommended)** for:
- Live coding and experimentation
- Pattern development and iteration
- Interactive performances
- Mobile devices
- Most use cases

**Use Offline Rendering** for:
- Downloadable audio files (WAV)
- Long-duration renders (>60 seconds)
- Batch processing multiple patterns
- Scenarios where browser tab must be closed

## Decision Matrix

| Use Case | Recommended Approach | Reason |
|----------|---------------------|--------|
| Live coding / experimentation | **Real-time Web Audio** | Instant feedback, true live coding experience |
| Pattern development | **Real-time Web Audio** | Immediate iteration, no wait time |
| Downloadable audio files | Offline rendering | Generates WAV files for download |
| Long-duration renders (>60s) | Offline rendering | No browser tab requirement |
| Mobile devices | **Real-time Web Audio** | Better performance, no server load |
| Batch processing | Offline rendering | Server-side queue management |
| Performances/demonstrations | **Real-time Web Audio** | Low latency, responsive to input |
| Sharing audio externally | Offline rendering | Creates portable WAV files |
| Learning Strudel | **Real-time Web Audio** | Quick feedback loop |
| Final production export | Offline rendering | High-quality file output |

## Feature Comparison

### Real-Time Web Audio

```typescript
// Frontend: client/src/hooks/useStrudelPlayer.ts
const { play, stop, updatePattern } = useStrudelPlayer();

await play('s("bd sd hh sd")');  // Plays immediately!
```

**Pros:**
- Instant playback (<150ms latency)
- True live coding experience
- Hot-swap patterns while playing
- Full Dirt-Samples library (220+ categories)
- No server round-trip required
- Works offline after initial load
- Lower server costs

**Cons:**
- No file download
- Requires browser tab open
- Browser autoplay restrictions
- Device audio capabilities vary

### Offline Rendering

```typescript
// Backend: src/services/strudel.service.ts
const result = await executeStrudelPattern(code, {
  duration: 60,
  sampleRate: 44100,
  format: 'wav',
});
// Returns: { processId, audioUrl, ... }
```

**Pros:**
- Downloadable WAV files
- Can run without browser
- Consistent audio quality
- Long duration support (up to 5 minutes)
- Queue management for load balancing

**Cons:**
- 5-30 second render time
- Server resource intensive
- Custom synthesis fallback (not full samples)
- Not suitable for live coding

## Technical Comparison

| Aspect | Real-Time | Offline |
|--------|-----------|---------|
| **Latency** | 50-150ms | 5-30 seconds |
| **Sample Library** | Dirt-Samples (220+) | Custom synthesis |
| **Audio Quality** | Native Web Audio | web-audio-engine |
| **File Output** | No | WAV download |
| **Server Load** | None | High |
| **Browser Required** | Yes | No (server-side) |
| **Hot-swap Patterns** | Yes | No |
| **Max Duration** | Unlimited | 5 minutes |
| **Concurrent Users** | Unlimited | Limited by server |

## When to Use Each

### Real-Time is Best For:

1. **Interactive Pattern Development**
   - Write pattern, hear it instantly
   - Tweak and iterate rapidly
   - Experiment with effects

2. **Live Performance**
   - DJ-style mixing
   - Live algorithmic composition
   - Interactive installations

3. **Learning Strudel**
   - Quick feedback loop
   - Understand pattern behavior
   - Experiment safely

4. **Mobile Users**
   - No server processing needed
   - Works on any modern browser
   - Responsive on lower-end devices

### Offline is Best For:

1. **Production Export**
   - Final mix for release
   - High-quality WAV files
   - Consistent renders

2. **Long-Form Compositions**
   - Pieces longer than 1 minute
   - Algorithmic compositions
   - Ambient soundscapes

3. **Batch Processing**
   - Multiple patterns queued
   - Overnight render jobs
   - Automated pipelines

4. **External Sharing**
   - Share audio on social media
   - Email audio files
   - Archive compositions

## Code Examples

### Real-Time Playback

```typescript
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';

function LiveCoder() {
  const {
    isPlaying,
    samplesLoaded,
    play,
    stop,
    updatePattern,
  } = useStrudelPlayer();

  // Play a pattern
  const handlePlay = () => play('s("bd sd hh sd")');

  // Update while playing
  const handleUpdate = () => updatePattern('s("bd*4 sd*2 hh*8")');

  // Stop playback
  const handleStop = () => stop();

  return (
    <div>
      <button onClick={handlePlay}>Play</button>
      <button onClick={handleUpdate}>Update</button>
      <button onClick={handleStop}>Stop</button>
      {samplesLoaded && <span>Ready!</span>}
    </div>
  );
}
```

### Offline Rendering

```typescript
import { useStrudel } from '@/hooks/useStrudel';

function Renderer() {
  const { executeAsync, processes } = useStrudel();

  const handleRender = () => {
    executeAsync({
      code: 's("bd sd hh sd")',
      options: {
        duration: 60,
        sampleRate: 44100,
        format: 'wav',
      },
    });
  };

  return (
    <div>
      <button onClick={handleRender}>Render to WAV</button>
      {processes.map(p => (
        <div key={p.id}>
          {p.status}: {p.progress}%
          {p.audioUrl && <a href={p.audioUrl}>Download</a>}
        </div>
      ))}
    </div>
  );
}
```

## Migration Path

If you've been using offline rendering and want to switch to real-time:

### Before (Offline)

```typescript
// Submit pattern, wait for render
const result = await executePattern(code, { duration: 10 });
// Wait 5-10 seconds...
playAudioFile(result.audioUrl);
```

### After (Real-Time)

```typescript
// Play immediately
await play(code);
// Instant audio!

// Need a file? Use offline as secondary option
const downloadUrl = await renderForDownload(code);
```

## Hybrid Workflow

The recommended workflow uses both approaches:

1. **Develop with Real-Time**
   - Experiment and iterate quickly
   - Use "Live Play" button
   - Hot-swap patterns

2. **Export with Offline**
   - Once pattern is finalized
   - Click "Render Pattern"
   - Download WAV file

```typescript
// Component supporting both
function StrudelStudio() {
  const realtime = useStrudelPlayer();
  const offline = useStrudel();

  // Live coding
  const handleLivePlay = () => realtime.play(pattern);

  // Export for download
  const handleExport = () => offline.executeAsync({
    code: pattern,
    options: { duration: 60 },
  });

  return (
    <div>
      <button onClick={handleLivePlay}>Live Play</button>
      <button onClick={handleExport}>Export WAV</button>
    </div>
  );
}
```

## Performance Considerations

### Real-Time

| Factor | Impact | Mitigation |
|--------|--------|------------|
| CPU load | High during playback | Simplify patterns |
| Memory | ~50-200MB with samples | Samples lazy-loaded |
| Network | Initial sample fetch | Samples cached |
| Battery | Moderate drain | Stop when not needed |

### Offline

| Factor | Impact | Mitigation |
|--------|--------|------------|
| Server CPU | High during render | Queue management |
| Server memory | ~500MB per render | Limit concurrent |
| Render time | 5-30 seconds | Progress indicator |
| Storage | WAV files on server | TTL cleanup |

## FAQ

### Why is real-time recommended?

Real-time playback provides the expected live coding experience - instant feedback and pattern hot-swapping. Strudel is designed for live coding, and offline rendering was originally added as a workaround for file export.

### When will offline rendering be deprecated?

Offline rendering will remain available for file export use cases. It's being repositioned as a secondary feature rather than the primary workflow.

### Can I use both in the same session?

Yes! The Strudel page supports both. Use "Live Play" for development and "Render Pattern" when you need a downloadable file.

### Why do samples sound different in offline mode?

Offline rendering uses custom synthesis fallbacks because server-side Superdough integration is incomplete. Real-time playback uses the full Dirt-Samples library.

### How do I know which to use?

- Need instant feedback? **Real-time**
- Need a WAV file? **Offline**
- Experimenting? **Real-time**
- Final export? **Offline**

## Related Documentation

- [Real-Time Architecture](../backend/strudel-realtime-architecture.md)
- [Frontend Playback Guide](../frontend/strudel-realtime-playback.md)
- [Quick Start Guide](./strudel-quickstart.md)
- [Migration Guide](./strudel-migration-guide.md)
