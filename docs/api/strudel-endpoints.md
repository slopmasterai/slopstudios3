# Strudel API Endpoints

This document describes the REST API endpoints for Strudel live coding music
integration.

## Base URL

```
/api/v1/strudel
```

## Authentication

All endpoints except `/health` require JWT authentication via the
`Authorization` header:

```
Authorization: Bearer <jwt-token>
```

## Endpoints

### Validate Pattern

Validate a Strudel pattern without executing it.

```
POST /api/v1/strudel/validate
```

#### Request Body

| Field  | Type   | Required | Description                               |
| ------ | ------ | -------- | ----------------------------------------- |
| `code` | string | Yes      | The Strudel pattern code (1-100000 chars) |

#### Example Request

```json
{
  "code": "note(\"c3 e3 g3\").s(\"sawtooth\")"
}
```

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "isValid": true,
    "errors": [],
    "warnings": [],
    "transpiledCode": "note(\"c3 e3 g3\").s(\"sawtooth\")",
    "validationTimeMs": 15
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Validation Errors Response (200)

```json
{
  "success": true,
  "data": {
    "isValid": false,
    "errors": [
      {
        "message": "Unexpected token (1:10)",
        "line": 1,
        "column": 10,
        "code": "SYNTAX_ERROR",
        "suggestion": "Check for missing brackets or quotes"
      }
    ],
    "warnings": [],
    "validationTimeMs": 5
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Error Codes

| Code               | Description                        |
| ------------------ | ---------------------------------- |
| `SYNTAX_ERROR`     | JavaScript syntax error in pattern |
| `PATTERN_TOO_LONG` | Pattern exceeds maximum length     |
| `INFINITE_LOOP`    | Potential infinite loop detected   |
| `INVALID_FUNCTION` | Unknown function reference         |

#### Warning Codes

| Code                 | Description                          |
| -------------------- | ------------------------------------ |
| `SHORT_PATTERN`      | Pattern may be too short for output  |
| `UNMATCHED_BRACKETS` | Unmatched brackets in mini-notation  |
| `HIGH_COMPLEXITY`    | Pattern may cause performance issues |

---

### Execute Pattern (Synchronous)

Execute a Strudel pattern and render audio, waiting for the result.

```
POST /api/v1/strudel/execute
```

#### Request Body

| Field      | Type   | Required | Description                                    |
| ---------- | ------ | -------- | ---------------------------------------------- |
| `code`     | string | Yes      | The Strudel pattern code (1-100000 chars)      |
| `options`  | object | No       | Render options                                 |
| `priority` | number | No       | Queue priority (0-100, higher = more priority) |

#### Options Object

| Field        | Type   | Default | Description                                    |
| ------------ | ------ | ------- | ---------------------------------------------- |
| `duration`   | number | 10      | Audio duration in seconds (1-600)              |
| `sampleRate` | number | 44100   | Sample rate (22050, 44100, 48000, 96000)       |
| `channels`   | number | 2       | Audio channels (1 or 2)                        |
| `format`     | string | "wav"   | Output format (currently only "wav" supported) |
| `tempo`      | number | -       | Override tempo in BPM                          |

#### Example Request

```json
{
  "code": "s(\"bd sd hh sd\").gain(0.8).room(0.3)",
  "options": {
    "duration": 30,
    "sampleRate": 48000,
    "channels": 2,
    "format": "wav"
  }
}
```

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "processId": "strudel_abc123",
    "status": "complete",
    "validation": {
      "isValid": true,
      "errors": [],
      "warnings": [],
      "validationTimeMs": 12
    },
    "audioMetadata": {
      "duration": 30,
      "sampleRate": 48000,
      "channels": 2,
      "format": "wav",
      "fileSize": 2880044
    },
    "timing": {
      "startedAt": "2026-01-10T12:00:00.000Z",
      "completedAt": "2026-01-10T12:00:05.500Z",
      "validationTimeMs": 12,
      "renderTimeMs": 5488,
      "totalTimeMs": 5500
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:05.500Z",
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
    "processId": "strudel_abc123",
    "status": "queued",
    "queuePosition": 3,
    "message": "Request queued due to high load. Use async endpoint or poll for status."
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Execute Pattern (Asynchronous)

Start pattern execution and return immediately with a process ID.

```
POST /api/v1/strudel/execute/async
```

#### Request Body

Same as synchronous endpoint.

#### Success Response (202)

```json
{
  "success": true,
  "data": {
    "processId": "strudel_abc123",
    "status": "pending",
    "message": "Process started. Poll /api/v1/strudel/processes/:id for status."
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Get Process Status

Get the status of a Strudel rendering process.

```
GET /api/v1/strudel/processes/:id
```

#### Path Parameters

| Parameter | Description |
| --------- | ----------- |
| `id`      | Process ID  |

#### Success Response (200) - Rendering

```json
{
  "success": true,
  "data": {
    "processId": "strudel_abc123",
    "status": "rendering",
    "progress": 65,
    "createdAt": "2026-01-10T12:00:00.000Z",
    "startedAt": "2026-01-10T12:00:00.500Z"
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:03.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Success Response (200) - Completed

```json
{
  "success": true,
  "data": {
    "processId": "strudel_abc123",
    "status": "complete",
    "progress": 100,
    "createdAt": "2026-01-10T12:00:00.000Z",
    "startedAt": "2026-01-10T12:00:00.500Z",
    "completedAt": "2026-01-10T12:00:05.500Z",
    "audioMetadata": {
      "duration": 30,
      "sampleRate": 48000,
      "channels": 2,
      "format": "wav",
      "fileSize": 2880044
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:06.000Z",
    "requestId": "req_xyz789"
  }
}
```

#### Process Status Values

| Status       | Description                       |
| ------------ | --------------------------------- |
| `pending`    | Process created, waiting to start |
| `queued`     | In queue, waiting for capacity    |
| `validating` | Pattern is being validated        |
| `rendering`  | Audio is being rendered           |
| `complete`   | Finished successfully             |
| `failed`     | Finished with error               |
| `cancelled`  | Cancelled by user                 |

---

### Cancel Process

Cancel a rendering or queued process.

```
DELETE /api/v1/strudel/processes/:id
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

List the authenticated user's Strudel processes.

```
GET /api/v1/strudel/processes
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
        "processId": "strudel_abc123",
        "status": "complete",
        "progress": 100,
        "createdAt": "2026-01-10T12:00:00.000Z",
        "completedAt": "2026-01-10T12:00:05.500Z"
      },
      {
        "processId": "strudel_def456",
        "status": "rendering",
        "progress": 45,
        "createdAt": "2026-01-10T12:01:00.000Z",
        "startedAt": "2026-01-10T12:01:00.500Z"
      }
    ],
    "total": 25,
    "page": 1,
    "pageSize": 20,
    "totalPages": 2
  },
  "meta": {
    "timestamp": "2026-01-10T12:02:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Health Check

Check Strudel service health and availability.

```
GET /api/v1/strudel/health
```

**Note:** This endpoint does not require authentication.

#### Success Response (200)

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
      "active": 2,
      "queued": 1,
      "maxConcurrent": 5
    },
    "uptimeSeconds": 86400,
    "redis": {
      "connected": true
    }
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
    "status": "unhealthy",
    "transpiler": {
      "available": false,
      "error": "Transpiler initialization failed"
    },
    "audioRenderer": {
      "available": true
    },
    "processes": {
      "active": 0,
      "queued": 0,
      "maxConcurrent": 5
    },
    "uptimeSeconds": 0,
    "redis": {
      "connected": false
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

### Get Service Metrics

Retrieve aggregated metrics for the Strudel service.

```
GET /api/v1/strudel/metrics
```

#### Query Parameters

| Parameter       | Type   | Default | Description                                |
| --------------- | ------ | ------- | ------------------------------------------ |
| `periodSeconds` | number | 3600    | Time period for metrics (60-86400 seconds) |

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "periodSeconds": 3600,
    "timestamp": "2026-01-10T12:00:00.000Z",
    "validation": {
      "total": 500,
      "successful": 485,
      "failed": 15,
      "successRate": 0.97,
      "averageTimeMs": 12,
      "p50TimeMs": 10,
      "p95TimeMs": 25,
      "p99TimeMs": 45
    },
    "render": {
      "total": 200,
      "successful": 190,
      "failed": 8,
      "cancelled": 2,
      "successRate": 0.95,
      "averageTimeMs": 5200,
      "p50TimeMs": 4500,
      "p95TimeMs": 12000,
      "p99TimeMs": 25000,
      "totalAudioSeconds": 6000,
      "averageAudioSeconds": 30
    },
    "queue": {
      "currentDepth": 1,
      "peakDepth": 8,
      "rejections": 0
    },
    "errors": {
      "syntax": 10,
      "timeout": 3,
      "system": 2,
      "render": 5
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

---

## Error Responses

### Validation Error (400)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Pattern validation failed",
    "details": {
      "errors": [
        {
          "message": "Unexpected token",
          "line": 1,
          "column": 10,
          "code": "SYNTAX_ERROR"
        }
      ]
    }
  },
  "meta": {
    "timestamp": "2026-01-10T12:00:00.000Z",
    "requestId": "req_xyz789"
  }
}
```

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

### Forbidden (403)

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied to this process"
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

### Service Unavailable (503)

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Strudel service is not available"
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
| Validate endpoint     | 30 requests/minute per user      |
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

| Event              | Payload                 | Description             |
| ------------------ | ----------------------- | ----------------------- |
| `strudel:validate` | `{ code: string }`      | Validate pattern        |
| `strudel:execute`  | `StrudelExecutePayload` | Start pattern execution |
| `strudel:cancel`   | `{ processId: string }` | Cancel process          |
| `strudel:status`   | `{ processId: string }` | Get process status      |

### Server → Client

| Event               | Payload                   | Description         |
| ------------------- | ------------------------- | ------------------- |
| `strudel:validated` | `StrudelValidatedPayload` | Validation complete |
| `strudel:queued`    | `StrudelQueuedPayload`    | Process queued      |
| `strudel:progress`  | `StrudelProgressPayload`  | Rendering progress  |
| `strudel:complete`  | `StrudelCompletePayload`  | Execution complete  |
| `strudel:error`     | `StrudelErrorPayload`     | Error occurred      |

See [WebSocket Events](../backend/websocket-events.md) for detailed WebSocket
documentation.

---

## Strudel Pattern Examples

### Simple Note Pattern

```javascript
note('c3 e3 g3 c4').s('sawtooth');
```

### Drum Pattern with Effects

```javascript
s('bd sd hh sd').gain(0.8).room(0.3).delay(0.25);
```

### Mini-Notation

```javascript
'[bd sd] hh*2 [~ sd] hh*2';
```

### Layered Pattern

```javascript
stack(s('bd*4'), s('hh*8').gain(0.5), note('c3 e3 g3 c4').s('piano'));
```

### Euclidean Rhythm

```javascript
s('bd').euclid(3, 8).room(0.2);
```

For more Strudel pattern examples and documentation, visit
[strudel.cc](https://strudel.cc).
