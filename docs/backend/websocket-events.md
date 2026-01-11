# WebSocket Events

This document describes all WebSocket events used in Slop Studios 3.

## Overview

The WebSocket server uses Socket.IO with three namespaces:

- `/` - Default namespace for general events
- `/media` - Media generation and processing events
- `/notifications` - User notifications

## Connection

### Connecting to the Server

```javascript
import { io } from 'socket.io-client';

// Connect to default namespace
const socket = io('http://localhost:3000');

// Connect to specific namespace
const mediaSocket = io('http://localhost:3000/media');

// Connect with authentication token
const authSocket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token',
  },
});
```

### Connection Options

```javascript
{
  transports: ['websocket', 'polling'], // Transport preference
  auth: { token: 'jwt-token' },         // Authentication token
  reconnection: true,                    // Enable auto-reconnection
  reconnectionAttempts: 5,               // Max reconnection attempts
  reconnectionDelay: 1000,               // Initial delay (ms)
  timeout: 10000                         // Connection timeout (ms)
}
```

## Server-to-Client Events

### `welcome`

Sent immediately after connection is established.

```typescript
interface WelcomePayload {
  message: string; // Welcome message
  socketId: string; // Assigned socket ID
  serverTime: string; // Server timestamp (ISO)
}
```

Example:

```javascript
socket.on('welcome', (data) => {
  console.log(`Connected as ${data.socketId}`);
});
```

### `authenticated`

Sent when authentication is successful.

```typescript
interface AuthenticatedPayload {
  userId: string; // User's ID
  email?: string; // User's email (if available)
  authenticatedAt: string; // Timestamp
}
```

### `authError`

Sent when authentication fails.

```typescript
interface AuthErrorPayload {
  message: string; // Error description
}
```

### `loggedOut`

Sent when logout is complete.

```typescript
interface LoggedOutPayload {
  message: string; // Confirmation message
}
```

### `roomJoined`

Sent when successfully joining a room.

```typescript
interface RoomEventPayload {
  room: string; // Room name
  success: boolean; // Always true
}
```

### `roomLeft`

Sent when successfully leaving a room.

```typescript
interface RoomEventPayload {
  room: string; // Room name
  success: boolean; // Always true
}
```

### `pong`

Response to `ping` event.

```typescript
interface PongPayload {
  timestamp: number; // Server timestamp (ms)
}
```

### `heartbeatAck`

Response to `heartbeat` event.

```typescript
interface HeartbeatAckPayload {
  timestamp: number; // Server timestamp (ms)
  serverTime: string; // Server timestamp (ISO)
  latency: number | null; // Calculated latency (ms)
}
```

### `notification`

User notification (on `/notifications` namespace).

```typescript
interface NotificationPayload {
  id: string; // Notification ID
  type: 'info' | 'success' | 'warning' | 'error';
  title: string; // Notification title
  message: string; // Notification body
  timestamp: string; // When it was sent
  data?: Record<string, unknown>; // Additional data
}
```

### `mediaProgress`

Media generation progress (on `/media` namespace).

```typescript
interface MediaProgressPayload {
  mediaId: string; // Media item ID
  progress: number; // Progress percentage (0-100)
  stage: string; // Current processing stage
  message?: string; // Status message
}
```

### `mediaComplete`

Media generation complete (on `/media` namespace).

```typescript
interface MediaCompletePayload {
  mediaId: string; // Media item ID
  url: string; // Generated media URL
  thumbnailUrl?: string; // Thumbnail URL
  metadata?: Record<string, unknown>; // Additional metadata
}
```

### `mediaError`

Media generation error (on `/media` namespace).

```typescript
interface MediaErrorPayload {
  mediaId: string; // Media item ID
  error: string; // Error message
  code?: string; // Error code
}
```

### `claude:progress`

Emitted during Claude command execution to provide real-time streaming updates.
Fires when:

- A process starts executing (`status: 'running'`, `message: 'Process started'`)
- Output data is received from the Claude CLI (`status: 'running'`, `data`
  contains the chunk)
- A queued process transitions to running state

```typescript
interface ClaudeProgressPayload {
  processId: string; // Unique process identifier
  status: ClaudeProcessStatus; // Current status ('running')
  data?: string; // Incremental output chunk (for streaming)
  progress?: number; // Progress percentage 0-100 (if determinable)
  message?: string; // Status message
  timestamp: string; // ISO timestamp
}

type ClaudeProcessStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';
```

Example:

```javascript
socket.on('claude:progress', (data) => {
  if (data.data) {
    // Append streaming chunk to output
    outputBuffer += data.data;
  }
  console.log(`Process ${data.processId}: ${data.status}`);
});
```

### `claude:queued`

Emitted when a Claude execution request is queued due to concurrency limits.
Fires when:

- Initial request is queued (returns `queuePosition: 0` initially)
- Queue position updates during polling

```typescript
interface ClaudeQueuedPayload {
  processId: string; // Unique process identifier
  queuePosition: number; // Current position in queue (0-indexed)
  message: string; // Informational message (e.g., 'Queue position: 3')
  timestamp: string; // ISO timestamp
}
```

Example:

```javascript
socket.on('claude:queued', (data) => {
  console.log(`Request queued at position ${data.queuePosition}`);
  // Client should poll via claude:status or wait for claude:progress/complete
});
```

### `claude:complete`

Emitted when Claude command execution finishes successfully. Fires when:

- Process completes with exit code 0
- A queued process eventually completes

```typescript
interface ClaudeCompletePayload {
  processId: string; // Unique process identifier
  result: ClaudeProcessResult; // Full execution result
  timestamp: string; // ISO timestamp
}

interface ClaudeProcessResult {
  id: string; // Process ID
  userId: string; // User who initiated
  status: ClaudeProcessStatus; // Final status
  stdout: string; // Standard output
  stderr: string; // Standard error
  exitCode: number | null; // Exit code (null if killed)
  startedAt: string; // When process started
  completedAt: string; // When process completed
  durationMs: number; // Duration in milliseconds
  error?: string; // Error message if failed
  parsedResponse?: ClaudeParsedResponse; // Parsed JSON response
}

interface ClaudeParsedResponse {
  content: string; // Main text response
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model?: string; // Model used
  stopReason?: string; // Stop reason
}
```

Example:

```javascript
socket.on('claude:complete', (data) => {
  console.log(`Process ${data.processId} completed`);
  console.log('Output:', data.result.stdout);
  if (data.result.parsedResponse) {
    console.log('Response:', data.result.parsedResponse.content);
  }
});
```

### `claude:error`

Emitted when a Claude operation fails. Fires when:

- Authentication fails (`code: 'UNAUTHORIZED'`)
- Invalid payload is provided (`code: 'INVALID_PAYLOAD'`)
- Rate limit is exceeded (`code: 'RATE_LIMIT_EXCEEDED'`)
- Execution fails (`code: 'EXECUTION_ERROR'`)
- Stream encounters an error (`code: 'STREAM_ERROR'`)
- Process is cancelled by user (`code: 'CANCELLED'`)
- Process not found during status check (`code: 'PROCESS_NOT_FOUND'`)
- Queue timeout occurs (`code: 'QUEUE_TIMEOUT'`)

```typescript
interface ClaudeErrorPayload {
  processId?: string; // Process ID (if applicable)
  code: string; // Error code (see list above)
  message: string; // Human-readable error message
  timestamp: string; // ISO timestamp
}
```

Example:

```javascript
socket.on('claude:error', (data) => {
  console.error(`Error ${data.code}: ${data.message}`);
  if (data.processId) {
    console.error(`Process: ${data.processId}`);
  }
});
```

## Client-to-Server Events

### `authenticate`

Authenticate with JWT token.

```typescript
// Payload
interface AuthenticatePayload {
  token: string; // JWT token
}

// Callback response
interface AuthenticateResponse {
  success: boolean;
  userId?: string; // If successful
  error?: string; // If failed
}
```

Example:

```javascript
socket.emit('authenticate', { token: 'jwt-token' }, (response) => {
  if (response.success) {
    console.log(`Authenticated as ${response.userId}`);
  } else {
    console.error(response.error);
  }
});
```

### `logout`

Log out and clear authentication.

```typescript
// Callback response
interface LogoutResponse {
  success: boolean;
}
```

### `joinRoom`

Join a room for targeted events.

```typescript
// Arguments: roomName (string)
// Callback response
interface RoomCallback {
  success: boolean;
  room?: string;
  error?: string;
}
```

Example:

```javascript
socket.emit('joinRoom', 'project-123', (response) => {
  if (response.success) {
    console.log(`Joined room: ${response.room}`);
  }
});
```

### `leaveRoom`

Leave a room.

```typescript
// Arguments: roomName (string)
// Callback response: same as joinRoom
```

### `getConnectionInfo`

Get current connection information.

```typescript
// Callback response
interface ConnectionInfoResponse {
  socketId: string;
  connected: boolean;
  rooms: string[];
  authenticated: boolean;
  connectedAt: string;
}
```

### `ping`

Ping the server for latency measurement.

```typescript
// Callback response
interface PingResponse {
  timestamp: number; // Server timestamp
}
```

### `heartbeat`

Send heartbeat for latency calculation.

```typescript
// Payload
interface HeartbeatPayload {
  timestamp?: number; // Client timestamp
}

// Callback response
interface HeartbeatResponse {
  timestamp: number;
  serverTime: string;
  latency: number | null;
}
```

### `subscribeMedia`

Subscribe to media generation updates (on `/media` namespace).

```typescript
// Arguments: mediaId (string)
// Callback response
interface MediaSubscribeResponse {
  success: boolean;
  mediaId?: string;
  error?: string;
}
```

### `unsubscribeMedia`

Unsubscribe from media generation updates.

```typescript
// Arguments: mediaId (string)
// Callback response: same as subscribeMedia
```

### `claude:execute`

Execute a Claude CLI command with real-time streaming output. **Requires
authentication.**

```typescript
// Payload
interface ClaudeExecutePayload {
  prompt: string; // The prompt to send to Claude (required, max 100000 chars)
  systemPrompt?: string; // Optional system prompt
  model?: string; // Optional model override
  maxTokens?: number; // Optional maximum tokens
  workingDirectory?: string; // Optional working directory for Claude CLI
  timeoutMs?: number; // Optional timeout in milliseconds
}

// Callback response (immediate acknowledgment)
interface ClaudeExecuteCallback {
  success: boolean;
  processId?: string; // Unique process ID for tracking (if successful)
  error?: string; // Error message (if failed)
}
```

Example:

```javascript
socket.emit(
  'claude:execute',
  {
    prompt: 'Explain how async/await works in JavaScript',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1000,
  },
  (response) => {
    if (response.success) {
      console.log(`Process started: ${response.processId}`);
      // Listen for claude:progress, claude:complete, claude:error events
    } else {
      console.error(response.error);
    }
  }
);
```

**Rate Limit:** 10 requests per minute per user (WebSocket-specific limit via
Redis).

**Event Flow:**

1. Client emits `claude:execute` → receives callback with `processId`
2. Server emits `claude:progress` events with streaming data
3. Server emits `claude:complete` when finished, or `claude:error` on failure
4. If queued, server emits `claude:queued` and client should poll via
   `claude:status`

### `claude:status`

Query the status of a Claude process. **Requires authentication.** Useful for
polling queued processes.

```typescript
// Arguments: processId (string)

// Callback response
interface ClaudeStatusCallback {
  success: boolean;
  status?: ClaudeProcessStatus; // Current status
  queuePosition?: number; // Position in queue (if queued)
  error?: string; // Error message (if failed)
}

type ClaudeProcessStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';
```

Example:

```javascript
socket.emit('claude:status', processId, (response) => {
  if (response.success) {
    console.log(`Status: ${response.status}`);
    if (response.queuePosition !== undefined) {
      console.log(`Queue position: ${response.queuePosition}`);
    }
  } else {
    console.error(response.error);
  }
});
```

**Access Control:** Users can only query status of their own processes.

### `claude:cancel`

Cancel a running or queued Claude process. **Requires authentication.**

```typescript
// Arguments: processId (string)

// Callback response
interface ClaudeCancelCallback {
  success: boolean;
  message?: string; // Success message
  error?: string; // Error message (if failed)
}
```

Example:

```javascript
socket.emit('claude:cancel', processId, (response) => {
  if (response.success) {
    console.log(response.message); // 'Process cancelled successfully'
  } else {
    console.error(response.error); // e.g., 'Process not found' or 'Access denied'
  }
});

// Also listen for claude:error with code 'CANCELLED'
socket.on('claude:error', (data) => {
  if (data.code === 'CANCELLED') {
    console.log(`Process ${data.processId} was cancelled`);
  }
});
```

**Access Control:** Users can only cancel their own processes.

## Authentication

### Via Handshake

The recommended way to authenticate is via the connection handshake:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token',
  },
});

socket.on('authenticated', (data) => {
  // Already authenticated on connection
});
```

### Via Event

You can also authenticate after connecting:

```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  socket.emit('authenticate', { token: 'jwt-token' }, (response) => {
    if (response.success) {
      // Now authenticated
    }
  });
});
```

### Claude Event Authentication

All Claude WebSocket events (`claude:execute`, `claude:status`, `claude:cancel`)
require authentication. If a user attempts to use these events without
authenticating first, the server will:

1. Emit a `claude:error` event with `code: 'UNAUTHORIZED'`
2. Call the callback (if provided) with
   `{ success: false, error: 'Authentication required...' }`

```javascript
// Attempting claude:execute without auth
socket.emit('claude:execute', { prompt: 'Hello' }, (response) => {
  // response.success === false
  // response.error === 'Authentication required to execute Claude commands'
});

// You'll also receive:
socket.on('claude:error', (data) => {
  // data.code === 'UNAUTHORIZED'
  // data.message === 'Authentication required to execute Claude commands'
});
```

### Per-User WebSocket Rate Limits

Claude operations have a dedicated per-user rate limit enforced via Redis:

| Parameter    | Value                                     |
| ------------ | ----------------------------------------- |
| Window       | 60 seconds                                |
| Max requests | 10 per window                             |
| Scope        | Per authenticated user                    |
| Storage      | Redis key: `ws:claude:ratelimit:{userId}` |

When rate limited:

- Server emits `claude:error` with `code: 'RATE_LIMIT_EXCEEDED'`
- Callback returns `{ success: false, error: 'Rate limit exceeded...' }`

**Note:** If Redis is unavailable, rate limiting is bypassed (fail-open
behavior).

```javascript
// Rate limit exceeded response
socket.on('claude:error', (data) => {
  if (data.code === 'RATE_LIMIT_EXCEEDED') {
    // Wait before retrying
    setTimeout(() => retryRequest(), 60000);
  }
});
```

## Rooms

Rooms allow targeted broadcasting. Authenticated users automatically join:

- `user:{userId}` - User-specific events

You can join custom rooms for project-specific updates:

```javascript
socket.emit('joinRoom', 'project-123');

// Receive events sent to this room
socket.on('projectUpdate', (data) => {
  // Handle update
});
```

## Error Handling

Always handle connection errors:

```javascript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

## Reconnection

Socket.IO handles reconnection automatically. You can customize behavior:

```javascript
const socket = io('http://localhost:3000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
  // Re-authenticate if needed
});

socket.on('reconnect_failed', () => {
  console.log('Reconnection failed');
});
```

## Example: Complete Client Implementation

```javascript
import { io } from 'socket.io-client';

class WebSocketClient {
  constructor(url, token) {
    this.socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.setupHandlers();
  }

  setupHandlers() {
    this.socket.on('connect', () => {
      console.log('Connected');
    });

    this.socket.on('welcome', (data) => {
      console.log('Welcome:', data.message);
    });

    this.socket.on('authenticated', (data) => {
      console.log('Authenticated as:', data.userId);
    });

    this.socket.on('authError', (data) => {
      console.error('Auth failed:', data.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
    });
  }

  joinRoom(room) {
    return new Promise((resolve, reject) => {
      this.socket.emit('joinRoom', room, (response) => {
        if (response.success) resolve(response);
        else reject(new Error(response.error));
      });
    });
  }

  ping() {
    return new Promise((resolve) => {
      const start = Date.now();
      this.socket.emit('ping', (response) => {
        resolve(Date.now() - start);
      });
    });
  }

  disconnect() {
    this.socket.disconnect();
  }
}
```
