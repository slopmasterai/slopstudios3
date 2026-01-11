# Claude API Endpoints

This document describes the REST API endpoints for Claude CLI integration.

## Base URL

```
/api/v1/claude
```

## Authentication

All endpoints except `/health` require JWT authentication via the
`Authorization` header:

```
Authorization: Bearer <jwt-token>
```

## Endpoints

### Execute Command (Synchronous)

Execute a Claude command and wait for the result.

```
POST /api/v1/claude/execute
```

#### Request Body

| Field              | Type   | Required | Description                                      |
| ------------------ | ------ | -------- | ------------------------------------------------ |
| `prompt`           | string | Yes      | The prompt to send to Claude (1-100000 chars)    |
| `systemPrompt`     | string | No       | System prompt to set context (max 10000 chars)   |
| `model`            | string | No       | Model to use (default: claude-sonnet-4-20250514) |
| `maxTokens`        | number | No       | Maximum tokens in response (1-100000)            |
| `workingDirectory` | string | No       | Working directory for CLI execution              |
| `timeoutMs`        | number | No       | Timeout in milliseconds (1000-600000)            |
| `priority`         | number | No       | Queue priority (0-100, higher = more priority)   |

#### Example Request

```json
{
  "prompt": "Explain the concept of recursion in programming",
  "systemPrompt": "You are a helpful programming tutor",
  "maxTokens": 1000
}
```

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "id": "claude_abc123",
    "userId": "user-id",
    "status": "completed",
    "stdout": "Recursion is a programming technique where...",
    "stderr": "",
    "exitCode": 0,
    "startedAt": "2026-01-10T12:00:00.000Z",
    "completedAt": "2026-01-10T12:00:02.500Z",
    "durationMs": 2500,
    "parsedResponse": {
      "content": "Recursion is a programming technique where...",
      "usage": {
        "inputTokens": 15,
        "outputTokens": 250,
        "totalTokens": 265
      }
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:02.500Z",
    "requestId": "req_xyz789"
  }
}
```

#### Queued Response (202)

Returned when the request is queued due to high load:

```json
{
  "success": true,
  "data": {
    "processId": "claude_abc123",
    "status": "queued",
    "message": "Request queued due to high load. Use async endpoint or poll for status."
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Execute Command (Asynchronous)

Start execution and return immediately with a process ID.

```
POST /api/v1/claude/execute/async
```

#### Request Body

Same as synchronous endpoint.

#### Success Response (202)

```json
{
  "success": true,
  "data": {
    "processId": "claude_abc123",
    "status": "pending",
    "message": "Process started. Poll /api/v1/claude/processes/:id for status."
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Get Process Status

Get the status of a Claude process.

```
GET /api/v1/claude/processes/:id
```

#### Path Parameters

| Parameter | Description |
| --------- | ----------- |
| `id`      | Process ID  |

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "processId": "claude_abc123",
    "status": "running",
    "createdAt": "2026-01-10T12:00:00.000Z",
    "startedAt": "2026-01-10T12:00:00.500Z"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:01.000Z",
    "requestId": "req_xyz789"
  }
}
```

For completed processes:

```json
{
  "success": true,
  "data": {
    "processId": "claude_abc123",
    "status": "completed",
    "createdAt": "2026-01-10T12:00:00.000Z",
    "startedAt": "2026-01-10T12:00:00.500Z",
    "completedAt": "2026-01-10T12:00:02.500Z",
    "durationMs": 2000,
    "result": {
      "id": "claude_abc123",
      "userId": "user-id",
      "status": "completed",
      "stdout": "Response content...",
      "stderr": "",
      "exitCode": 0,
      "startedAt": "2026-01-10T12:00:00.500Z",
      "completedAt": "2026-01-10T12:00:02.500Z",
      "durationMs": 2000
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:03.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Process Status Values

| Status      | Description                       |
| ----------- | --------------------------------- |
| `pending`   | Process created, waiting to start |
| `queued`    | In queue, waiting for capacity    |
| `running`   | Currently executing               |
| `completed` | Finished successfully             |
| `failed`    | Finished with error               |
| `timeout`   | Exceeded timeout limit            |
| `cancelled` | Cancelled by user                 |

---

### Cancel Process

Cancel a running or queued process.

```
DELETE /api/v1/claude/processes/:id
```

#### Path Parameters

| Parameter | Description          |
| --------- | -------------------- |
| `id`      | Process ID to cancel |

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "message": "Process cancelled successfully"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Error Response (400) - Already Completed

```json
{
  "success": false,
  "error": {
    "code": "PROCESS_ALREADY_COMPLETED",
    "message": "Process already completed"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### List Processes

List the authenticated user's Claude processes.

```
GET /api/v1/claude/processes
```

#### Query Parameters

| Parameter  | Type   | Default | Description              |
| ---------- | ------ | ------- | ------------------------ |
| `page`     | number | 1       | Page number              |
| `pageSize` | number | 20      | Items per page (max 100) |
| `status`   | string | -       | Filter by status         |

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "processes": [
      {
        "processId": "claude_abc123",
        "status": "completed",
        "createdAt": "2026-01-10T12:00:00.000Z",
        "startedAt": "2026-01-10T12:00:00.500Z",
        "completedAt": "2026-01-10T12:00:02.500Z",
        "durationMs": 2000
      },
      {
        "processId": "claude_def456",
        "status": "running",
        "createdAt": "2026-01-10T12:01:00.000Z",
        "startedAt": "2026-01-10T12:01:00.500Z"
      }
    ],
    "total": 25,
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalPages": 2
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:02:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Health Check

Check Claude service health and availability.

```
GET /api/v1/claude/health
```

**Note:** This endpoint does not require authentication.

#### Success Response (200)

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
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Unhealthy Response (503)

```json
{
  "success": false,
  "data": {
    "healthy": false,
    "cli": {
      "installed": false,
      "error": "Claude CLI not found at /usr/local/bin/claude"
    },
    "apiFallbackAvailable": false,
    "activeProcesses": 0,
    "queueSize": 0,
    "maxConcurrentProcesses": 5
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Get Service Metrics

Retrieve aggregated metrics for the Claude service, including process counts,
success rates, and performance statistics.

```
GET /api/v1/claude/metrics
```

#### Query Parameters

| Parameter       | Type    | Default | Description                                                                                 |
| --------------- | ------- | ------- | ------------------------------------------------------------------------------------------- |
| `periodSeconds` | number  | 3600    | Time period for aggregated metrics (60-86400 seconds)                                       |
| `includeRecent` | boolean | false   | Whether to include recent individual process metrics                                        |
| `recentLimit`   | number  | 100     | Maximum number of recent metrics to return (1-1000, only used when `includeRecent` is true) |

#### Example Request

```
GET /api/v1/claude/metrics?periodSeconds=3600&includeRecent=true&recentLimit=10
```

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "totalProcesses": 150,
    "successfulProcesses": 142,
    "failedProcesses": 5,
    "timedOutProcesses": 2,
    "cancelledProcesses": 1,
    "activeProcesses": 3,
    "queuedProcesses": 0,
    "avgDurationMs": 2500,
    "minDurationMs": 450,
    "maxDurationMs": 12000,
    "p95DurationMs": 5200,
    "p99DurationMs": 8500,
    "successRate": 0.947,
    "timestamp": "2026-01-10T12:00:00.000Z",
    "periodSeconds": 3600,
    "recentMetrics": [
      {
        "processId": "claude_abc123",
        "userId": "user-id",
        "durationMs": 2100,
        "peakMemoryBytes": 52428800,
        "cpuTimeMs": 1800,
        "inputSize": 250,
        "outputSize": 1500,
        "success": true,
        "timestamp": "2026-01-10T11:59:30.000Z"
      },
      {
        "processId": "claude_def456",
        "userId": "user-id",
        "durationMs": 3200,
        "inputSize": 500,
        "outputSize": 2200,
        "success": true,
        "timestamp": "2026-01-10T11:58:45.000Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Response Without Recent Metrics

When `includeRecent` is false or omitted:

```json
{
  "success": true,
  "data": {
    "totalProcesses": 150,
    "successfulProcesses": 142,
    "failedProcesses": 5,
    "timedOutProcesses": 2,
    "cancelledProcesses": 1,
    "activeProcesses": 3,
    "queuedProcesses": 0,
    "avgDurationMs": 2500,
    "minDurationMs": 450,
    "maxDurationMs": 12000,
    "p95DurationMs": 5200,
    "p99DurationMs": 8500,
    "successRate": 0.947,
    "timestamp": "2026-01-10T12:00:00.000Z",
    "periodSeconds": 3600
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Service Metrics Fields

| Field                 | Type   | Description                                      |
| --------------------- | ------ | ------------------------------------------------ |
| `totalProcesses`      | number | Total number of processes executed in the period |
| `successfulProcesses` | number | Number of processes that completed successfully  |
| `failedProcesses`     | number | Number of processes that failed                  |
| `timedOutProcesses`   | number | Number of processes that timed out               |
| `cancelledProcesses`  | number | Number of processes that were cancelled          |
| `activeProcesses`     | number | Currently running processes                      |
| `queuedProcesses`     | number | Processes waiting in queue                       |
| `avgDurationMs`       | number | Average execution duration in milliseconds       |
| `minDurationMs`       | number | Minimum execution duration in milliseconds       |
| `maxDurationMs`       | number | Maximum execution duration in milliseconds       |
| `p95DurationMs`       | number | 95th percentile execution duration               |
| `p99DurationMs`       | number | 99th percentile execution duration               |
| `successRate`         | number | Success rate as decimal (0-1)                    |
| `timestamp`           | string | Timestamp of the metrics snapshot                |
| `periodSeconds`       | number | Time period covered by these metrics             |

#### Recent Metrics Fields (Optional)

| Field             | Type    | Description                        |
| ----------------- | ------- | ---------------------------------- |
| `processId`       | string  | Process identifier                 |
| `userId`          | string  | User who initiated the process     |
| `durationMs`      | number  | Execution duration in milliseconds |
| `peakMemoryBytes` | number  | Peak memory usage (if available)   |
| `cpuTimeMs`       | number  | CPU time consumed (if available)   |
| `inputSize`       | number  | Input size in characters           |
| `outputSize`      | number  | Output size in characters          |
| `success`         | boolean | Whether the process succeeded      |
| `timestamp`       | string  | When the process completed         |

#### Error Response (401) - Unauthorized

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired authentication token"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Error Response (500) - Internal Error

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Failed to get service metrics"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Authentication

This endpoint requires JWT authentication via the `Authorization` header.

#### Rate Limits

This endpoint is subject to the status/list endpoint rate limit: **100
requests/15 minutes per user**.

---

## Error Responses

### Unauthorized (401)

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired authentication token"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

### Not Found (404)

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Process not found"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

### Rate Limit Exceeded (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 60 seconds."
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

### Internal Error (500)

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal server error occurred"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

## Rate Limits

| Endpoint              | Limit                            |
| --------------------- | -------------------------------- |
| Execute endpoints     | 5 requests/minute per user       |
| Status/List endpoints | 100 requests/15 minutes per user |
| Health endpoint       | No limit                         |

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 4
X-RateLimit-Reset: 1704891660
```

---

## WebSocket Events

For real-time streaming, use WebSocket connections with the following events:

### Client → Server

| Event            | Payload                | Description     |
| ---------------- | ---------------------- | --------------- |
| `claude:execute` | `ClaudeExecutePayload` | Start execution |
| `claude:cancel`  | `string` (processId)   | Cancel process  |
| `claude:status`  | `string` (processId)   | Get status      |

### Server → Client

| Event             | Payload                 | Description        |
| ----------------- | ----------------------- | ------------------ |
| `claude:progress` | `ClaudeProgressPayload` | Streaming output   |
| `claude:complete` | `ClaudeCompletePayload` | Execution complete |
| `claude:error`    | `ClaudeErrorPayload`    | Error occurred     |

See [WebSocket Events](../backend/websocket-events.md) for detailed WebSocket
documentation.
