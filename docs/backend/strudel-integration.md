# Strudel Integration

This document describes the architecture and implementation of the Strudel live
coding music integration in Slop Studios 3.

## Overview

The Strudel integration provides pattern validation and audio rendering
capabilities for live coding music, enabling users to write algorithmic music
patterns and render them to audio files. The system supports:

- Pattern syntax validation using JavaScript parsing
- Mini-notation pattern support
- Synchronous and asynchronous audio rendering
- Real-time progress streaming via WebSocket
- Render queue management with configurable concurrency
- Comprehensive metrics and monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Applications                          │
│  ┌───────────────────┐     ┌───────────────────────────────────┐   │
│  │   HTTP Clients    │     │   WebSocket Clients (Socket.IO)   │   │
│  └─────────┬─────────┘     └───────────────┬───────────────────┘   │
└────────────┼───────────────────────────────┼────────────────────────┘
             │                               │
             ▼                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer                                    │
│  ┌───────────────────┐     ┌───────────────────────────────────┐   │
│  │  Strudel Routes   │     │   Strudel WebSocket Handler       │   │
│  │ /api/v1/strudel/* │     │   strudel:execute, strudel:cancel │   │
│  └─────────┬─────────┘     └───────────────┬───────────────────┘   │
└────────────┼───────────────────────────────┼────────────────────────┘
             │                               │
             └───────────────┬───────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Service Layer                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Strudel Service                             │  │
│  │  - validateStrudelPattern()   - executeStrudelPattern()       │  │
│  │  - cancelStrudelProcess()     - getStrudelProcessStatus()     │  │
│  │  - getStrudelServiceHealth()  - listUserStrudelProcesses()    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│          ┌──────────────────┼──────────────────┐                    │
│          │                  │                  │                    │
│          ▼                  ▼                  ▼                    │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐   │
│  │ Acorn Parser  │  │    Redis      │  │ Strudel Transpiler    │   │
│  │ (validation)  │  │   (state)     │  │ (pattern transform)   │   │
│  └───────────────┘  └───────────────┘  └───────────────────────┘   │
│                             │                                        │
│                             ▼                                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  Audio Renderer                                │  │
│  │  - Mock buffer generation (current)                           │  │
│  │  - WAV export                                                  │  │
│  │  - Format conversion (future)                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Strudel Service (`src/services/strudel.service.ts`)

The main service that handles pattern validation and audio rendering:

- **`validateStrudelPattern(code)`** - Validates Strudel pattern syntax
- **`executeStrudelPattern(config)`** - Executes pattern and renders audio
- **`renderStrudelPattern(config)`** - Renders audio from validated pattern
- **`cancelStrudelProcess(processId)`** - Cancels a rendering process
- **`getStrudelProcessStatus(processId)`** - Gets process status
- **`getStrudelServiceHealth()`** - Returns service health status
- **`listUserStrudelProcesses(userId)`** - Lists user's processes

### 2. Strudel Metrics Service (`src/services/strudel-metrics.service.ts`)

Observability and monitoring:

- Validation times (avg, min, max, p50, p95, p99)
- Render times and audio duration metrics
- Success/failure rates
- Queue depth tracking
- Error categorization

### 3. Strudel Routes (`src/routes/strudel.routes.ts`)

REST API endpoints:

| Method | Endpoint                        | Description                    |
| ------ | ------------------------------- | ------------------------------ |
| POST   | `/api/v1/strudel/validate`      | Validate pattern syntax        |
| POST   | `/api/v1/strudel/execute`       | Execute pattern synchronously  |
| POST   | `/api/v1/strudel/execute/async` | Execute pattern asynchronously |
| GET    | `/api/v1/strudel/processes/:id` | Get process status             |
| DELETE | `/api/v1/strudel/processes/:id` | Cancel process                 |
| GET    | `/api/v1/strudel/processes`     | List user's processes          |
| GET    | `/api/v1/strudel/metrics`       | Service metrics                |
| GET    | `/api/v1/strudel/health`        | Service health check           |

### 4. Strudel WebSocket Handler (`src/websocket/handlers/strudel.handler.ts`)

Real-time WebSocket events:

**Client → Server:**

- `strudel:validate` - Validate pattern
- `strudel:execute` - Start execution with streaming
- `strudel:cancel` - Cancel rendering process
- `strudel:status` - Get process status

**Server → Client:**

- `strudel:validated` - Validation result
- `strudel:queued` - Process queued
- `strudel:progress` - Rendering progress updates
- `strudel:complete` - Execution completed
- `strudel:error` - Error occurred

## Pattern Validation

The validation system uses multiple layers:

### 1. Syntax Validation

Uses Acorn JavaScript parser to detect syntax errors:

```javascript
import * as acorn from 'acorn';

function validateSyntax(code: string) {
  try {
    acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### 2. Safety Checks

Detects potentially dangerous patterns:

- Infinite loops (`while(true)`, `for(;;)`)
- Excessive recursion patterns
- Very long patterns (> 100,000 chars)

### 3. Mini-Notation Validation

Checks for common mini-notation issues:

- Unmatched brackets `[]`
- Unmatched angle brackets `<>`
- Unclosed quotes

### 4. Warnings

Non-blocking suggestions:

- Short patterns that may not produce meaningful output
- Unmatched brackets in string literals
- High complexity patterns

## Process Lifecycle

```
┌───────────┐     ┌───────────┐     ┌────────────┐     ┌───────────┐
│  Pending  │────▶│  Queued   │────▶│ Validating │────▶│ Rendering │
└───────────┘     └───────────┘     └────────────┘     └───────────┘
     │                 │                  │                  │
     │                 │                  │                  │
     │                 ▼                  ▼                  ▼
     │            ┌─────────┐       ┌───────────┐     ┌───────────┐
     │            │Cancelled│       │  Failed   │     │ Complete  │
     │            └─────────┘       └───────────┘     └───────────┘
     │                                    │
     └────────────────────────────────────┘
```

## Audio Rendering

### Current Implementation (Superdough Integration)

The audio rendering system now uses Superdough for improved sample playback and
effects processing with access to 220+ Dirt-Samples categories:

```typescript
// Pattern evaluation using Strudel transpiler
const evaluatedPattern = await evaluate(config.code);

// Render using OfflineAudioContext
const audioBuffer = await renderPatternToAudio(
  evaluatedPattern,
  options.duration,
  options.sampleRate,
  options.channels,
  cps,
  onProgress
);

// Export to WAV format
const { data, fileSize } = exportAudioBuffer(audioBuffer, 'wav', sampleRate, channels);
```

### Sample Loading

Samples are loaded from the Dirt-Samples repository via Superdough:

```typescript
import { initStrudelSamples, isSampleCategoryAvailable } from './strudel-samples.service';

// Initialize samples from Dirt-Samples repository
await initStrudelSamples();

// Check if a sample category is available
const hasBass = isSampleCategoryAvailable('bass'); // true - 220+ categories available
```

### Effects Chain

The effects chain follows Superdough's order for consistent audio processing:

1. Gain (input gain)
2. Lowpass Filter (lpf)
3. Highpass Filter (hpf)
4. Bandpass Filter (bpf)
5. Waveshape (shape)
6. Distortion (distort)
7. Reverb (room, roomsize)
8. Delay (delay, delaytime, delayfeedback)
9. Panning (pan)
10. Postgain (output gain)

### WAV Export

Converts Float32Array buffer to WAV format:

```javascript
function bufferToWav(buffer, sampleRate, channels) {
  const numSamples = buffer.length / channels;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  // Create WAV header and data...
  return wavBuffer;
}
```

### Client-Side Real-Time Playback

The client now supports real-time playback using Superdough:

```typescript
import { useStrudelPlayer } from '@/hooks/useStrudelPlayer';

function StrudelEditor() {
  const { isPlaying, play, stop, samplesLoaded } = useStrudelPlayer();

  // Initialize on first user interaction
  // Loads 220+ sample categories from Dirt-Samples
  const handlePlay = async () => {
    await play('s("bd sd hh sd")');
  };

  return (
    <button onClick={isPlaying ? stop : handlePlay}>
      {isPlaying ? 'Stop' : 'Live Play'}
    </button>
  );
}
```

## Configuration

Environment variables:

| Variable                         | Default  | Description                  |
| -------------------------------- | -------- | ---------------------------- |
| `STRUDEL_MAX_CONCURRENT_RENDERS` | `3`      | Max concurrent renders       |
| `STRUDEL_RENDER_TIMEOUT_MS`      | `120000` | Render timeout (2 min)       |
| `STRUDEL_MAX_PATTERN_LENGTH`     | `100000` | Max pattern length chars     |
| `STRUDEL_MAX_RENDER_DURATION`    | `600`    | Max audio duration seconds   |
| `STRUDEL_DEFAULT_SAMPLE_RATE`    | `44100`  | Default sample rate          |
| `STRUDEL_ENABLE_QUEUE`           | `true`   | Enable render queue          |
| `STRUDEL_MAX_QUEUE_SIZE`         | `50`     | Max queue size               |
| `STRUDEL_AUDIO_FORMATS`          | `wav`    | Supported formats (WAV only) |

## Rate Limiting

- Validation: 30 requests/minute per user
- Execution: 5 requests/minute per user (heavy rate limiter)
- Status/List: 100 requests/15 minutes per user
- WebSocket: 10 requests/minute per user
- Service-level: 20 renders/hour per user

## Error Handling

### Validation Errors

Returned with error code and position:

```json
{
  "errors": [
    {
      "message": "Unexpected token (1:10)",
      "line": 1,
      "column": 10,
      "code": "SYNTAX_ERROR",
      "suggestion": "Check for missing brackets or quotes"
    }
  ]
}
```

### Render Timeout

Patterns exceeding the render timeout are cancelled:

```json
{
  "error": {
    "code": "TIMEOUT_ERROR",
    "message": "Render exceeded timeout of 120000ms"
  }
}
```

### Queue Full

When the render queue is full:

```json
{
  "error": {
    "code": "QUEUE_FULL",
    "message": "Render queue is full. Please try again later."
  }
}
```

## Security Considerations

1. **Input Validation**: All patterns are parsed and validated before execution
2. **Length Limits**: Maximum pattern length prevents DoS attacks
3. **Duration Limits**: Maximum audio duration prevents resource exhaustion
4. **Rate Limiting**: Per-user limits prevent abuse
5. **Authentication**: All endpoints require valid JWT
6. **Sandboxing**: Audio rendering runs in isolated context
7. **Audit Logging**: All operations are logged with user context

## Usage Examples

### HTTP API

```bash
# Validate pattern
curl -X POST http://localhost:3000/api/v1/strudel/validate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "note(\"c3 e3 g3\").s(\"sawtooth\")"}'

# Synchronous execution
curl -X POST http://localhost:3000/api/v1/strudel/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "s(\"bd sd hh sd\").gain(0.8)",
    "options": {
      "duration": 10,
      "format": "wav"
    }
  }'

# Asynchronous execution
curl -X POST http://localhost:3000/api/v1/strudel/execute/async \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "stack(s(\"bd*4\"), note(\"c3 e3 g3\").s(\"piano\"))",
    "options": {
      "duration": 30,
      "format": "wav"
    }
  }'

# Check status
curl http://localhost:3000/api/v1/strudel/processes/strudel_abc123 \
  -H "Authorization: Bearer <token>"

# Cancel render
curl -X DELETE http://localhost:3000/api/v1/strudel/processes/strudel_abc123 \
  -H "Authorization: Bearer <token>"
```

### WebSocket

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: 'jwt-token' },
});

// Validate pattern
socket.emit(
  'strudel:validate',
  { code: 'note("c3 e3 g3").s("sawtooth")' },
  (response) => {
    console.log('Valid:', response.isValid);
    console.log('Errors:', response.errors);
  }
);

// Execute with streaming
socket.emit(
  'strudel:execute',
  {
    code: 's("bd sd hh sd").gain(0.8)',
    options: { duration: 30 },
  },
  (response) => {
    if (response.success) {
      console.log('Process started:', response.processId);
    }
  }
);

// Listen for progress
socket.on('strudel:progress', (data) => {
  console.log('Progress:', data.progress + '%');
});

// Listen for completion
socket.on('strudel:complete', (data) => {
  console.log('Audio ready:', data.audioMetadata);
});

// Listen for errors
socket.on('strudel:error', (data) => {
  console.error('Error:', data.error);
});

// Cancel if needed
socket.emit('strudel:cancel', { processId }, (response) => {
  console.log('Cancelled:', response.cancelled);
});
```

## Strudel Pattern Examples

### Basic Patterns

```javascript
// Simple note
note('c3').s('sawtooth');

// Chord sequence
note('c3 e3 g3 c4').s('piano');

// Drum pattern
s('bd sd hh sd');
```

### Mini-Notation

```javascript
// Grouping
'[bd sd] hh [~ sd] hh';

// Multiplication
'hh*8';

// Alternation
'<c3 e3 g3>';
```

### Effects

```javascript
s('bd sd hh sd')
  .gain(0.8)
  .room(0.3)
  .delay(0.25)
  .delaytime(0.125)
  .delayfeedback(0.3);
```

### Advanced

```javascript
// Euclidean rhythm
s('bd').euclid(3, 8);

// Layered pattern
stack(s('bd*4'), s('hh*8').gain(0.5), note('c3 e3 g3 c4').s('piano'));

// Speed modulation
note('c3 e3 g3').fast(sine.range(0.5, 2));
```

## Testing

```bash
# Unit tests
npm run test:unit -- --testPathPattern=strudel

# Integration tests
npm run test:integration -- --testPathPattern=strudel
```

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/v1/strudel/health
```

Response:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "transpiler": {
      "available": true
    },
    "audioRenderer": {
      "available": true
    },
    "processes": {
      "active": 1,
      "queued": 0,
      "maxConcurrent": 3
    },
    "uptimeSeconds": 86400,
    "redis": {
      "connected": true
    }
  }
}
```

### Metrics

```bash
curl http://localhost:3000/api/v1/strudel/metrics?periodSeconds=3600 \
  -H "Authorization: Bearer <token>"
```

Response includes validation and render statistics, queue metrics, and error
breakdowns.

## Related Documentation

### Internal Documentation

- [Strudel Audio Architecture](./strudel-audio-architecture.md) - Deep dive into
  Strudel's Superdough audio engine, scheduler, and effects chain
- [Strudel Migration Guide](./strudel-migration-guide.md) - Step-by-step guide
  for migrating to Superdough-based audio rendering
- [Strudel Testing Strategy](./strudel-testing-strategy.md) - Comprehensive
  testing and validation strategy for audio quality
- [Strudel API Reference](./strudel-api-reference.md) - Complete API reference
  for Superdough, patterns, and effects
- [Server Architecture](./server-architecture.md)
- [WebSocket Events](./websocket-events.md)
- [Claude Integration](./claude-integration.md)
- [Strudel API Endpoints](../api/strudel-endpoints.md)
- [ADR: Strudel Integration](../adr/0005-strudel-integration.md)

### External Resources

- [Strudel Documentation](https://strudel.cc)
- [Strudel Repository (Codeberg)](https://codeberg.org/uzu/strudel)
- [Superdough npm](https://www.npmjs.com/package/superdough)
- [Dirt-Samples Repository](https://github.com/tidalcycles/Dirt-Samples)
- [Strudel Technical Manual](https://strudel.cc/technical-manual/)
