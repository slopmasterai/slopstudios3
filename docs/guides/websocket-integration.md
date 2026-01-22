# WebSocket Integration Guide

This guide covers real-time communication using WebSocket in Slop Studios 3.

## Overview

Slop Studios 3 uses Socket.IO for WebSocket communication, enabling:

- Real-time streaming of AI outputs
- Live workflow progress updates
- Audio rendering progress
- Multi-agent discussion events
- System notifications

## Connection

### Client Setup

```javascript
import { io } from 'socket.io-client';

// Create connection with authentication
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// Connection events
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### Namespaces

Different namespaces serve different purposes:

| Namespace | Purpose |
|-----------|---------|
| `/` | Default namespace - Claude AI, Strudel audio, agent orchestration |
| `/media` | Media generation events (progress, completion, errors) |
| `/notifications` | User notifications |

All Claude, Strudel, and agent events use the default namespace with prefixed event names (e.g., `claude:execute`, `strudel:progress`, `agent:workflow:started`).

```javascript
// Connect to default namespace for Claude, Strudel, and agent events
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

// Connect to media namespace for media generation events
const mediaSocket = io('http://localhost:3000/media', {
  auth: { token: 'your-jwt-token' }
});

// Connect to notifications namespace
const notificationsSocket = io('http://localhost:3000/notifications', {
  auth: { token: 'your-jwt-token' }
});
```

## Claude Streaming

Claude events use the default namespace with `claude:` prefixed event names.

### Execute with Streaming

```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

// Start streaming execution
socket.emit('claude:execute', {
  prompt: 'Write a detailed essay about climate change',
  streaming: true
}, (response) => {
  if (response.success) {
    console.log('Started process:', response.processId);
  } else {
    console.error('Failed to start:', response.error);
  }
});

// Queued notification (if process is queued)
socket.on('claude:queued', (data) => {
  console.log('Queued at position:', data.queuePosition);
});

// Progress updates
socket.on('claude:progress', (data) => {
  // data.processId, data.output (streaming chunk), data.progress
  process.stdout.write(data.output);
});

// Execution complete
socket.on('claude:complete', (data) => {
  console.log('\n\nFull output:', data.output);
  console.log('Duration:', data.durationMs, 'ms');
});

// Handle errors
socket.on('claude:error', (data) => {
  console.error('Error:', data.code, data.message);
});
```

### Cancel Execution

```javascript
socket.emit('claude:cancel', 'proc_xxx', (response) => {
  if (response.success) {
    console.log('Process cancelled');
  }
});
```

### Check Status

```javascript
socket.emit('claude:status', 'proc_xxx', (response) => {
  if (response.success) {
    console.log('Status:', response.status);
    console.log('Queue position:', response.queuePosition);
  }
});
```

## Strudel Audio Streaming

Strudel events use the default namespace with `strudel:` prefixed event names.

### Validate Code

```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

// Validate Strudel code before execution
socket.emit('strudel:validate', {
  code: 's("bd sd hh sd").gain(0.8)'
}, (response) => {
  if (response.success) {
    console.log('Code is valid');
  } else {
    console.error('Validation errors:', response.errors);
  }
});
```

### Execute with Progress

```javascript
socket.emit('strudel:execute', {
  code: 's("bd sd hh sd").gain(0.8)',
  options: {
    duration: 10,
    sampleRate: 44100
  }
}, (response) => {
  if (response.success) {
    console.log('Started process:', response.processId);
  } else {
    console.error('Failed to start:', response.error);
  }
});

// Code validated
socket.on('strudel:validated', (data) => {
  console.log('Code validated for process:', data.processId);
});

// Queued notification
socket.on('strudel:queued', (data) => {
  console.log('Queued at position:', data.queuePosition);
});

// Rendering progress
socket.on('strudel:progress', (data) => {
  console.log(`Rendering: ${data.progress}%`);
});

// Render complete
socket.on('strudel:complete', (data) => {
  console.log('Audio URL:', data.audioUrl);
  console.log('Duration:', data.durationMs, 'ms');
});

// Handle errors
socket.on('strudel:error', (data) => {
  console.error('Render error:', data.code, data.message);
});
```

### Cancel Execution

```javascript
socket.emit('strudel:cancel', { processId: 'proc_xxx' }, (response) => {
  if (response.success) {
    console.log('Process cancelled');
  }
});
```

### Check Status

```javascript
socket.emit('strudel:status', { processId: 'proc_xxx' }, (response) => {
  if (response.success) {
    console.log('Status:', response.status);
  }
});
```

## Agent Workflows

Agent events use the default namespace with `agent:` prefixed event names.

### Execute Workflow

```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

// Execute a workflow
socket.emit('agent:workflow:execute', {
  workflowId: 'wf_xxx',
  input: { /* workflow input data */ }
}, (response) => {
  if (response.success) {
    console.log('Workflow started:', response.executionId);
  } else {
    console.error('Failed to start:', response.error);
  }
});

// Workflow queued
socket.on('agent:workflow:queued', (data) => {
  console.log('Workflow queued:', data.workflowId, 'position:', data.queuePosition);
});

// Workflow started
socket.on('agent:workflow:started', (data) => {
  console.log('Workflow started:', data.workflowId);
});

// Step started
socket.on('agent:workflow:step:started', (data) => {
  console.log(`Step ${data.stepId} started: ${data.stepName}`);
});

// Step progress
socket.on('agent:workflow:step:progress', (data) => {
  console.log(`Step ${data.stepId}: ${data.progress}%`);
});

// Step completed
socket.on('agent:workflow:step:completed', (data) => {
  console.log(`Step ${data.stepId} complete:`, data.output);
});

// Step failed
socket.on('agent:workflow:step:failed', (data) => {
  console.error(`Step ${data.stepId} failed:`, data.error);
});

// Workflow completed
socket.on('agent:workflow:completed', (data) => {
  console.log('Workflow complete:', data.results);
});

// Workflow failed
socket.on('agent:workflow:failed', (data) => {
  console.error('Workflow failed:', data.error);
});

// Workflow cancelled
socket.on('agent:workflow:cancelled', (data) => {
  console.log('Workflow cancelled:', data.workflowId);
});

// General agent errors
socket.on('agent:error', (data) => {
  console.error('Agent error:', data.code, data.message);
});
```

### Workflow Control

```javascript
// Check workflow status
socket.emit('agent:workflow:status', { workflowId: 'wf_xxx' }, (response) => {
  if (response.success) {
    console.log('Status:', response.status);
  }
});

// Cancel workflow
socket.emit('agent:workflow:cancel', { workflowId: 'wf_xxx' }, (response) => {
  if (response.success) {
    console.log('Workflow cancelled');
  }
});

// Pause workflow
socket.emit('agent:workflow:pause', { workflowId: 'wf_xxx' }, (response) => {
  if (response.success) {
    console.log('Workflow paused');
  }
});

// Resume workflow
socket.emit('agent:workflow:resume', { workflowId: 'wf_xxx' }, (response) => {
  if (response.success) {
    console.log('Workflow resumed');
  }
});
```

### Orchestration

```javascript
// Execute orchestrated agent task
socket.emit('agent:orchestrate', {
  task: 'Generate a marketing strategy',
  agents: ['researcher', 'writer', 'reviewer']
}, (response) => {
  if (response.success) {
    console.log('Orchestration started:', response.executionId);
  }
});
```

### Self-Critique Events

```javascript
// Execute self-critique
socket.emit('agent:critique:execute', {
  content: 'Draft content to critique',
  criteria: ['accuracy', 'clarity', 'completeness']
}, (response) => {
  if (response.success) {
    console.log('Critique started:', response.executionId);
  }
});

// Iteration completed
socket.on('agent:critique:iteration', (data) => {
  console.log(`Iteration ${data.iteration}:`, data.feedback);
});

// Critique converged
socket.on('agent:critique:converged', (data) => {
  console.log('Converged after', data.iterations, 'iterations');
});

// Critique completed
socket.on('agent:critique:completed', (data) => {
  console.log('Final result:', data.result);
});

// Critique error
socket.on('agent:critique:error', (data) => {
  console.error('Critique error:', data.error);
});
```

### Discussion Events

```javascript
// Execute multi-agent discussion
socket.emit('agent:discussion:execute', {
  topic: 'Best approach for feature X',
  participants: ['architect', 'developer', 'qa']
}, (response) => {
  if (response.success) {
    console.log('Discussion started:', response.executionId);
  }
});

// Round started
socket.on('agent:discussion:round-started', (data) => {
  console.log(`Round ${data.round} started`);
});

// Agent contribution
socket.on('agent:discussion:contribution', (data) => {
  console.log(`${data.agentRole}: ${data.contribution}`);
});

// Round completed
socket.on('agent:discussion:round-completed', (data) => {
  console.log(`Round ${data.round} complete`);
});

// Discussion converged
socket.on('agent:discussion:converged', (data) => {
  console.log('Discussion converged');
});

// Discussion completed
socket.on('agent:discussion:completed', (data) => {
  console.log('Synthesis:', data.synthesis);
  console.log('Consensus reached:', data.consensusReached);
});

// Discussion error
socket.on('agent:discussion:error', (data) => {
  console.error('Discussion error:', data.error);
});
```

## Media Namespace

The `/media` namespace handles media generation events (images, audio, video).

```javascript
const mediaSocket = io('http://localhost:3000/media', {
  auth: { token: 'your-jwt-token' }
});

// Subscribe to media generation events
mediaSocket.emit('subscribeMedia', 'media_xxx', (response) => {
  if (response.success) {
    console.log('Subscribed to media:', response.mediaId);
  }
});

// Media generation progress
mediaSocket.on('mediaProgress', (data) => {
  console.log(`Media ${data.mediaId}: ${data.progress}% - ${data.stage}`);
  if (data.message) {
    console.log('Message:', data.message);
  }
});

// Media generation complete
mediaSocket.on('mediaComplete', (data) => {
  console.log('Media ready:', data.url);
  if (data.thumbnailUrl) {
    console.log('Thumbnail:', data.thumbnailUrl);
  }
});

// Media generation error
mediaSocket.on('mediaError', (data) => {
  console.error(`Media ${data.mediaId} error:`, data.error);
});

// Unsubscribe from media events
mediaSocket.emit('unsubscribeMedia', 'media_xxx', (response) => {
  console.log('Unsubscribed');
});
```

## Notifications Namespace

The `/notifications` namespace handles user notifications.

```javascript
const notificationsSocket = io('http://localhost:3000/notifications', {
  auth: { token: 'your-jwt-token' }
});

// Listen for notifications
notificationsSocket.on('notification', (data) => {
  console.log(`[${data.type.toUpperCase()}] ${data.title}`);
  console.log(data.message);
  console.log('ID:', data.id);
  console.log('Time:', data.timestamp);

  if (data.data) {
    console.log('Additional data:', data.data);
  }
});
```

Notification types include:
- `info` - Informational messages
- `success` - Success confirmations
- `warning` - Warning alerts
- `error` - Error notifications

## Error Handling

### Connection Errors

```javascript
socket.on('connect_error', (error) => {
  if (error.message === 'Authentication error') {
    // Token invalid or expired
    refreshToken().then(newToken => {
      socket.auth.token = newToken;
      socket.connect();
    });
  }
});
```

### Operation Errors

```javascript
socket.on('error', (error) => {
  switch (error.code) {
    case 'UNAUTHORIZED':
      handleAuthError();
      break;
    case 'RATE_LIMITED':
      // Wait before retrying
      setTimeout(() => retry(), error.retryAfter * 1000);
      break;
    case 'PROCESS_NOT_FOUND':
      // Process doesn't exist
      break;
    default:
      console.error('Unknown error:', error);
  }
});
```

## Reconnection

### Automatic Reconnection

```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  // Re-subscribe to workflows/discussions
  resubscribeAll();
});

socket.on('reconnect_attempt', (attemptNumber) => {
  console.log('Reconnection attempt:', attemptNumber);
});

socket.on('reconnect_error', (error) => {
  console.error('Reconnection error:', error);
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect after all attempts');
});
```

### Manual Reconnection

```javascript
socket.disconnect();

// Later...
socket.connect();
```

## Room Management

### Join and Leave Rooms

```javascript
// Join a room for a specific resource
socket.emit('joinRoom', 'workflow:wf_xxx', (response) => {
  if (response.success) {
    console.log('Joined room:', response.room);
  } else {
    console.error('Failed to join room:', response.error);
  }
});

// Server confirms room joined
socket.on('roomJoined', (data) => {
  console.log('Successfully joined room:', data.room);
});

// Leave room
socket.emit('leaveRoom', 'workflow:wf_xxx', (response) => {
  if (response.success) {
    console.log('Left room:', response.room);
  }
});

// Server confirms room left
socket.on('roomLeft', (data) => {
  console.log('Left room:', data.room);
});
```

## Best Practices

### 1. Handle All Events

```javascript
// Always handle errors
socket.on('error', handleError);
socket.on('connect_error', handleConnectionError);

// Handle disconnections
socket.on('disconnect', handleDisconnect);
```

### 2. Clean Up Subscriptions

```javascript
// When leaving a page or component
function cleanup() {
  // Leave any rooms
  socket.emit('leaveRoom', `workflow:${workflowId}`);

  // Remove event listeners
  socket.off('agent:workflow:step:progress');
  socket.off('agent:workflow:completed');
  socket.off('agent:workflow:failed');
}
```

### 3. Use Acknowledgments

```javascript
socket.emit('claude:execute', { prompt: '...' }, (response) => {
  if (response.error) {
    console.error('Failed:', response.error);
  } else {
    console.log('Started:', response.processId);
  }
});
```

### 4. Implement Heartbeat

```javascript
setInterval(() => {
  socket.emit('ping', {}, (response) => {
    if (!response) {
      console.warn('Server not responding');
    }
  });
}, 30000);
```

### 5. Buffer Events

```javascript
const eventBuffer = [];

socket.on('output', (data) => {
  eventBuffer.push(data);

  // Process in batches
  if (eventBuffer.length >= 10) {
    processEvents(eventBuffer.splice(0, 10));
  }
});
```

## React Integration

```jsx
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

function useSocket(namespace = '/') {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(`http://localhost:3000${namespace}`, {
      auth: { token: localStorage.getItem('token') }
    });

    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [namespace]);

  return { socket, connected };
}

// Example: Workflow progress component using default namespace
function WorkflowProgress({ workflowId }) {
  // Use default namespace for agent events
  const { socket, connected } = useSocket('/');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    if (!socket || !connected) return;

    // Listen for workflow step progress
    const handleStepProgress = (data) => {
      if (data.workflowId === workflowId) {
        setProgress(data.progress);
      }
    };

    // Listen for workflow completion
    const handleComplete = (data) => {
      if (data.workflowId === workflowId) {
        setStatus('completed');
        setProgress(100);
      }
    };

    // Listen for workflow failure
    const handleFailed = (data) => {
      if (data.workflowId === workflowId) {
        setStatus('failed');
      }
    };

    socket.on('agent:workflow:step:progress', handleStepProgress);
    socket.on('agent:workflow:completed', handleComplete);
    socket.on('agent:workflow:failed', handleFailed);

    return () => {
      socket.off('agent:workflow:step:progress', handleStepProgress);
      socket.off('agent:workflow:completed', handleComplete);
      socket.off('agent:workflow:failed', handleFailed);
    };
  }, [socket, connected, workflowId]);

  return (
    <div>
      <p>Status: {status}</p>
      <progress value={progress} max={100} />
      <span>{progress}%</span>
    </div>
  );
}

// Example: Claude streaming component
function ClaudeStream({ prompt }) {
  const { socket, connected } = useSocket('/');
  const [output, setOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const startStream = useCallback(() => {
    if (!socket || !connected) return;

    setOutput('');
    setIsStreaming(true);

    socket.emit('claude:execute', { prompt, streaming: true }, (response) => {
      if (!response.success) {
        console.error('Failed to start:', response.error);
        setIsStreaming(false);
      }
    });
  }, [socket, connected, prompt]);

  useEffect(() => {
    if (!socket) return;

    const handleProgress = (data) => {
      setOutput((prev) => prev + data.output);
    };

    const handleComplete = (data) => {
      setIsStreaming(false);
    };

    const handleError = (data) => {
      console.error('Error:', data.message);
      setIsStreaming(false);
    };

    socket.on('claude:progress', handleProgress);
    socket.on('claude:complete', handleComplete);
    socket.on('claude:error', handleError);

    return () => {
      socket.off('claude:progress', handleProgress);
      socket.off('claude:complete', handleComplete);
      socket.off('claude:error', handleError);
    };
  }, [socket]);

  return (
    <div>
      <button onClick={startStream} disabled={isStreaming}>
        {isStreaming ? 'Streaming...' : 'Start'}
      </button>
      <pre>{output}</pre>
    </div>
  );
}
```

## Debugging

### Enable Debug Logging

```javascript
// Client-side
localStorage.setItem('debug', 'socket.io-client:*');

// Or in code
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' },
  debug: true
});
```

### Monitor Events

```javascript
// Log all events
const originalOn = socket.on.bind(socket);
socket.on = (event, handler) => {
  return originalOn(event, (...args) => {
    console.log('Event:', event, args);
    return handler(...args);
  });
};
```

## Related Documentation

- [Claude Integration Guide](./claude-integration.md)
- [Agent Orchestration Guide](./agent-orchestration.md)
- [Strudel Integration Guide](./strudel-integration.md)
