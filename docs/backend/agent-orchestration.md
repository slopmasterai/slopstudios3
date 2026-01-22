# Agent Orchestration Architecture

This document describes the architecture of the Agent Orchestration System implemented in Phase 14.

## Overview

The Agent Orchestration System provides a unified layer for coordinating multiple AI agents (Claude, Strudel, and custom agents), managing prompt templates, and executing complex multi-step workflows with dependency resolution.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend / CLI Clients                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              ┌─────▼─────┐       ┌─────▼─────┐
              │  REST API │       │ WebSocket │
              │  Routes   │       │  Handlers │
              └─────┬─────┘       └─────┬─────┘
                    │                   │
                    └─────────┬─────────┘
                              │
              ┌───────────────▼───────────────┐
              │      Orchestration Service     │
              │  (Sequential, Parallel, etc.)  │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │       Workflow Engine          │
              │  (Dependencies, Execution)     │
              └───────────────┬───────────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     │                        │                        │
┌────▼─────┐           ┌──────▼──────┐          ┌──────▼──────┐
│ Prompt   │           │   Agent     │          │  Workflow   │
│ Template │           │  Registry   │          │   Context   │
│ Service  │           │   Service   │          │   Service   │
└────┬─────┘           └──────┬──────┘          └──────┬──────┘
     │                        │                        │
     └────────────────────────┼────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Redis Storage   │
                    └─────────┬─────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     │                        │                        │
┌────▼─────┐           ┌──────▼──────┐          ┌──────▼──────┐
│  Claude  │           │   Strudel   │          │   Custom    │
│  Service │           │   Service   │          │   Agents    │
└──────────┘           └─────────────┘          └─────────────┘
```

## Core Components

### 1. Prompt Template Service

**File**: `src/services/prompt-template.service.ts`

Manages reusable prompt templates with variable interpolation.

**Key Features**:
- CRUD operations with Redis storage
- Variable interpolation using `{{variableName}}` syntax
- Support for nested paths (`{{user.name}}`)
- Version history with rollback capability
- Tag-based organization and filtering

**Example**:
```typescript
import { createTemplate, interpolateTemplate } from './services/prompt-template.service.js';

const { template } = await createTemplate({
  name: 'greeting',
  content: 'Hello {{user.name}}, welcome to {{place}}!',
  variables: [
    { name: 'user.name', type: 'string', required: true },
    { name: 'place', type: 'string', defaultValue: 'our platform' }
  ],
  tags: ['greeting', 'onboarding']
});

const { interpolated } = interpolateTemplate(template, {
  user: { name: 'Alice' }
});
// => "Hello Alice, welcome to our platform!"
```

### 2. Agent Registry Service

**File**: `src/services/agent-registry.service.ts`

Manages the registry of available agents and their capabilities.

**Key Features**:
- Dynamic agent registration/unregistration
- Built-in Claude and Strudel agents
- Custom agent support with executor functions
- Health monitoring with configurable intervals
- Status management (available, busy, offline, error)

**Built-in Agents**:
| Agent ID | Type | Description |
|----------|------|-------------|
| `agent_claude_default` | claude | Default Claude AI agent |
| `agent_strudel_default` | strudel | Default Strudel music agent |

**Custom Agent Registration**:
```typescript
import { registerAgent } from './services/agent-registry.service.js';

await registerAgent({
  name: 'Custom Analyzer',
  type: 'custom',
  capabilities: [
    {
      name: 'analyze',
      description: 'Analyze data patterns',
      inputSchema: { type: 'object', properties: { data: { type: 'array' } } },
      outputSchema: { type: 'object', properties: { result: { type: 'string' } } }
    }
  ],
  executor: async (input) => {
    // Custom execution logic
    return { result: 'Analysis complete' };
  }
});
```

### 3. Workflow Context Service

**File**: `src/services/workflow-context.service.ts`

Manages shared state between workflow steps.

**Key Features**:
- Shared state management between steps
- Nested path resolution and setting
- Snapshot/restore for debugging
- TTL-based automatic cleanup
- Step result storage

**Example**:
```typescript
import { createContext, setContextValue, getContextValue } from './services/workflow-context.service.js';

const ctx = await createContext('workflow-123', { initialData: 'value' });
await setContextValue(ctx.id, 'user.preferences.theme', 'dark');
const theme = await getContextValue(ctx.id, 'user.preferences.theme');
// => 'dark'
```

### 4. Workflow Engine Service

**File**: `src/services/workflow-engine.service.ts`

Core engine that executes workflows with dependency resolution.

**Key Features**:
- Dependency resolution using topological sort
- Parallel step execution with configurable limits
- Retry policies with exponential backoff
- Queue management for workflow requests
- Event emission for real-time updates

**Dependency Resolution**:
Steps are executed in the correct order based on their `dependsOn` declarations. Independent steps can run in parallel up to the configured limit.

```
Example workflow graph:
    A
   / \
  B   C
   \ /
    D

Execution order:
1. A executes first (no dependencies)
2. B and C execute in parallel (both depend only on A)
3. D executes last (depends on B and C)
```

**Retry Policies**:
```typescript
{
  retryPolicy: {
    maxRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['TIMEOUT', 'RATE_LIMIT']
  }
}
```

### 5. Orchestration Service

**File**: `src/services/orchestration.service.ts`

High-level API for common execution patterns.

**Available Patterns**:

| Pattern | Description | Use Case |
|---------|-------------|----------|
| Sequential | Steps execute one after another | Pipelines where each step depends on previous |
| Parallel | All steps execute concurrently | Independent tasks that can run simultaneously |
| Conditional | Execute based on runtime conditions | Branching logic based on context |
| Map-Reduce | Process items and aggregate results | Batch processing with aggregation |

**Sequential Example**:
```typescript
import { orchestrateSequential } from './services/orchestration.service.js';

const result = await orchestrateSequential([
  { agentId: 'agent_claude_default', input: { prompt: 'Generate outline' } },
  { agentId: 'agent_claude_default', input: { prompt: 'Expand: {{previousOutput.text}}' } },
  { agentId: 'agent_claude_default', input: { prompt: 'Polish: {{previousOutput.text}}' } }
], { userId: 'user-1' });
```

**Parallel Example**:
```typescript
import { orchestrateParallel } from './services/orchestration.service.js';

const result = await orchestrateParallel([
  { agentId: 'agent_claude_default', input: { prompt: 'Generate headline' } },
  { agentId: 'agent_claude_default', input: { prompt: 'Generate intro' } },
  { agentId: 'agent_strudel_default', input: { pattern: 'sound("piano")' } }
], { userId: 'user-1' }, { maxConcurrent: 3 });
```

### 6. Agent Metrics Service

**File**: `src/services/agent-metrics.service.ts`

Collects and reports metrics for all orchestration components.

**Metrics Collected**:
- Workflow execution counts and durations
- Step success/failure rates
- Template usage and cache hit rates
- Agent execution statistics by type
- Percentile calculations (p50, p95, p99)

## Data Flow

### Workflow Execution Flow

```
1. Client submits workflow definition
         │
         ▼
2. Validation & dependency graph construction
         │
         ▼
3. Context initialization with input variables
         │
         ▼
4. Topological sort determines execution order
         │
         ▼
5. For each execution level:
   ├── Resolve step inputs (interpolate variables)
   ├── Execute steps in parallel (up to limit)
   ├── Store results in context
   └── Emit progress events
         │
         ▼
6. Aggregate final results
         │
         ▼
7. Return results to client
```

### Variable Interpolation Flow

```
Template: "Summarize: {{steps.research.output.text}}"
                           │
                           ▼
              Parse variable path
                           │
                           ▼
         Resolve from workflow context
                           │
                           ▼
    Replace placeholder with value
                           │
                           ▼
         "Summarize: [actual content]"
```

## Redis Storage Schema

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `prompt:template:{id}` | Template storage | None |
| `prompt:template:version:{id}` | Version history (sorted set) | None |
| `agent:registry` | Agent hash map | None |
| `workflow:context:{id}` | Workflow context | Configurable |
| `workflow:context:snapshot:{id}` | Context snapshots | 1 hour |
| `workflow:state:{id}` | Workflow state | Configurable |
| `workflow:queue` | Pending workflows | None |
| `agent:metrics:*` | Metrics data | 24 hours |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AGENT_MAX_CONCURRENT_WORKFLOWS` | 10 | Max concurrent workflows |
| `AGENT_WORKFLOW_TIMEOUT_MS` | 600000 | Workflow timeout (10 min) |
| `AGENT_ENABLE_QUEUE` | true | Enable workflow queue |
| `AGENT_MAX_QUEUE_SIZE` | 100 | Max queued workflows |
| `AGENT_MAX_WORKFLOW_STEPS` | 50 | Max steps per workflow |
| `AGENT_CONTEXT_TTL_SECONDS` | 3600 | Context TTL (1 hour) |
| `AGENT_TEMPLATE_CACHE_TTL` | 300 | Template cache TTL (5 min) |
| `AGENT_ENABLE_PARALLEL_EXECUTION` | true | Enable parallel execution |
| `AGENT_MAX_PARALLEL_STEPS` | 5 | Max parallel steps |

## Security Considerations

1. **Template Content**: Stored as-is; validate for injection risks at creation time
2. **Custom Agents**: Execute in the same process; only register trusted executors
3. **Workflow Context**: Accessible by all steps; no step-level isolation
4. **Rate Limiting**: Applied at route level to prevent abuse
5. **Timeouts**: Configurable to prevent resource exhaustion

## Error Handling

### Error Types

| Error Code | Description | Recovery |
|------------|-------------|----------|
| `WORKFLOW_INVALID` | Invalid workflow definition | Fix workflow structure |
| `AGENT_UNAVAILABLE` | Agent not available | Retry or use fallback |
| `TEMPLATE_ERROR` | Template interpolation failed | Check variable values |
| `DEPENDENCY_CYCLE` | Circular dependency detected | Fix step dependencies |
| `TIMEOUT_ERROR` | Operation timed out | Increase timeout or optimize |
| `STEP_FAILED` | Step execution failed | Check retry policy |

### Retry Strategy

The system uses exponential backoff for retries:

```
Attempt 1: Immediate
Attempt 2: Wait retryDelayMs
Attempt 3: Wait retryDelayMs * backoffMultiplier
Attempt 4: Wait retryDelayMs * backoffMultiplier^2
...
```

## Related Documentation

- [Agent Endpoints API](../api/agent-endpoints.md) - REST API reference
- [Agent Workflow Examples](../examples/agent-workflows.md) - Usage examples
- [ADR-0006: Agent Orchestration](../adr/0006-agent-orchestration.md) - Architecture decision
- [Phase 14 Status](../phase-14-status.md) - Implementation status
