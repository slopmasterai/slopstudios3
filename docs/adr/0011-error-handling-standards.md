# ADR-0011: Error Handling Standards

## Status

Accepted

## Context

Consistent error handling is critical for:

- Debugging and troubleshooting
- Client-side error display
- Monitoring and alerting
- API consistency

Current challenges:

- Inconsistent error codes across services
- Missing error context
- Difficult to categorize errors
- No error rate tracking

## Decision

We will implement a comprehensive error handling system with:

### 1. Error Categories

All errors are categorized for easier handling:

| Category | Description | HTTP Codes |
|----------|-------------|------------|
| `validation` | Input validation errors | 400, 422 |
| `authentication` | Auth failures | 401 |
| `authorization` | Permission denied | 403 |
| `not_found` | Resource not found | 404 |
| `conflict` | Resource conflict | 409 |
| `rate_limit` | Rate limiting | 429 |
| `client` | Other client errors | 4xx |
| `external` | External service errors | 503 |
| `internal` | Server errors | 500 |
| `timeout` | Timeout errors | 504 |

### 2. Error Codes

Standardized error codes for programmatic handling:

```typescript
// Format: RESOURCE_ACTION_REASON
'USER_NOT_FOUND'
'WORKFLOW_TIMEOUT'
'RATE_LIMIT_EXCEEDED'
'VALIDATION_ERROR'
```

### 3. Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "category": "validation",
    "details": {
      "fields": { "email": "Invalid format" }
    },
    "retryAfter": 60
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_xxx"
  }
}
```

### 4. Error Classes

Enhanced `AppError` class with:

- Status code
- Error code
- Category
- Operational flag
- Details object
- Timestamp

### 5. Error Rate Tracking

In-memory tracking of errors by category:

- Rolling 1-minute windows
- Exposed via metrics endpoint
- Alerting thresholds

### 6. Circuit Breaker

For external service calls:

- Failure threshold triggers open
- Half-open state for recovery testing
- Configurable timeouts

## Implementation

### Error Factory

```typescript
Errors.validation('Invalid email', { email: 'Must be valid' });
Errors.notFound('User not found', 'user_123');
Errors.tooManyRequests('Rate limited', 60);
Errors.circuitBreakerOpen('claude');
```

### Error Handler

Central error handler that:

1. Determines category and code
2. Records error for metrics
3. Logs with appropriate level
4. Returns consistent response

### Logging

Structured logs with context:

```json
{
  "level": "error",
  "requestId": "req_xxx",
  "method": "POST",
  "url": "/api/v1/...",
  "statusCode": 500,
  "errorCode": "INTERNAL_ERROR",
  "category": "internal",
  "message": "Database connection failed"
}
```

## Consequences

### Positive

- Consistent error responses
- Easier client-side handling
- Better debugging
- Error rate visibility
- Automatic retries for transient errors

### Negative

- Migration effort for existing code
- More verbose error definitions
- Slight overhead for tracking

### Mitigations

- Provide migration guide
- Use error factory for convenience
- Efficient in-memory tracking

## Migration

1. Update all route handlers to use `AppError`
2. Use error factory methods
3. Add error codes to documentation
4. Update clients to handle new format

## Related

- Error middleware: `src/middleware/error.middleware.ts`
- Circuit breaker: `src/utils/circuit-breaker.ts`
- Logger: `src/utils/logger.ts`
