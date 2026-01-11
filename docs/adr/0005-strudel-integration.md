# ADR 0005: Strudel Integration

## Status

Accepted

## Context

Slop Studios 3 requires live coding music capabilities for algorithmic music
composition and audio generation. We need to integrate with Strudel
(strudel.cc), a live coding music platform, to enable:

- Real-time pattern validation
- Algorithmic music pattern composition
- Server-side audio rendering
- Mini-notation pattern support
- Audio export in multiple formats

Options considered:

1. Strudel libraries with Web Audio API
2. Custom DSL for music patterns
3. Integration with other live coding platforms (Sonic Pi, TidalCycles)
4. Third-party audio synthesis libraries

## Decision

We will integrate Strudel libraries for pattern validation with a mock audio
rendering implementation, with plans to add full Web Audio rendering in the
future.

Key factors:

- Strudel provides a well-established pattern language (Tidal-inspired)
- Mini-notation offers concise pattern expression
- JavaScript-based allows server-side validation and transpilation
- Large community and documentation at strudel.cc
- Can be extended to support real-time playback in browser clients

## Architecture

```
Client → HTTP/WebSocket → Strudel Service → Pattern Validator
                                                 ↓
                                    ┌────────────┼────────────┐
                                    ↓            ↓            ↓
                               Acorn Parser   Redis     Audio Renderer
                               (Validation)  (State)   (Mock → WebAudio)
```

### Components

1. **Strudel Service** (`src/services/strudel.service.ts`)
   - Pattern validation using Acorn parser
   - Audio rendering (mock implementation)
   - Process queue management
   - WAV export functionality

2. **Metrics Service** (`src/services/strudel-metrics.service.ts`)
   - Validation time tracking
   - Render duration metrics
   - Audio output statistics
   - Error categorization

3. **Types** (`src/types/strudel.types.ts`)
   - Pattern, validation, and render types
   - WebSocket event payloads
   - Redis state structures

## Consequences

### Positive

- Familiar pattern language for Tidal/Strudel users
- Mini-notation enables concise pattern expression
- Server-side validation catches errors before rendering
- Async rendering allows long audio generation
- Real-time progress updates via WebSocket
- Comprehensive metrics for monitoring
- Follows established Claude integration patterns

### Negative

- Current audio rendering is mock (not actual synthesis)
- Web Audio API not available in Node.js (requires workarounds)
- Pattern complexity validation is limited
- Audio format conversion needs external tools

### Neutral

- Requires Redis for state management (already in use)
- Rate limiting applied at validation and render levels
- Mock implementation sufficient for current phase

## Implementation Details

### Pattern Validation

Validation uses multiple layers:

1. **Syntax Check** - Acorn JavaScript parser
2. **Safety Check** - Detect infinite loops, dangerous patterns
3. **Mini-Notation Check** - Bracket matching in string literals
4. **Complexity Warning** - Flag potentially slow patterns

### Audio Rendering

Current implementation (Phase 13):

- Mock sine wave buffer generation
- WAV file export
- Simulated rendering time based on duration

Future implementation:

- Worker-based Web Audio rendering
- OfflineAudioContext for server-side synthesis
- Multi-format export (WAV, MP3, OGG, FLAC)
- Sample loading and synthesis

### Process Lifecycle

1. Request received (HTTP or WebSocket)
2. Pattern validated
3. If valid: queued for rendering
4. Render progress streamed via WebSocket
5. Audio buffer generated and formatted
6. Result stored with TTL
7. Client notified of completion

### Configuration

| Variable                         | Default  | Description                  |
| -------------------------------- | -------- | ---------------------------- |
| `STRUDEL_MAX_CONCURRENT_RENDERS` | `3`      | Max concurrent renders       |
| `STRUDEL_RENDER_TIMEOUT_MS`      | `120000` | Render timeout (2 min)       |
| `STRUDEL_MAX_PATTERN_LENGTH`     | `100000` | Max pattern chars            |
| `STRUDEL_MAX_RENDER_DURATION`    | `600`    | Max audio seconds            |
| `STRUDEL_AUDIO_FORMATS`          | `wav`    | Supported formats (WAV only) |

### Security Measures

- Pattern length limits
- Audio duration limits
- Infinite loop detection
- JWT authentication required
- Per-user rate limiting (30 validations/min, 5 renders/min)
- Service-level limits (20 renders/hour per user)

## Alternatives Considered

### Sonic Pi

Rejected because:

- Ruby-based, harder to integrate with Node.js
- Requires separate server process
- Less suitable for web-based patterns

### TidalCycles

Rejected because:

- Haskell-based, complex integration
- Requires SuperCollider
- Higher infrastructure requirements

### Custom DSL

Rejected because:

- Significant development effort
- Would need to design and document new language
- Community familiarity with existing tools

### Third-Party Audio Libraries

Considered for future:

- Tone.js for browser synthesis
- SoundFont for sample playback
- Can complement Strudel patterns

## Migration Path

### Phase 13 (Current)

- Mock audio rendering
- Pattern validation
- WAV export
- Full API and WebSocket support

### Phase 14+ (Future)

- Real Web Audio rendering via Worker
- Sample loading and synthesis
- Multi-format export
- Real-time browser playback
- Pattern library/presets

## References

- [Strudel Documentation](https://strudel.cc)
- [Strudel GitHub](https://github.com/tidalcycles/strudel)
- [Tidal Cycles](https://tidalcycles.org)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Phase 13 Implementation](../phase-13-status.md)
- [Strudel Integration Architecture](../backend/strudel-integration.md)
