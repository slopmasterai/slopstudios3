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
    token: 'your-jwt-token'
  }
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
  message: string;      // Welcome message
  socketId: string;     // Assigned socket ID
  serverTime: string;   // Server timestamp (ISO)
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
  userId: string;           // User's ID
  email?: string;           // User's email (if available)
  authenticatedAt: string;  // Timestamp
}
```

### `authError`

Sent when authentication fails.

```typescript
interface AuthErrorPayload {
  message: string;  // Error description
}
```

### `loggedOut`

Sent when logout is complete.

```typescript
interface LoggedOutPayload {
  message: string;  // Confirmation message
}
```

### `roomJoined`

Sent when successfully joining a room.

```typescript
interface RoomEventPayload {
  room: string;      // Room name
  success: boolean;  // Always true
}
```

### `roomLeft`

Sent when successfully leaving a room.

```typescript
interface RoomEventPayload {
  room: string;      // Room name
  success: boolean;  // Always true
}
```

### `pong`

Response to `ping` event.

```typescript
interface PongPayload {
  timestamp: number;  // Server timestamp (ms)
}
```

### `heartbeatAck`

Response to `heartbeat` event.

```typescript
interface HeartbeatAckPayload {
  timestamp: number;       // Server timestamp (ms)
  serverTime: string;      // Server timestamp (ISO)
  latency: number | null;  // Calculated latency (ms)
}
```

### `notification`

User notification (on `/notifications` namespace).

```typescript
interface NotificationPayload {
  id: string;                           // Notification ID
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;                        // Notification title
  message: string;                      // Notification body
  timestamp: string;                    // When it was sent
  data?: Record<string, unknown>;       // Additional data
}
```

### `mediaProgress`

Media generation progress (on `/media` namespace).

```typescript
interface MediaProgressPayload {
  mediaId: string;    // Media item ID
  progress: number;   // Progress percentage (0-100)
  stage: string;      // Current processing stage
  message?: string;   // Status message
}
```

### `mediaComplete`

Media generation complete (on `/media` namespace).

```typescript
interface MediaCompletePayload {
  mediaId: string;                    // Media item ID
  url: string;                        // Generated media URL
  thumbnailUrl?: string;              // Thumbnail URL
  metadata?: Record<string, unknown>; // Additional metadata
}
```

### `mediaError`

Media generation error (on `/media` namespace).

```typescript
interface MediaErrorPayload {
  mediaId: string;  // Media item ID
  error: string;    // Error message
  code?: string;    // Error code
}
```

## Client-to-Server Events

### `authenticate`

Authenticate with JWT token.

```typescript
// Payload
interface AuthenticatePayload {
  token: string;  // JWT token
}

// Callback response
interface AuthenticateResponse {
  success: boolean;
  userId?: string;    // If successful
  error?: string;     // If failed
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
  timestamp: number;  // Server timestamp
}
```

### `heartbeat`

Send heartbeat for latency calculation.

```typescript
// Payload
interface HeartbeatPayload {
  timestamp?: number;  // Client timestamp
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

## Authentication

### Via Handshake

The recommended way to authenticate is via the connection handshake:

```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
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
  reconnectionDelayMax: 5000
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
      transports: ['websocket', 'polling']
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
