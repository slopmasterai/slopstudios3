# ADR 0006: Agent Orchestration System

## Status
Accepted

## Date
2026-01-11

## Context

Slop Studios 3 has established Claude CLI integration (Phase 12) and Strudel live coding integration (Phase 13). The next step is to provide a unified orchestration layer that can coordinate multiple AI agents, manage complex workflows, and handle prompt template management.

Key requirements:
- Coordinate multiple agent types (Claude, Strudel, custom agents)
- Support complex multi-step workflows with dependencies
- Enable parallel and sequential execution patterns
- Provide prompt template management with versioning
- Maintain observability through metrics collection
- Support real-time progress updates via WebSocket

## Decision

We implement a comprehensive Agent Orchestration System consisting of:

### 1. Core Services

**Prompt Template Service**
- Template CRUD with Redis storage
- Variable interpolation using `{{variableName}}` syntax
- Version history and rollback capability
- Tag-based organization

**Agent Registry Service**
- Register/unregister agents dynamically
- Built-in agents for Claude and Strudel
- Custom agent support with executor functions
- Health monitoring and auto-recovery

**Workflow Context Service**
- Shared state management between workflow steps
- Nested path resolution for complex data structures
- Snapshot/restore for debugging
- TTL-based automatic cleanup

**Workflow Engine Service**
- Dependency resolution using topological sort
- Parallel execution with configurable limits
- Retry policies with exponential backoff
- Queue management for workflow requests

**Orchestration Service**
- High-level API for common patterns
- Sequential, parallel, conditional, and map-reduce patterns
- Helper functions for workflow composition

**Agent Metrics Service**
- Metrics collection for all components
- Percentile calculations (p50, p95, p99)
- Redis persistence for durability

### 2. API Layer

**REST Endpoints** (`/api/v1/agents/`)
- Templates: CRUD operations, interpolation
- Registry: Agent management and execution
- Workflows: Execution, status, control operations
- Orchestration: Pattern-based execution
- Metrics and health endpoints

**WebSocket Events** (`agent:*`)
- Real-time workflow execution and progress
- Orchestration pattern execution
- Event streaming for status updates

### 3. Architecture Patterns

```
┌──────────────────────────────────────────────────────────────┐
│                    REST API / WebSocket                       │
├──────────────────────────────────────────────────────────────┤
│                  Orchestration Service                        │
│  (Sequential, Parallel, Conditional, Map-Reduce patterns)     │
├──────────────────────────────────────────────────────────────┤
│                   Workflow Engine                             │
│  (Dependency resolution, Execution, Retry, Queue)             │
├──────────────────┬───────────────────┬───────────────────────┤
│ Prompt Template  │  Agent Registry   │  Workflow Context     │
│    Service       │     Service       │     Service           │
├──────────────────┴───────────────────┴───────────────────────┤
│                      Redis Storage                            │
├──────────────────┬───────────────────┬───────────────────────┤
│  Claude Service  │  Strudel Service  │   Custom Agents       │
└──────────────────┴───────────────────┴───────────────────────┘
```

### 4. Key Design Decisions

**Variable Interpolation**: Use `{{variableName}}` syntax with support for nested paths (`{{user.name}}`). This is intuitive and consistent with common templating languages.

**Dependency Resolution**: Topological sort ensures correct execution order. Circular dependencies are detected at validation time.

**Parallel Execution**: Configurable `maxParallelSteps` prevents resource exhaustion while maximizing throughput.

**Retry Strategy**: Exponential backoff with configurable multiplier prevents thundering herd issues while ensuring eventual success for transient failures.

**Event Emission**: EventEmitter pattern allows loose coupling between workflow engine and consumers (WebSocket handlers, metrics).

## Consequences

### Positive
- Unified interface for all agent types
- Flexible workflow composition
- Real-time visibility into execution progress
- Extensible architecture for future agent types
- Consistent error handling and metrics

### Negative
- Additional complexity in the system
- Redis dependency for state management
- Learning curve for workflow definition syntax

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Workflow timeout | Configurable timeout with graceful cancellation |
| Agent failure cascade | Isolation between agents, retry policies |
| Memory exhaustion | Queue limits, parallel execution limits |
| Redis connection loss | Graceful degradation, in-memory fallback for critical paths |

## Alternatives Considered

### 1. Use External Workflow Engine (Temporal, Airflow)
- **Pros**: Battle-tested, feature-rich
- **Cons**: Operational overhead, dependency complexity
- **Decision**: Built-in solution is simpler for our scale

### 2. Direct Agent Calls Without Orchestration
- **Pros**: Simpler implementation
- **Cons**: No workflow composition, no retry handling
- **Decision**: Orchestration layer provides significant value

### 3. GraphQL Instead of REST
- **Pros**: Flexible querying
- **Cons**: Additional tooling, overkill for this use case
- **Decision**: REST + WebSocket covers all requirements

## References
- Phase 12: Claude CLI Integration (ADR 0004)
- Phase 13: Strudel Integration (ADR 0005)
- [Topological Sort Algorithm](https://en.wikipedia.org/wiki/Topological_sorting)
