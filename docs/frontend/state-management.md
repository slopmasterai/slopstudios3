# State Management Guide

## Overview

Slop Studios 3 uses a dual-state management approach:

1. **Zustand** for client-side state (UI preferences, auth)
2. **TanStack Query** for server state (API data)

This separation provides clear boundaries and optimal performance.

## Zustand Stores

### Auth Store

Manages authentication state and user session.

```typescript
// stores/auth.store.ts
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// Usage
const { user, isAuthenticated, login, logout } = useAuthStore();
```

Features:
- Persists to localStorage
- Updates socket auth on token change
- Clears TanStack Query cache on logout

### UI Store

Manages UI preferences and notifications.

```typescript
// stores/ui.store.ts
interface UIState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: Notification[];
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  addNotification: (notification: Notification) => void;
  clearNotifications: () => void;
}

// Usage
const { theme, setTheme, sidebarOpen, toggleSidebar } = useUIStore();
```

Features:
- Persists theme and sidebar state
- Listens to system theme changes
- Manages notification queue

### Socket Store

Manages WebSocket connection state.

```typescript
// stores/socket.store.ts
interface SocketState {
  connected: boolean;
  error: string | null;
  reconnecting: boolean;
  reconnectAttempt: number;
}

interface SocketActions {
  connect: () => void;
  disconnect: () => void;
}

// Usage
const { connected, error, connect } = useSocketStore();
```

Features:
- Manages connection lifecycle
- Tracks reconnection attempts
- Provides connection status

## TanStack Query

### Configuration

```typescript
// main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

### Query Key Patterns

```typescript
// Hierarchical key structure
['claude', 'processes']           // List all processes
['claude', 'process', processId]  // Single process
['claude', 'metrics']             // Metrics data
['claude', 'health']              // Health check

['agents', 'registry']            // List agents
['agents', 'workflows']           // List workflows
['agents', 'workflow', workflowId] // Single workflow

['templates']                     // List templates
['templates', templateId]         // Single template
```

### Custom Hooks

Each feature domain has a custom hook combining queries and mutations:

```typescript
// hooks/useClaude.ts
export function useClaude() {
  const queryClient = useQueryClient();

  // Queries
  const processesQuery = useQuery({
    queryKey: ['claude', 'processes'],
    queryFn: () => claudeService.listProcesses({ limit: 20 }),
    refetchInterval: 5000,
  });

  // Mutations
  const executeAsyncMutation = useMutation({
    mutationFn: ({ command, options }) =>
      claudeService.executeAsync(command, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude', 'processes'] });
    },
  });

  return {
    // Query data
    processes: processesQuery.data?.data ?? [],
    isProcessesLoading: processesQuery.isLoading,

    // Mutation actions
    executeAsync: executeAsyncMutation.mutate,
    isExecuting: executeAsyncMutation.isPending,

    // Refetch
    refetchProcesses: processesQuery.refetch,
  };
}
```

### Polling and Real-Time Updates

For active processes, combine polling with WebSocket updates:

```typescript
// Query with conditional polling
const processQuery = useQuery({
  queryKey: ['claude', 'process', processId],
  queryFn: () => claudeService.getProcessStatus(processId),
  refetchInterval: (query) => {
    const status = query.state.data?.status;
    if (status === 'completed' || status === 'failed') {
      return false; // Stop polling
    }
    return 2000; // Poll every 2 seconds
  },
});

// WebSocket for real-time output
const { output, isStreaming } = useClaudeStream(processId);
```

### Cache Invalidation

```typescript
// On mutation success
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['claude', 'processes'] });
  queryClient.invalidateQueries({ queryKey: ['claude', 'metrics'] });
};

// Manual invalidation
queryClient.invalidateQueries({ queryKey: ['templates'] });

// Set cache directly
queryClient.setQueryData(['auth', 'me'], updatedUser);
```

## WebSocket Integration

### Connection Management

```typescript
// hooks/useSocket.ts
export function useSocket() {
  const { connected, connect } = useSocketStore();

  useEffect(() => {
    connect();
  }, [connect]);

  return { connected };
}
```

### Event Subscriptions

```typescript
// hooks/useSocket.ts
export function useSocketEvent<T>(
  event: string,
  callback: (data: T) => void,
  deps: unknown[] = []
) {
  useEffect(() => {
    const unsubscribe = subscribeToEvent(event, callback);
    return unsubscribe;
  }, [event, ...deps]);
}

// Usage
useSocketEvent<ClaudeProgressData>('claude:progress', (data) => {
  if (data.processId === currentProcessId) {
    setOutput(prev => prev + data.output);
  }
}, [currentProcessId]);
```

### Streaming Hooks

Pre-built hooks for common streaming patterns:

```typescript
// Claude output streaming
const { output, status, isStreaming } = useClaudeStream(processId);

// Strudel render progress
const { progress, stage, audioUrl, isRendering } = useStrudelStream(processId);

// Workflow progress
const { steps, currentStep, isRunning } = useWorkflowStream(workflowId);
```

## State Flow Patterns

### Authentication Flow

```
1. User submits login form
2. useAuth.login() called
3. authService.login() makes API call
4. On success:
   - useAuthStore.login() updates store
   - Token saved to localStorage
   - Socket auth updated
   - TanStack Query cache set
   - Navigate to dashboard
5. On error:
   - useAuthStore.setError() updates store
   - Error displayed in form
```

### Real-Time Process Flow

```
1. User submits command
2. executeAsync mutation called
3. API returns processId
4. useClaudeStream(processId) subscribes to events
5. Socket events update local state
6. UI updates in real-time
7. On complete: query cache invalidated
```

### Optimistic Updates

```typescript
const mutation = useMutation({
  mutationFn: updateTemplate,
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['templates', id] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['templates', id]);

    // Optimistically update
    queryClient.setQueryData(['templates', id], newData);

    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(['templates', id], context?.previous);
  },
  onSettled: () => {
    // Refetch after settlement
    queryClient.invalidateQueries({ queryKey: ['templates', id] });
  },
});
```

## Best Practices

1. **Keep stores focused** - One responsibility per store
2. **Use TanStack Query for server data** - Don't duplicate in Zustand
3. **Invalidate strategically** - Only affected queries
4. **Handle loading states** - Always show feedback
5. **Persist wisely** - Only essential data to localStorage
6. **Clean up subscriptions** - Use effect cleanup functions
