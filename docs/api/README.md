# API Documentation

This directory contains API documentation for Slop Studios 3.

## Overview

API documentation is generated from OpenAPI/Swagger specifications and inline
code comments.

## Structure

```
api/
├── README.md           # This file
├── openapi.yaml        # OpenAPI 3.0 specification
└── endpoints/          # Detailed endpoint documentation
    ├── auth.md
    ├── users.md
    └── ...
```

## Generating Documentation

```bash
# Generate API docs from OpenAPI spec
npm run docs:api

# Start documentation server
npm run docs:serve
```

## API Versioning

We use URL-based versioning:

- `/api/v1/` - Version 1 (current)
- `/api/v2/` - Version 2 (when applicable)

## Authentication

All API requests require authentication unless otherwise specified. See
[Authentication](endpoints/auth.md) for details.

## Response Format

All responses follow a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_abc123"
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_abc123"
  }
}
```

## Rate Limiting

API requests are rate limited. See response headers:

- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: Unix timestamp when window resets

Different endpoints have different rate limits:

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| Default | 100 requests | 15 minutes |
| Authentication | 10 requests | 1 minute |
| Uploads | 50 requests | 1 hour |
| Heavy operations | 5 requests | 1 minute |

## Health Check Endpoints

### GET /health

Basic health check. Returns 200 OK if server is running.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "0.0.1",
    "uptime": 3600
  }
}
```

### GET /health/ready

Readiness probe. Checks all dependencies (Redis, Database).

```bash
curl http://localhost:3000/health/ready
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "0.0.1",
    "uptime": 3600,
    "dependencies": {
      "redis": { "status": "up", "latency": 2 },
      "database": { "status": "not_configured" }
    }
  }
}
```

Returns 503 if any dependency is unhealthy.

### GET /health/live

Liveness probe. Always returns 200 if server is running.

```bash
curl http://localhost:3000/health/live
```

## WebSocket Connection

### Endpoint

```
ws://localhost:3000
ws://localhost:3000/media
ws://localhost:3000/notifications
```

### Connection with Authentication

```javascript
const socket = io('ws://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});
```

See [WebSocket Events Documentation](../backend/websocket-events.md) for full event reference.

## Session Management

Sessions can be managed via:

1. **JWT Token** - Send in `Authorization: Bearer <token>` header
2. **Session Cookie** - `session_id` cookie set on login
3. **Session Header** - `X-Session-ID` header with session ID

### Session Lifecycle

1. **Create** - Session created on successful authentication
2. **Use** - Session validated on each protected request
3. **Extend** - Session TTL extended on activity
4. **Destroy** - Session deleted on logout

### Session Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `SESSION_TTL` | 86400 (24h) | Session time-to-live in seconds |
| `APP_SECRET` | (required) | Secret for session encryption |

## Authentication Flow

### JWT Authentication

1. Client sends credentials to `/api/v1/auth/login`
2. Server returns JWT token in response
3. Client includes token in `Authorization` header for subsequent requests
4. Token is validated on each request

### Request Headers

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
X-Request-ID: optional-client-request-id
```

### Response Headers

```
X-Request-ID: req_1234567890_abc
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1704067200
```
