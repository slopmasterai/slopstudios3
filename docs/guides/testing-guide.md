# Testing Guide

This guide covers testing practices and patterns for Slop Studios 3.

## Overview

The project uses a comprehensive testing strategy with:

- **Unit Tests**: Test individual functions and classes in isolation
- **Integration Tests**: Test component interactions and API endpoints
- **E2E Tests**: Test complete user flows

## Test Structure

```
tests/
├── unit/                      # Unit tests
│   ├── services/              # Service tests
│   ├── middleware/            # Middleware tests
│   └── utils/                 # Utility tests
├── integration/               # Integration tests
│   ├── api/                   # API endpoint tests
│   └── websocket/             # WebSocket tests
└── e2e/                       # End-to-end tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific test file
npm test -- tests/unit/my-service.test.ts

# Run tests matching pattern
npm test -- --grep "should validate"
```

## Writing Unit Tests

### Basic Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MyService } from '../../src/services/my-service.js';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      const result = service.methodName('input');
      expect(result).toBe('expected');
    });

    it('should throw on invalid input', () => {
      expect(() => service.methodName('')).toThrow('Invalid input');
    });
  });
});
```

### Mocking Dependencies

```typescript
import { vi } from 'vitest';
import { redis } from '../../src/services/redis.service.js';

// Mock the module
vi.mock('../../src/services/redis.service.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

describe('ServiceWithRedis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch from Redis', async () => {
    vi.mocked(redis.get).mockResolvedValue('cached-value');

    const result = await service.getData('key');

    expect(redis.get).toHaveBeenCalledWith('key');
    expect(result).toBe('cached-value');
  });
});
```

### Testing Async Code

```typescript
describe('AsyncService', () => {
  it('should resolve with data', async () => {
    const result = await service.fetchData();
    expect(result).toEqual({ id: 1, name: 'Test' });
  });

  it('should reject on error', async () => {
    await expect(service.failingMethod()).rejects.toThrow('Expected error');
  });

  it('should handle promises', () => {
    return expect(service.asyncMethod()).resolves.toBe('value');
  });
});
```

### Testing Error Handling

```typescript
import { AppError, Errors } from '../../src/middleware/error.middleware.js';

describe('Error handling', () => {
  it('should throw AppError for validation failures', () => {
    try {
      service.validate({ invalid: 'data' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).code).toBe('VALIDATION_ERROR');
    }
  });

  it('should use error factory', () => {
    const error = Errors.notFound('User not found', 'user_123');
    expect(error.statusCode).toBe(404);
    expect(error.category).toBe('not_found');
  });
});
```

## Writing Integration Tests

### API Endpoint Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Auth API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return token on valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.token).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'wrong',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
```

### Authenticated Request Tests

```typescript
describe('Protected API', () => {
  let token: string;

  beforeAll(async () => {
    // Login to get token
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'password123' },
    });
    token = JSON.parse(loginResponse.payload).data.token;
  });

  it('should access protected endpoint with token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/protected/resource',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should reject without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/protected/resource',
    });

    expect(response.statusCode).toBe(401);
  });
});
```

### WebSocket Tests

```typescript
import { io, Socket } from 'socket.io-client';

describe('WebSocket Integration', () => {
  let socket: Socket;

  beforeAll((done) => {
    socket = io('http://localhost:3000', {
      auth: { token: 'valid-token' },
    });
    socket.on('connect', done);
  });

  afterAll(() => {
    socket.close();
  });

  it('should receive workflow progress events', (done) => {
    socket.emit('subscribe:workflow', { workflowId: 'wf_123' });

    socket.on('workflow:progress', (data) => {
      expect(data.workflowId).toBe('wf_123');
      expect(data.progress).toBeGreaterThanOrEqual(0);
      done();
    });

    // Trigger workflow (in another test or setup)
  });
});
```

## Testing Patterns

### Testing Services

```typescript
describe('WorkflowService', () => {
  let service: WorkflowService;
  let mockAgentRegistry: MockedObject<AgentRegistryService>;

  beforeEach(() => {
    mockAgentRegistry = {
      getAgent: vi.fn(),
      listAgents: vi.fn(),
    };
    service = new WorkflowService(mockAgentRegistry);
  });

  it('should execute workflow steps in order', async () => {
    mockAgentRegistry.getAgent.mockResolvedValue({
      id: 'agent_1',
      type: 'claude',
      status: 'idle',
    });

    const result = await service.executeWorkflow({
      id: 'wf_1',
      steps: [
        { id: 'step1', type: 'claude', prompt: 'Hello' },
        { id: 'step2', type: 'claude', prompt: 'World' },
      ],
    });

    expect(mockAgentRegistry.getAgent).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('completed');
  });
});
```

### Testing Middleware

```typescript
import { createMockRequest, createMockReply } from '../helpers/mocks.js';

describe('AuthMiddleware', () => {
  it('should pass valid token', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer valid-token' },
    });
    const reply = createMockReply();
    const next = vi.fn();

    await authMiddleware(req, reply, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });

  it('should reject missing token', async () => {
    const req = createMockRequest({});
    const reply = createMockReply();
    const next = vi.fn();

    await authMiddleware(req, reply, next);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### Testing Circuit Breaker

```typescript
import { CircuitBreaker } from '../../src/utils/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  const failingFn = vi.fn().mockRejectedValue(new Error('Service down'));
  const successFn = vi.fn().mockResolvedValue('success');

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeoutMs: 1000,
    });
  });

  it('should open after failure threshold', async () => {
    // Trigger failures
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    expect(breaker.getState()).toBe('open');
  });

  it('should transition to half-open after recovery timeout', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    // Wait for recovery
    await new Promise((r) => setTimeout(r, 1100));

    expect(breaker.getState()).toBe('half-open');
  });

  it('should close after successful request in half-open', async () => {
    // Setup half-open state...

    await breaker.execute(successFn);
    expect(breaker.getState()).toBe('closed');
  });
});
```

## Test Helpers

### Mock Factories

```typescript
// tests/helpers/factories.ts
import { vi } from 'vitest';

export function createMockUser(overrides = {}) {
  return {
    id: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    ...overrides,
  };
}

export function createMockWorkflow(overrides = {}) {
  return {
    id: 'wf_123',
    status: 'pending',
    steps: [],
    context: {},
    ...overrides,
  };
}

export function createMockRequest(overrides = {}) {
  return {
    id: 'req_123',
    method: 'GET',
    url: '/',
    headers: {},
    body: null,
    query: {},
    params: {},
    ...overrides,
  };
}

export function createMockReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  return reply;
}
```

### Test Utilities

```typescript
// tests/helpers/utils.ts
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('Timeout waiting for condition');
}

export function generateTestToken(payload = {}) {
  return jwt.sign(
    { sub: 'user_123', ...payload },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}
```

## Code Coverage

### Coverage Thresholds

The project enforces minimum coverage thresholds:

```javascript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
});
```

### Viewing Coverage

```bash
# Generate coverage report
npm run test:coverage

# Open HTML report
open coverage/index.html
```

## Best Practices

### 1. Test Naming

Use descriptive names that explain what is being tested:

```typescript
// Good
it('should return 404 when user not found')
it('should retry failed requests up to 3 times')

// Bad
it('works')
it('test user')
```

### 2. Arrange-Act-Assert

Structure tests with clear phases:

```typescript
it('should update user profile', async () => {
  // Arrange
  const user = createMockUser();
  const updates = { name: 'New Name' };

  // Act
  const result = await service.updateProfile(user.id, updates);

  // Assert
  expect(result.name).toBe('New Name');
});
```

### 3. One Assertion Per Test (When Possible)

```typescript
// Good - focused tests
it('should return user id', () => {
  expect(result.id).toBe('user_123');
});

it('should return user email', () => {
  expect(result.email).toBe('test@example.com');
});

// Acceptable - related assertions
it('should return complete user object', () => {
  expect(result).toEqual({
    id: 'user_123',
    email: 'test@example.com',
    name: 'Test',
  });
});
```

### 4. Avoid Test Interdependence

Each test should be independent and not rely on state from other tests.

### 5. Use Test Fixtures

For complex data, use fixtures:

```typescript
// tests/fixtures/workflows.ts
export const validWorkflow = {
  id: 'wf_test',
  steps: [
    { id: 'step1', type: 'claude', prompt: 'Test' },
  ],
};

export const complexWorkflow = {
  // ...
};
```

## Continuous Integration

Tests run automatically on:

- Pull request creation/update
- Push to main/develop branches

See `.github/workflows/ci.yml` for CI configuration.

## Troubleshooting

### Tests Timeout

```bash
# Increase timeout
npm test -- --timeout 30000
```

### Mock Not Working

Ensure mocks are set up before imports:

```typescript
vi.mock('./module', () => ({
  // mock implementation
}));

// Import AFTER mock setup
import { something } from './module';
```

### Flaky Tests

1. Avoid relying on timing
2. Use proper async/await
3. Clean up after each test
4. Don't share state between tests
