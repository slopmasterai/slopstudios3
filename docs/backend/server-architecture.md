# Server Architecture

This document describes the backend server architecture for Slop Studios 3.

## Overview

The backend is built using a modern Node.js stack with:

- **Fastify** - High-performance HTTP server with excellent TypeScript support
- **Socket.IO** - WebSocket server with automatic fallback to polling
- **Redis** - Session storage, caching, and rate limiting
- **PostgreSQL** - Primary database (connection pooling ready)

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌───────────────────┐     ┌───────────────────┐                │
│  │   Web Browser     │     │   Mobile App      │                │
│  └─────────┬─────────┘     └─────────┬─────────┘                │
│            │                         │                           │
└────────────┼─────────────────────────┼──────────────────────────┘
             │                         │
             ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Server Layer                                │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Fastify HTTP Server                     │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │   Helmet    │ │    CORS     │ │    Rate Limiter     │  │  │
│  │  │  (Security) │ │  (Headers)  │ │  (Redis-backed)     │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │   Cookie    │ │     JWT     │ │      Session        │  │  │
│  │  │  (Parser)   │ │   (Auth)    │ │  (Redis-backed)     │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Socket.IO WebSocket Server               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │  │
│  │  │  Default /  │ │   /media    │ │   /notifications    │  │  │
│  │  │ (General)   │ │ (Media Gen) │ │  (User Notifs)      │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
│  ┌─────────────────────┐     ┌─────────────────────────────┐   │
│  │       Redis         │     │       PostgreSQL            │   │
│  │  - Sessions         │     │  - User data                │   │
│  │  - Rate limiting    │     │  - Media metadata           │   │
│  │  - Caching          │     │  - Application data         │   │
│  └─────────────────────┘     └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Request Lifecycle

### HTTP Request Flow

1. **Request Received** - Fastify receives the incoming HTTP request
2. **Request ID Generation** - A unique request ID is generated using `generateRequestId()`
3. **Security Headers** - Helmet adds security headers (CSP, HSTS, etc.)
4. **CORS Validation** - CORS headers are validated/added
5. **Cookie Parsing** - Cookies are parsed and made available
6. **Rate Limiting** - Request rate is checked against Redis
7. **Authentication** - JWT token or session is validated
8. **Route Handler** - Business logic is executed
9. **Response** - Response is sent with appropriate headers

```
Client Request
     │
     ▼
┌─────────────┐
│   Fastify   │
│   Server    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Helmet    │ Security headers
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    CORS     │ Origin validation
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Cookie    │ Cookie parsing
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Rate Limit  │◄──── Redis check
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Auth     │◄──── JWT/Session validation
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Route     │ Business logic
│  Handler    │
└──────┬──────┘
       │
       ▼
   Response
```

### WebSocket Connection Flow

1. **Connection Request** - Client initiates WebSocket handshake
2. **Transport Negotiation** - WebSocket or polling transport selected
3. **Connection Middleware** - Request ID assigned, initial validation
4. **Welcome Event** - Server sends welcome message with connection info
5. **Handler Registration** - Event handlers attached to socket
6. **Authentication** (optional) - Client can authenticate via `authenticate` event
7. **Event Loop** - Socket ready to send/receive events

## Session Management

Sessions are stored in Redis with the following structure:

```
Key: session:{sessionId}
Value: JSON {
  id: string,
  userId: string,
  createdAt: ISO timestamp,
  expiresAt: ISO timestamp,
  lastActivityAt: ISO timestamp,
  ipAddress?: string,
  userAgent?: string,
  data: object
}
TTL: Configurable (default 24 hours)
```

User session index:
```
Key: session:user:{userId}
Value: Set of session IDs
```

### Session Lifecycle

1. **Creation** - New session created on login
2. **Validation** - Session checked on each protected request
3. **Extension** - TTL extended on activity
4. **Destruction** - Session deleted on logout or expiration

## Authentication Flow

### JWT Authentication

1. Client sends `Authorization: Bearer <token>` header
2. Server validates token signature using `JWT_SECRET`
3. Server checks token expiration
4. User data attached to request object

### Session Authentication

1. Client sends session ID via cookie or `X-Session-ID` header
2. Server looks up session in Redis
3. Server validates session not expired
4. Session data attached to request, TTL extended

## Error Handling

All errors are transformed to a consistent `ApiResponse` format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `BAD_REQUEST` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## File Structure

```
src/
├── config/
│   └── server.config.ts     # Configuration loading & validation
├── server/
│   ├── http.server.ts       # Fastify HTTP server setup
│   └── websocket.server.ts  # Socket.IO WebSocket server setup
├── routes/
│   └── health.routes.ts     # Health check endpoints
├── middleware/
│   ├── auth.middleware.ts   # JWT authentication
│   ├── session.middleware.ts # Session validation
│   ├── rate-limit.middleware.ts # Rate limiting
│   └── error.middleware.ts  # Error handling
├── services/
│   ├── redis.service.ts     # Redis client management
│   └── session.service.ts   # Session CRUD operations
├── websocket/
│   └── handlers/
│       ├── connection.handler.ts # Connection management
│       ├── auth.handler.ts  # WebSocket authentication
│       └── heartbeat.handler.ts # Connection health
├── types/
│   ├── index.ts             # Core types
│   ├── server.types.ts      # Server-specific types
│   └── websocket.types.ts   # WebSocket event types
├── utils/
│   ├── index.ts             # Utility functions
│   └── logger.ts            # Pino logger configuration
└── index.ts                 # Application entry point
```

## Configuration

Configuration is loaded from environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `PORT` | 3000 | HTTP server port |
| `HOST` | 0.0.0.0 | Server host |
| `LOG_LEVEL` | info | Logging level |
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |
| `JWT_SECRET` | (required) | JWT signing secret |
| `JWT_EXPIRES_IN` | 7d | JWT expiration |
| `APP_SECRET` | (required) | Session encryption secret |
| `SESSION_TTL` | 86400 | Session TTL in seconds |
| `CORS_ORIGIN` | http://localhost:3000 | Allowed CORS origins |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Rate limit window (15 min) |

## Graceful Shutdown

The server handles graceful shutdown on `SIGTERM` and `SIGINT`:

1. Stop accepting new connections
2. Close all WebSocket connections
3. Wait for pending requests to complete
4. Close HTTP server
5. Disconnect from Redis
6. Exit process
