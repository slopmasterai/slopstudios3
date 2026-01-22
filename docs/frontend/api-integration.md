# API Integration Guide

## Overview

The frontend integrates with the backend through:
1. REST APIs via Axios
2. WebSocket via Socket.IO

All API calls are abstracted through service modules and custom hooks.

## HTTP Client Configuration

### Axios Instance

```typescript
// lib/api.ts
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Request Interceptor

Automatically attaches JWT token:

```typescript
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Response Interceptor

Handles authentication errors:

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## Service Layer

### Service Pattern

Each service module encapsulates related API calls:

```typescript
// services/claude.service.ts
export const claudeService = {
  async executeCommand(command: string, options?: ClaudeOptions) {
    return post<ExecuteResponse>('/claude/execute', { command, options });
  },

  async getProcessStatus(processId: string) {
    return get<ClaudeProcess>(`/claude/processes/${processId}`);
  },

  async cancelProcess(processId: string) {
    return del<{ message: string }>(`/claude/processes/${processId}`);
  },

  async listProcesses(params?: PaginationParams) {
    return get<PaginatedResult<ClaudeProcess>>('/claude/processes', params);
  },
};
```

### Helper Functions

```typescript
// lib/api.ts
export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<ApiResponse<T>>(url, { params });
  return response.data.data;
}

export async function post<T>(url: string, data?: unknown): Promise<T> {
  const response = await api.post<ApiResponse<T>>(url, data);
  return response.data.data;
}

export async function put<T>(url: string, data?: unknown): Promise<T> {
  const response = await api.put<ApiResponse<T>>(url, data);
  return response.data.data;
}

export async function del<T>(url: string): Promise<T> {
  const response = await api.delete<ApiResponse<T>>(url);
  return response.data.data;
}
```

## Available Services

### Auth Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| `login(credentials)` | POST `/auth/login` | User login |
| `register(data)` | POST `/auth/register` | User registration |
| `logout()` | POST `/auth/logout` | User logout |
| `getCurrentUser()` | GET `/auth/me` | Get current user |
| `refreshToken()` | POST `/auth/refresh` | Refresh JWT token |
| `changePassword(current, new)` | POST `/auth/change-password` | Change password |
| `updateProfile(data)` | POST `/auth/profile` | Update profile |

### Claude Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| `executeCommand(command, options)` | POST `/claude/execute` | Execute synchronously |
| `executeAsync(command, options)` | POST `/claude/execute/async` | Execute asynchronously |
| `getProcessStatus(processId)` | GET `/claude/processes/:id` | Get process status |
| `cancelProcess(processId)` | DELETE `/claude/processes/:id` | Cancel process |
| `listProcesses(params)` | GET `/claude/processes` | List processes |
| `getMetrics()` | GET `/claude/metrics` | Get metrics |
| `getHealth()` | GET `/claude/health` | Health check |
| `retryProcess(processId)` | POST `/claude/processes/:id/retry` | Retry failed |

### Strudel Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| `validatePattern(code)` | POST `/strudel/validate` | Validate pattern |
| `executePattern(code, options)` | POST `/strudel/execute` | Execute synchronously |
| `executeAsync(code, options)` | POST `/strudel/execute/async` | Execute asynchronously |
| `getProcessStatus(processId)` | GET `/strudel/processes/:id` | Get process status |
| `cancelProcess(processId)` | DELETE `/strudel/processes/:id` | Cancel process |
| `listProcesses(params)` | GET `/strudel/processes` | List processes |
| `getMetrics()` | GET `/strudel/metrics` | Get metrics |
| `getPresets()` | GET `/strudel/presets` | Get example patterns |

### Agent Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| `createTemplate(data)` | POST `/agents/templates` | Create template |
| `getTemplate(id)` | GET `/agents/templates/:id` | Get template |
| `updateTemplate(id, data)` | PUT `/agents/templates/:id` | Update template |
| `deleteTemplate(id)` | DELETE `/agents/templates/:id` | Delete template |
| `listTemplates(params)` | GET `/agents/templates` | List templates |
| `registerAgent(data)` | POST `/agents/registry` | Register agent |
| `listAgents(params)` | GET `/agents/registry` | List agents |
| `getAgent(id)` | GET `/agents/registry/:id` | Get agent |
| `unregisterAgent(id)` | DELETE `/agents/registry/:id` | Unregister agent |
| `executeWorkflow(data)` | POST `/agents/workflows/execute` | Execute workflow |
| `getWorkflowStatus(id)` | GET `/agents/workflows/:id` | Get workflow status |
| `cancelWorkflow(id)` | DELETE `/agents/workflows/:id` | Cancel workflow |
| `pauseWorkflow(id)` | POST `/agents/workflows/:id/pause` | Pause workflow |
| `resumeWorkflow(id)` | POST `/agents/workflows/:id/resume` | Resume workflow |
| `orchestrateSequential(...)` | POST `/agents/orchestrate/sequential` | Sequential execution |
| `orchestrateParallel(...)` | POST `/agents/orchestrate/parallel` | Parallel execution |
| `orchestrateSelfCritique(...)` | POST `/agents/orchestrate/self-critique` | Self-critique |
| `orchestrateDiscussion(...)` | POST `/agents/orchestrate/discussion` | Discussion |

## WebSocket Integration

### Connection

```typescript
// lib/socket.ts
import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

export function createSocket() {
  const token = localStorage.getItem('token');

  return io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
}
```

### Event Types

#### Claude Events

| Event | Data | Description |
|-------|------|-------------|
| `claude:progress` | `{ processId, output }` | Output chunk |
| `claude:queued` | `{ processId }` | Process queued |
| `claude:complete` | `{ processId, output, exitCode }` | Process complete |
| `claude:error` | `{ processId, error }` | Process error |

#### Strudel Events

| Event | Data | Description |
|-------|------|-------------|
| `strudel:validated` | `{ valid, errors }` | Validation result |
| `strudel:queued` | `{ processId }` | Process queued |
| `strudel:progress` | `{ processId, progress, stage }` | Render progress |
| `strudel:complete` | `{ processId, audioUrl }` | Render complete |
| `strudel:error` | `{ processId, error }` | Render error |

#### Agent Workflow Events

| Event | Data | Description |
|-------|------|-------------|
| `agent:workflow:started` | `{ workflowId, agents }` | Workflow started |
| `agent:workflow:step:completed` | `{ workflowId, step, agentId, result }` | Step complete |
| `agent:workflow:completed` | `{ workflowId, results }` | Workflow complete |
| `agent:workflow:failed` | `{ workflowId, error }` | Workflow failed |
| `agent:critique:iteration` | `{ workflowId, iteration, critique }` | Critique iteration |
| `agent:discussion:contribution` | `{ workflowId, agentId, contribution }` | Discussion turn |

### Subscribing to Events

```typescript
// In component or hook
import { subscribeToEvent } from '@/lib/socket';

useEffect(() => {
  const unsubscribe = subscribeToEvent('claude:progress', (data) => {
    if (data.processId === currentProcessId) {
      setOutput(prev => prev + data.output);
    }
  });

  return unsubscribe;
}, [currentProcessId]);
```

## Error Handling

### API Errors

```typescript
try {
  await claudeService.executeCommand(command);
} catch (error) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || 'Request failed';
    const status = error.response?.status;

    if (status === 400) {
      // Validation error
    } else if (status === 404) {
      // Not found
    } else if (status === 500) {
      // Server error
    }
  }
}
```

### TanStack Query Error Handling

```typescript
const { data, error, isError } = useQuery({
  queryKey: ['claude', 'processes'],
  queryFn: claudeService.listProcesses,
});

// In component
if (isError) {
  return <Alert variant="destructive">{error.message}</Alert>;
}
```

### Toast Notifications

```typescript
import { toastSuccess, toastError } from '@/hooks/useToast';

try {
  await claudeService.executeCommand(command);
  toastSuccess('Command executed', 'Your command is running.');
} catch (error) {
  toastError('Execution failed', error.message);
}
```

## Type Safety

### Response Types

```typescript
// types/index.ts
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### Service Return Types

```typescript
// Service methods are typed
async executeCommand(command: string): Promise<ExecuteResponse>
async listProcesses(params?: PaginationParams): Promise<PaginatedResult<ClaudeProcess>>
```

## Best Practices

1. **Use services for API calls** - Don't call axios directly in components
2. **Handle errors appropriately** - Show user-friendly messages
3. **Type all responses** - Use TypeScript interfaces
4. **Use hooks for data fetching** - Leverage TanStack Query
5. **Subscribe carefully** - Clean up WebSocket subscriptions
6. **Validate inputs** - Use Zod schemas before API calls
