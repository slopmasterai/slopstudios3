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
