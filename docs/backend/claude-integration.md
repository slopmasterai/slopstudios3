# Claude CLI Integration

This document describes the architecture and implementation of the Claude CLI
wrapper and process management system in Slop Studios 3.

## Overview

The Claude integration provides a wrapper around the Claude CLI tool, enabling
AI-powered features through both REST API and WebSocket interfaces. The system
supports:

- Synchronous and asynchronous command execution
- Real-time streaming via WebSocket
- Process queue management with configurable concurrency
- Automatic API fallback when CLI is unavailable
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
│  │  Claude Routes    │     │   Claude WebSocket Handler        │   │
│  │ /api/v1/claude/*  │     │   claude:execute, claude:cancel   │   │
│  └─────────┬─────────┘     └───────────────┬───────────────────┘   │
└────────────┼───────────────────────────────┼────────────────────────┘
             │                               │
             └───────────────┬───────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Service Layer                                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Claude Service                              │  │
│  │  - executeClaudeCommand()   - streamClaudeResponse()         │  │
│  │  - cancelClaudeProcess()    - getClaudeProcessStatus()       │  │
│  │  - validateClaudeInstallation()                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│                             ▼                                        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  Process Manager Service                       │  │
│  │  - spawnProcess()          - killProcess()                    │  │
│  │  - enqueueProcess()        - dequeueProcess()                 │  │
│  │  - getProcessState()       - updateProcessState()             │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                             │                                        │
│         ┌───────────────────┼───────────────────┐                   │
│         │                   │                   │                   │
│         ▼                   ▼                   ▼                   │
│  ┌─────────────┐    ┌─────────────┐    ┌───────────────────────┐   │
│  │ Claude CLI  │    │    Redis    │    │    Anthropic SDK      │   │
│  │ (child_proc)│    │   (state)   │    │     (fallback)        │   │
│  └─────────────┘    └─────────────┘    └───────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Claude Service (`src/services/claude.service.ts`)

The main service that wraps Claude CLI functionality:

- **`executeClaudeCommand(config)`** - Executes a Claude CLI command
- **`streamClaudeResponse(config, onEvent)`** - Streams Claude output in
  real-time
- **`cancelClaudeProcess(processId)`** - Cancels a running process
- **`getClaudeProcessStatus(processId)`** - Gets process status
- **`validateClaudeInstallation()`** - Checks if Claude CLI is available
- **`getClaudeServiceHealth()`** - Returns service health status

### 2. Process Manager Service (`src/services/process-manager.service.ts`)

Generic process lifecycle management:

- **`spawnProcess(options)`** - Spawns a child process with tracking
- **`killProcess(processId, signal)`** - Kills a running process
- **`enqueueProcess(item)`** - Adds process to queue
- **`dequeueProcess()`** - Gets next process from queue
- **`getProcessState(processId)`** - Gets process state from Redis
- **`cleanupZombieProcesses()`** - Cleans up stale processes

### 3. Claude Routes (`src/routes/claude.routes.ts`)

REST API endpoints:

| Method | Endpoint                       | Description                    |
| ------ | ------------------------------ | ------------------------------ |
| POST   | `/api/v1/claude/execute`       | Execute command synchronously  |
| POST   | `/api/v1/claude/execute/async` | Execute command asynchronously |
| GET    | `/api/v1/claude/processes/:id` | Get process status             |
| DELETE | `/api/v1/claude/processes/:id` | Cancel process                 |
| GET    | `/api/v1/claude/processes`     | List user's processes          |
| GET    | `/api/v1/claude/health`        | Service health check           |

### 4. Claude WebSocket Handler (`src/websocket/handlers/claude.handler.ts`)

Real-time WebSocket events:

**Client → Server:**

- `claude:execute` - Start execution with streaming
- `claude:cancel` - Cancel running process
- `claude:status` - Get process status

**Server → Client:**

- `claude:progress` - Streaming output updates
- `claude:complete` - Execution completed
- `claude:error` - Error occurred

### 5. Metrics Service (`src/services/claude-metrics.service.ts`)

Observability and monitoring:

- Process execution times (avg, min, max, p95, p99)
- Success/failure rates
- Active process counts
- Queue sizes

## Process Lifecycle

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────────┐
│  Pending  │────▶│  Queued   │────▶│  Running  │────▶│   Completed   │
└───────────┘     └───────────┘     └───────────┘     └───────────────┘
     │                 │                  │                    │
     │                 │                  │                    │
     │                 ▼                  ▼                    │
     │            ┌─────────┐       ┌───────────┐              │
     │            │Cancelled│       │  Timeout  │              │
     │            └─────────┘       └───────────┘              │
     │                                    │                    │
     └────────────────────────────────────┴────────────────────┘
                                          │
                                          ▼
                                    ┌───────────┐
                                    │  Failed   │
                                    └───────────┘
```

## Configuration

Environment variables:

| Variable                          | Default                 | Description                  |
| --------------------------------- | ----------------------- | ---------------------------- |
| `ANTHROPIC_API_KEY`               | -                       | API key for SDK fallback     |
| `CLAUDE_CLI_PATH`                 | `/usr/local/bin/claude` | Path to Claude CLI           |
| `CLAUDE_MAX_CONCURRENT_PROCESSES` | `5`                     | Max concurrent processes     |
| `CLAUDE_PROCESS_TIMEOUT_MS`       | `300000`                | Default timeout (5 min)      |
| `CLAUDE_ENABLE_QUEUE`             | `true`                  | Enable process queue         |
| `CLAUDE_MAX_QUEUE_SIZE`           | `100`                   | Max queue size               |
| `CLAUDE_USE_API_FALLBACK`         | `true`                  | Use API when CLI unavailable |

## Rate Limiting

- HTTP: Heavy rate limiter (5 requests/minute)
- WebSocket: 10 requests/minute per user
- Service-level: 10 processes/hour per user

## Error Handling

### CLI Not Found

When Claude CLI is not installed, the service falls back to the Anthropic SDK
API if configured.

### Process Timeout

Processes exceeding the timeout are automatically killed with `SIGKILL`.

### Concurrent Limit

When max concurrent processes is reached, requests are queued (if enabled) or
rejected.

### API Fallback

If CLI fails and API fallback is enabled, the request is retried via the
Anthropic SDK.

## Security Considerations

1. **Input Validation**: All CLI arguments are validated and sanitized
2. **Rate Limiting**: Per-user limits prevent abuse
3. **Authentication**: All endpoints require valid JWT
4. **Process Isolation**: Each process runs in a restricted environment
5. **Audit Logging**: All executions are logged with user context

## Usage Examples

### HTTP API

```bash
# Synchronous execution
curl -X POST http://localhost:3000/api/v1/claude/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, Claude!"}'

# Asynchronous execution
curl -X POST http://localhost:3000/api/v1/claude/execute/async \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a story..."}'

# Check status
curl http://localhost:3000/api/v1/claude/processes/claude_abc123 \
  -H "Authorization: Bearer <token>"

# Cancel process
curl -X DELETE http://localhost:3000/api/v1/claude/processes/claude_abc123 \
  -H "Authorization: Bearer <token>"
```

### WebSocket

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: 'jwt-token' },
});

// Execute with streaming
socket.emit(
  'claude:execute',
  {
    prompt: 'Write a story about a robot',
    maxTokens: 1000,
  },
  (response) => {
    if (response.success) {
      console.log('Process started:', response.processId);
    }
  }
);

// Listen for progress
socket.on('claude:progress', (data) => {
  console.log('Output:', data.data);
});

// Listen for completion
socket.on('claude:complete', (data) => {
  console.log('Completed:', data.result);
});

// Cancel if needed
socket.emit('claude:cancel', processId, (response) => {
  console.log('Cancelled:', response.success);
});
```

## Testing

```bash
# Unit tests
npm run test:unit -- --testPathPattern=claude
npm run test:unit -- --testPathPattern=process-manager

# Integration tests
npm run test:integration -- --testPathPattern=claude
```

## Monitoring

### Health Check

```bash
curl http://localhost:3000/api/v1/claude/health
```

Response:

```json
{
  "success": true,
  "data": {
    "healthy": true,
    "cli": {
      "installed": true,
      "path": "/usr/local/bin/claude",
      "version": "1.0.0"
    },
    "apiFallbackAvailable": true,
    "activeProcesses": 2,
    "queueSize": 0,
    "maxConcurrentProcesses": 5
  }
}
```

## Related Documentation

- [Server Architecture](./server-architecture.md)
- [WebSocket Events](./websocket-events.md)
- [Claude API Endpoints](../api/claude-endpoints.md)
- [ADR: Claude CLI Integration](../adr/0004-claude-cli-integration.md)
