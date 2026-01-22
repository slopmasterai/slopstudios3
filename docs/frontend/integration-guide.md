# Frontend Integration Guide

This guide covers integrating frontend applications with the Slop Studios 3 backend.

## Overview

The Slop Studios 3 API provides:

- REST API for CRUD operations
- WebSocket for real-time updates
- JWT authentication
- Comprehensive error handling

## Getting Started

### API Base URL

```
Development: http://localhost:3000
Production: https://api.slopstudios.com
```

### Authentication Flow

1. **Register** or **Login** to get a JWT token
2. Include token in all authenticated requests
3. Refresh token before expiry

```typescript
// Login
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { data } = await response.json();
const token = data.token;

// Use in requests
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

## API Client Setup

### Axios Configuration

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.API_URL || 'http://localhost:3000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Try to refresh token
      try {
        const refreshResponse = await axios.post(
          '/api/v1/auth/refresh',
          {},
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }}
        );
        localStorage.setItem('token', refreshResponse.data.data.token);
        return api.request(error.config);
      } catch {
        // Redirect to login
        window.location.href = '/login';
      }
    }
    throw error;
  }
);

export default api;
```

### Fetch Wrapper

```typescript
class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined
    });

    const result = await response.json();

    if (!result.success) {
      throw new ApiError(result.error);
    }

    return result.data;
  }

  get<T>(path: string): Promise<T> {
    return this.request('GET', path);
  }

  post<T>(path: string, data: unknown): Promise<T> {
    return this.request('POST', path, data);
  }

  put<T>(path: string, data: unknown): Promise<T> {
    return this.request('PUT', path, data);
  }

  delete<T>(path: string): Promise<T> {
    return this.request('DELETE', path);
  }
}

class ApiError extends Error {
  code: string;
  category?: string;
  details?: Record<string, unknown>;

  constructor(error: { code: string; message: string; category?: string; details?: Record<string, unknown> }) {
    super(error.message);
    this.code = error.code;
    this.category = error.category;
    this.details = error.details;
  }
}

export const api = new ApiClient(process.env.API_URL || 'http://localhost:3000');
```

## React Hooks

### useAuth Hook

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchUser(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchUser(token: string) {
    try {
      const response = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setUser(result.data);
      }
    } catch (error) {
      localStorage.removeItem('token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error.message);
    }

    localStorage.setItem('token', result.data.token);
    setToken(result.data.token);
    setUser(result.data.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### useApi Hook

```typescript
import { useState, useCallback } from 'react';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>() {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null
  });

  const execute = useCallback(async (promise: Promise<T>) => {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await promise;
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState({ data: null, loading: false, error: message });
      throw error;
    }
  }, []);

  return { ...state, execute };
}

// Usage
function MyComponent() {
  const { data, loading, error, execute } = useApi<WorkflowState>();

  const startWorkflow = async () => {
    await execute(api.post('/api/v1/agents/workflows', { workflow: {...} }));
  };

  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;
  return <div>{JSON.stringify(data)}</div>;
}
```

### useWebSocket Hook

```typescript
import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

interface UseWebSocketOptions {
  namespace?: string;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { namespace = '/', autoConnect = true } = options;
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!autoConnect || !token) return;

    const socket = io(`${process.env.API_URL}${namespace}`, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.close();
    };
  }, [namespace, token, autoConnect]);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  return { socket: socketRef.current, connected, emit, on };
}
```

### useWorkflowProgress Hook

```typescript
import { useState, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';

interface WorkflowProgress {
  workflowId: string;
  status: string;
  progress: number;
  currentStep?: string;
  error?: string;
}

export function useWorkflowProgress(workflowId: string) {
  const { emit, on, connected } = useWebSocket({ namespace: '/agent' });
  const [state, setState] = useState<WorkflowProgress>({
    workflowId,
    status: 'pending',
    progress: 0
  });

  useEffect(() => {
    if (!connected) return;

    emit('subscribe:workflow', { workflowId });

    const unsubProgress = on('workflow:progress', (data: any) => {
      if (data.workflowId === workflowId) {
        setState(prev => ({ ...prev, progress: data.progress }));
      }
    });

    const unsubStep = on('workflow:step:complete', (data: any) => {
      if (data.workflowId === workflowId) {
        setState(prev => ({ ...prev, currentStep: data.stepId }));
      }
    });

    const unsubComplete = on('workflow:complete', (data: any) => {
      if (data.workflowId === workflowId) {
        setState(prev => ({ ...prev, status: 'completed', progress: 100 }));
      }
    });

    const unsubFailed = on('workflow:failed', (data: any) => {
      if (data.workflowId === workflowId) {
        setState(prev => ({ ...prev, status: 'failed', error: data.error }));
      }
    });

    return () => {
      emit('unsubscribe:workflow', { workflowId });
      unsubProgress();
      unsubStep();
      unsubComplete();
      unsubFailed();
    };
  }, [workflowId, connected, emit, on]);

  return state;
}
```

## Error Handling

### Error Display Component

```tsx
interface ErrorDisplayProps {
  error: {
    code: string;
    message: string;
    category?: string;
    details?: {
      fields?: Record<string, string>;
    };
  };
  onRetry?: () => void;
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const isRetryable = ['timeout', 'external'].includes(error.category || '');

  return (
    <div className="error-container">
      <h3>{getErrorTitle(error.code)}</h3>
      <p>{error.message}</p>

      {error.details?.fields && (
        <ul className="field-errors">
          {Object.entries(error.details.fields).map(([field, message]) => (
            <li key={field}><strong>{field}:</strong> {message}</li>
          ))}
        </ul>
      )}

      {isRetryable && onRetry && (
        <button onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}

function getErrorTitle(code: string): string {
  const titles: Record<string, string> = {
    VALIDATION_ERROR: 'Invalid Input',
    UNAUTHORIZED: 'Authentication Required',
    FORBIDDEN: 'Access Denied',
    NOT_FOUND: 'Not Found',
    RATE_LIMIT_EXCEEDED: 'Too Many Requests',
    INTERNAL_ERROR: 'Server Error'
  };
  return titles[code] || 'Error';
}
```

## State Management

### Zustand Store Example

```typescript
import { create } from 'zustand';

interface Workflow {
  id: string;
  status: string;
  progress: number;
}

interface WorkflowStore {
  workflows: Map<string, Workflow>;
  addWorkflow: (workflow: Workflow) => void;
  updateProgress: (id: string, progress: number) => void;
  setStatus: (id: string, status: string) => void;
  removeWorkflow: (id: string) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: new Map(),

  addWorkflow: (workflow) =>
    set((state) => ({
      workflows: new Map(state.workflows).set(workflow.id, workflow)
    })),

  updateProgress: (id, progress) =>
    set((state) => {
      const workflows = new Map(state.workflows);
      const workflow = workflows.get(id);
      if (workflow) {
        workflows.set(id, { ...workflow, progress });
      }
      return { workflows };
    }),

  setStatus: (id, status) =>
    set((state) => {
      const workflows = new Map(state.workflows);
      const workflow = workflows.get(id);
      if (workflow) {
        workflows.set(id, { ...workflow, status });
      }
      return { workflows };
    }),

  removeWorkflow: (id) =>
    set((state) => {
      const workflows = new Map(state.workflows);
      workflows.delete(id);
      return { workflows };
    })
}));
```

## Best Practices

### 1. Handle Loading States

```tsx
function WorkflowList() {
  const { data, loading, error } = useWorkflows();

  if (loading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!data?.length) return <EmptyState />;

  return <List items={data} />;
}
```

### 2. Implement Optimistic Updates

```typescript
async function updateTemplate(id: string, updates: Partial<Template>) {
  // Optimistically update UI
  setTemplate(prev => ({ ...prev, ...updates }));

  try {
    await api.put(`/api/v1/agents/templates/${id}`, updates);
  } catch (error) {
    // Revert on failure
    setTemplate(originalTemplate);
    throw error;
  }
}
```

### 3. Debounce Frequent Calls

```typescript
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    api.get(`/api/v1/agents/templates?search=${query}`);
  }, 300),
  []
);
```

### 4. Cache API Responses

```typescript
import useSWR from 'swr';

function useTemplates() {
  return useSWR('/api/v1/agents/templates', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  });
}
```

### 5. Handle Token Refresh

```typescript
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const newToken = await refreshToken();
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return api.request(error.config);
    }
    throw error;
  }
);
```

## TypeScript Types

Generate types from OpenAPI spec:

```bash
npx openapi-typescript docs/api/openapi.yaml -o src/types/api.ts
```

Or define manually:

```typescript
// src/types/api.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    category?: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface Workflow {
  id: string;
  status: 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  definition: WorkflowDefinition;
  context: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
```

## Related Documentation

- [WebSocket Integration Guide](../guides/websocket-integration.md)
- [API Reference](../api/openapi.yaml)
- [Authentication Guide](../guides/getting-started.md)
