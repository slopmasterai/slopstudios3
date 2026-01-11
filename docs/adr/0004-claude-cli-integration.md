# ADR 0004: Claude CLI Integration

## Status

Accepted

## Context

Slop Studios 3 requires AI-powered features for media generation and
manipulation. We need to integrate with Claude, Anthropic's AI assistant, to
enable:

- Text-based AI interactions
- Code generation and analysis
- Content creation and manipulation
- Real-time streaming responses

Options considered:

1. Anthropic SDK only (direct API calls)
2. Claude CLI wrapper (with SDK fallback)
3. Third-party Claude integration libraries
4. Custom AI service abstraction layer

## Decision

We will use Claude CLI as the primary execution method with Anthropic SDK as a
fallback mechanism.

Key factors:

- Claude CLI provides access to Claude Code features (file operations, code
  execution)
- CLI allows local context awareness for project-specific operations
- SDK fallback ensures availability when CLI is not installed
- Unified interface regardless of underlying execution method
- Better alignment with future Claude Code ecosystem features

## Architecture

```
Client → HTTP/WebSocket → Claude Service → Process Manager
                                                ↓
                                    ┌──────────┼──────────┐
                                    ↓          ↓          ↓
                               Claude CLI    Redis    Anthropic SDK
                              (Primary)     (State)   (Fallback)
```

### Components

1. **Claude Service** (`src/services/claude.service.ts`)
   - Wraps CLI and SDK execution
   - Manages process lifecycle
   - Handles streaming and callbacks

2. **Process Manager** (`src/services/process-manager.service.ts`)
   - Generic process spawning and tracking
   - Redis-backed state management
   - Priority queue with concurrency limits

3. **Metrics Service** (`src/services/claude-metrics.service.ts`)
   - Execution time tracking
   - Success/failure rates
   - Percentile calculations

## Consequences

### Positive

- Access to full Claude Code capabilities (file operations, code execution)
- Real-time streaming via WebSocket for better UX
- Horizontal scaling support via Redis state
- Graceful degradation with SDK fallback
- Process queue prevents system overload
- Comprehensive metrics for monitoring

### Negative

- Dependency on Claude CLI installation for full features
- Additional complexity managing child processes
- Process recovery after restart not yet implemented
- CLI version compatibility may require updates

### Neutral

- Requires Redis for state management (already in use)
- Both CLI and SDK need API credentials
- Rate limiting applied at multiple levels

## Implementation Details

### Process Lifecycle

1. Request received (HTTP or WebSocket)
2. Process created with `pending` status
3. Queued if at capacity, otherwise started immediately
4. Status changes: `pending` → `queued` → `running` → `completed|failed|timeout`
5. Result stored in Redis with TTL
6. Client notified via response or WebSocket event

### Configuration

| Variable                          | Default                 | Description               |
| --------------------------------- | ----------------------- | ------------------------- |
| `CLAUDE_CLI_PATH`                 | `/usr/local/bin/claude` | Path to Claude CLI        |
| `CLAUDE_MAX_CONCURRENT_PROCESSES` | `5`                     | Max concurrent executions |
| `CLAUDE_PROCESS_TIMEOUT_MS`       | `300000`                | Default timeout (5 min)   |
| `CLAUDE_USE_API_FALLBACK`         | `true`                  | Enable SDK fallback       |

### Security Measures

- Input validation and sanitization
- JWT authentication required
- Per-user rate limiting (10 processes/hour)
- Process isolation
- Audit logging

## Alternatives Considered

### SDK Only

Rejected because:

- No access to Claude Code features
- Limited to API capabilities
- Less suitable for project-aware operations

### Third-Party Libraries

Rejected because:

- Additional dependencies
- Less control over implementation
- May not align with our architecture

### Custom Abstraction Layer

Deferred for future consideration:

- Would provide flexibility for multiple AI providers
- Current focus is on Claude integration
- Can be added later if needed

## References

- [Claude CLI Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-node)
- [Phase 12 Implementation](../phase-12-status.md)
- [Claude Integration Architecture](../backend/claude-integration.md)
