# Claude Integration Guide

This guide covers the Claude AI integration in Slop Studios 3, including setup, usage, and best practices.

## Overview

Slop Studios 3 integrates with Claude through two methods:

1. **Claude CLI**: Direct integration with the Claude CLI for local development
2. **Anthropic API**: SDK-based integration for production or when CLI is unavailable

The system automatically falls back to the API when the CLI is unavailable.

## Setup

### Configure API Key

Add your Anthropic API key to `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-your-api-key
```

### Configure Claude CLI (Optional)

If you have Claude CLI installed:

```env
CLAUDE_CLI_PATH=/usr/local/bin/claude
```

### Configuration Options

```env
# Process Management
CLAUDE_MAX_CONCURRENT_PROCESSES=5    # Max parallel executions
CLAUDE_PROCESS_TIMEOUT_MS=300000     # 5 minute timeout

# Queue Settings
CLAUDE_ENABLE_QUEUE=true             # Enable request queuing
CLAUDE_MAX_QUEUE_SIZE=100            # Max queued requests
CLAUDE_USE_API_FALLBACK=true         # Use API when CLI unavailable

# Retry Settings
CLAUDE_MAX_RETRIES=3                 # Retry attempts
CLAUDE_RETRY_DELAY_MS=1000           # Delay between retries
```

## REST API Usage

### Execute a Prompt

```bash
curl -X POST http://localhost:3000/api/v1/claude/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "options": {
      "timeoutMs": 60000,
      "streaming": false
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "processId": "proc_abc123",
    "output": "Quantum computing is...",
    "status": "completed",
    "durationMs": 5432
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

### Check Process Status

```bash
curl http://localhost:3000/api/v1/claude/processes/proc_abc123 \
  -H "Authorization: Bearer $TOKEN"
```

### Cancel a Process

```bash
curl -X DELETE http://localhost:3000/api/v1/claude/processes/proc_abc123 \
  -H "Authorization: Bearer $TOKEN"
```

### Get Service Health

```bash
curl http://localhost:3000/api/v1/claude/health
```

Response:

```json
{
  "success": true,
  "data": {
    "healthy": true,
    "cliAvailable": true,
    "apiAvailable": true,
    "activeProcesses": 2,
    "queuedRequests": 0
  }
}
```

### Get Metrics

```bash
curl http://localhost:3000/api/v1/claude/metrics \
  -H "Authorization: Bearer $TOKEN"
```

## WebSocket Streaming

For real-time output streaming, connect via WebSocket:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/claude', {
  auth: { token: 'your-jwt-token' }
});

// Execute with streaming
socket.emit('execute', {
  prompt: 'Write a poem about the ocean',
  streaming: true
});

// Receive streaming output
socket.on('output', (data) => {
  console.log(data.chunk); // Partial output
});

// Receive completion
socket.on('complete', (data) => {
  console.log('Done:', data.output);
});

// Handle errors
socket.on('error', (error) => {
  console.error('Error:', error.message);
});
```

## Using with Agents

Claude is available as a built-in agent:

```bash
curl -X POST http://localhost:3000/api/v1/agents/registry/claude_default/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Generate a creative story",
    "context": {
      "genre": "science fiction",
      "length": "short"
    }
  }'
```

## Prompt Templates

Create reusable prompt templates:

```bash
curl -X POST http://localhost:3000/api/v1/agents/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Story Generator",
    "description": "Generates stories based on parameters",
    "content": "Write a {{length}} {{genre}} story about {{topic}}.",
    "variables": [
      {"name": "length", "type": "string", "required": true},
      {"name": "genre", "type": "string", "required": true},
      {"name": "topic", "type": "string", "required": true}
    ],
    "category": "user"
  }'
```

Use the template:

```bash
curl -X POST http://localhost:3000/api/v1/agents/templates/tpl_xxx/interpolate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "length": "short",
      "genre": "mystery",
      "topic": "a lost key"
    }
  }'
```

## Self-Critique Pattern

Use Claude to iteratively improve its own output:

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate/self-critique \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a professional email requesting a meeting",
    "config": {
      "maxIterations": 3,
      "qualityCriteria": [
        {
          "name": "Professionalism",
          "description": "Is the tone professional and appropriate?",
          "weight": 0.4
        },
        {
          "name": "Clarity",
          "description": "Is the message clear and concise?",
          "weight": 0.3
        },
        {
          "name": "Completeness",
          "description": "Does it include all necessary information?",
          "weight": 0.3
        }
      ],
      "stopOnQualityThreshold": 0.9
    }
  }'
```

## Multi-Agent Discussion

Have multiple Claude instances discuss a topic:

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate/discussion \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Should AI be used to automate creative work?",
    "participants": [
      {
        "agentId": "claude_default",
        "role": "Technology Advocate",
        "perspective": "Focuses on efficiency and capabilities"
      },
      {
        "agentId": "claude_default",
        "role": "Artist",
        "perspective": "Values human creativity and expression"
      },
      {
        "agentId": "claude_default",
        "role": "Ethicist",
        "perspective": "Considers societal implications"
      }
    ],
    "config": {
      "maxRounds": 3,
      "consensusStrategy": "majority"
    }
  }'
```

## Best Practices

### 1. Use Appropriate Timeouts

Set timeouts based on expected response complexity:

```json
{
  "options": {
    "timeoutMs": 30000  // 30 seconds for simple prompts
  }
}
```

### 2. Handle Rate Limits

The system queues requests when at capacity. Check queue status:

```bash
curl http://localhost:3000/api/v1/claude/health
```

### 3. Use Templates for Consistency

Create templates for common prompt patterns to ensure consistent formatting.

### 4. Monitor Metrics

Track usage and performance:

```bash
curl http://localhost:3000/api/v1/claude/metrics \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Implement Retry Logic

For client-side applications:

```javascript
async function executeWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('/api/v1/claude/execute', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 5;
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }

      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

## Error Handling

Common error codes:

| Code | Description |
|------|-------------|
| `PROCESS_NOT_FOUND` | Process ID does not exist |
| `PROCESS_TIMEOUT` | Execution exceeded timeout |
| `QUEUE_FULL` | Request queue is at capacity |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `SERVICE_UNAVAILABLE` | Neither CLI nor API is available |

## Troubleshooting

### Claude CLI Not Found

```
Error: Claude CLI not available
```

Solution: Install Claude CLI or enable API fallback:

```env
CLAUDE_USE_API_FALLBACK=true
```

### Timeout Errors

```
Error: Process timeout
```

Solutions:
- Increase `CLAUDE_PROCESS_TIMEOUT_MS`
- Simplify the prompt
- Use streaming for long operations

### Queue Full

```
Error: Queue is full
```

Solutions:
- Wait and retry
- Increase `CLAUDE_MAX_QUEUE_SIZE`
- Reduce concurrent requests

## Related Documentation

- [Agent Orchestration Guide](./agent-orchestration.md)
- [Agent Collaboration Guide](./agent-collaboration.md)
- [WebSocket Integration Guide](./websocket-integration.md)
