# Developer Onboarding Guide

Welcome to Slop Studios 3! This guide will help you get up to speed with the codebase and development workflow.

## Getting Started

### 1. Prerequisites

Ensure you have the following installed:

- **Node.js** >= 20.0.0 (use [nvm](https://github.com/nvm-sh/nvm) for version management)
- **Docker** and Docker Compose
- **Git**
- **Redis** (or use Docker)
- A code editor (VS Code recommended)

### 2. Initial Setup

```bash
# Clone the repository
git clone https://github.com/slopstudios/slopstudios3.git
cd slopstudios3

# Use the correct Node version
nvm use

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start Redis (if using Docker)
docker-compose up -d redis

# Run database migrations (if applicable)
npm run db:migrate

# Start development server
npm run dev
```

### 3. Verify Setup

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Expected response:
# {"success":true,"data":{"status":"healthy",...}}
```

## Project Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Clients                              │
│   (Web App, Mobile App, CLI Tools, External Services)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Fastify)                    │
│                  Rate Limiting, Auth, CORS                  │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│      REST API           │     │     WebSocket           │
│   - Auth Routes         │     │   - Real-time Updates   │
│   - Claude Routes       │     │   - Streaming           │
│   - Strudel Routes      │     │   - Subscriptions       │
│   - Agent Routes        │     │                         │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Service Layer                           │
│   Claude Service │ Strudel Service │ Agent Orchestration    │
└─────────────────────────────────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer (Redis)                        │
│         Sessions │ Cache │ Metrics │ Workflows              │
└─────────────────────────────────────────────────────────────┘
```

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/config/` | Configuration loading and validation |
| `src/middleware/` | Request processing middleware (auth, rate limiting, error handling) |
| `src/routes/` | API route handlers |
| `src/services/` | Business logic and external integrations |
| `src/types/` | TypeScript type definitions |
| `src/utils/` | Utility functions (logging, helpers) |
| `src/websocket/` | WebSocket event handlers |
| `tests/` | Test files |
| `docs/` | Documentation |

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Application entry point |
| `src/app.ts` | Fastify app configuration |
| `src/config/server.config.ts` | Environment configuration |
| `src/middleware/error.middleware.ts` | Error handling |
| `src/utils/logger.ts` | Logging utilities |

## Development Workflow

### Branch Strategy

```
main        ─────────────────────────────────────────►  Production
              │                               ▲
              │                               │
develop     ──┼───────────────────────────────┤────►  Integration
              │                               │
              │         ┌───────┐             │
feature/*   ──┼─────────┤ PR    ├─────────────┘
              │         └───────┘
              │         ┌───────┐
bugfix/*    ──┴─────────┤ PR    ├─────────────────►
                        └───────┘
```

1. Create feature branch from `develop`
2. Make changes and commit
3. Create PR to `develop`
4. After review and CI passes, merge

### Making Changes

```bash
# Create feature branch
git checkout develop
git pull
git checkout -b feature/my-feature

# Make changes, then commit
git add .
git commit -m "feat: add my feature"

# Push and create PR
git push -u origin feature/my-feature
```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:
```
feat(auth): add OAuth2 support
fix(workflow): handle timeout errors
docs: update API documentation
```

## Code Style

### TypeScript Guidelines

```typescript
// Use explicit types for function parameters and returns
function processWorkflow(id: string, options: ProcessOptions): Promise<WorkflowResult> {
  // ...
}

// Use interfaces for object shapes
interface User {
  id: string;
  email: string;
  name: string;
}

// Use type for unions and intersections
type Status = 'pending' | 'running' | 'completed' | 'failed';
type UserWithRole = User & { role: Role };

// Use branded types for IDs (from src/types/branded.types.ts)
import { UserId, createUserId } from '../types/branded.types.js';

function getUser(id: UserId): Promise<User> {
  // Type-safe ID handling
}
```

### Error Handling

```typescript
import { AppError, Errors } from '../middleware/error.middleware.js';

// Use error factory methods
throw Errors.notFound('User not found', userId);
throw Errors.validation('Invalid email', { email: 'Must be valid email' });
throw Errors.unauthorized('Token expired');

// Handle errors in async functions
async function processData(data: unknown) {
  try {
    const result = await externalService.call(data);
    return result;
  } catch (error) {
    throw Errors.wrap(error, 'Failed to process data');
  }
}
```

### Logging

```typescript
import { logger, logRequest, logEvent } from '../utils/logger.js';

// Basic logging
logger.info('Processing started', { workflowId });
logger.error('Failed to process', { error: err.message });

// Structured logging
logEvent('workflow:started', { workflowId, steps: steps.length });

// Performance logging
const timer = createTimer();
await doSomething();
logTiming('doSomething', timer());
```

## Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
    vi.clearAllMocks();
  });

  it('should process valid input', async () => {
    const result = await service.process({ id: '123' });
    expect(result.status).toBe('completed');
  });

  it('should throw on invalid input', async () => {
    await expect(service.process({})).rejects.toThrow('Invalid input');
  });
});
```

See [Testing Guide](./testing-guide.md) for detailed testing documentation.

## API Development

### Adding a New Endpoint

1. **Create route handler** in `src/routes/`:

```typescript
// src/routes/my-feature.routes.ts
import type { FastifyInstance } from 'fastify';

export async function registerMyFeatureRoutes(app: FastifyInstance): Promise<void> {
  app.post('/my-endpoint', {
    preHandler: [app.authenticate], // Add auth if needed
  }, async (request, reply) => {
    const { data } = request.body as { data: string };

    // Business logic
    const result = await myService.process(data);

    return reply.send({
      success: true,
      data: result,
    });
  });
}
```

2. **Register routes** in `src/index.ts`:

```typescript
import { registerMyFeatureRoutes } from './routes/my-feature.routes.js';

// In createApp function
await registerMyFeatureRoutes(app);
```

3. **Add tests** in `tests/`:

```typescript
// tests/integration/my-feature.test.ts
describe('My Feature API', () => {
  it('POST /my-endpoint should process data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/my-endpoint',
      payload: { data: 'test' },
    });

    expect(response.statusCode).toBe(200);
  });
});
```

4. **Update OpenAPI spec** in `docs/api/openapi.yaml`

### Adding a New Service

1. **Create service** in `src/services/`:

```typescript
// src/services/my.service.ts
import { logger } from '../utils/logger.js';
import { Errors } from '../middleware/error.middleware.js';

export interface MyServiceOptions {
  timeout?: number;
}

export async function doSomething(input: string, options?: MyServiceOptions): Promise<string> {
  if (!input) {
    throw Errors.validation('Input is required');
  }

  logger.info('Processing input', { input, options });

  // Implementation
  return `processed: ${input}`;
}
```

2. **Export from index** (if needed):

```typescript
// src/services/index.ts
export * from './my.service.js';
```

## Debugging

### VS Code Configuration

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev:debug"],
      "console": "integratedTerminal"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--run"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Debug Logging

```bash
# Enable verbose logging
LOG_LEVEL=debug npm run dev

# Debug specific module
DEBUG=mymodule:* npm run dev
```

### Inspecting Redis

```bash
# Connect to Redis CLI
docker exec -it slopstudios3-redis redis-cli

# Common commands
KEYS *                    # List all keys
GET session:xxx           # Get specific key
HGETALL workflow:xxx      # Get hash
MONITOR                   # Watch all commands
```

## Common Tasks

### Adding a New Environment Variable

1. Add to `.env.example` with documentation
2. Add to `src/config/server.config.ts` interface
3. Add loading logic in `loadConfig()`
4. Add validation if needed in `validateConfig()`

### Adding a New WebSocket Event

1. Create handler in `src/websocket/handlers/`:

```typescript
export function handleMyEvent(socket: Socket, data: MyEventData) {
  // Handle event
  socket.emit('my-event:result', result);
}
```

2. Register in namespace handler:

```typescript
io.of('/my-namespace').on('connection', (socket) => {
  socket.on('my-event', (data) => handleMyEvent(socket, data));
});
```

### Adding Database Migrations

```bash
# Create migration
npm run db:migrate:create my-migration

# Run migrations
npm run db:migrate

# Rollback
npm run db:migrate:rollback
```

## Resources

### Documentation
- [Getting Started](./getting-started.md)
- [Testing Guide](./testing-guide.md)
- [Claude Integration](./claude-integration.md)
- [Agent Orchestration](./agent-orchestration.md)
- [WebSocket Integration](./websocket-integration.md)

### Architecture Decision Records
- [ADR-0009: API Documentation Strategy](../adr/0009-api-documentation-strategy.md)
- [ADR-0010: Performance Optimization](../adr/0010-performance-optimization.md)
- [ADR-0011: Error Handling Standards](../adr/0011-error-handling-standards.md)

### External Resources
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [Vitest Documentation](https://vitest.dev/)

## Getting Help

- Check existing documentation first
- Search closed issues and PRs
- Ask in team chat
- Create an issue for bugs or feature requests
