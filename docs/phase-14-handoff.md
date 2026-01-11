# Phase 14: Agent Orchestration System - Handoff Document

## Overview

Phase 14 implements a comprehensive Agent Orchestration System that coordinates
multiple AI agents (Claude, Strudel, custom), manages prompt templates, and
executes complex workflows with dependency resolution.

## What Was Built

### Core Services

1. **Prompt Template Service** (`src/services/prompt-template.service.ts`)
   - Template CRUD with Redis storage
   - Variable interpolation using `{{variableName}}` syntax
   - Support for nested paths (`{{user.name}}`)
   - Version history with rollback capability
   - Tag-based organization and filtering

2. **Agent Registry Service** (`src/services/agent-registry.service.ts`)
   - Dynamic agent registration/unregistration
   - Built-in Claude and Strudel agents
   - Custom agent support with executor functions
   - Health monitoring with configurable intervals
   - Status management (available, busy, offline, error)

3. **Workflow Context Service** (`src/services/workflow-context.service.ts`)
   - Shared state between workflow steps
   - Nested path resolution and setting
   - Snapshot/restore for debugging
   - TTL-based automatic cleanup
   - Step result storage

4. **Workflow Engine Service** (`src/services/workflow-engine.service.ts`)
   - Dependency resolution using topological sort
   - Parallel step execution with configurable limits
   - Retry policies with exponential backoff
   - Queue management for workflow requests
   - Event emission for real-time updates

5. **Orchestration Service** (`src/services/orchestration.service.ts`)
   - High-level API for common patterns
   - Sequential execution with output chaining
   - Parallel execution with concurrency limits
   - Conditional execution based on evaluators
   - Map-reduce pattern for batch processing

6. **Agent Metrics Service** (`src/services/agent-metrics.service.ts`)
   - Metrics for workflows, steps, templates, agents
   - Percentile calculations (p50, p95, p99)
   - Redis persistence for durability
   - Agent type statistics

### API Layer

1. **REST Routes** (`src/routes/agent.routes.ts`)
   - `/api/v1/agents/templates/*` - Template management
   - `/api/v1/agents/registry/*` - Agent registry
   - `/api/v1/agents/workflows/*` - Workflow operations
   - `/api/v1/agents/orchestrate/*` - Orchestration patterns
   - `/api/v1/agents/metrics` - Metrics endpoint
   - `/api/v1/agents/health` - Health check

2. **WebSocket Handlers** (`src/websocket/handlers/agent.handler.ts`)
   - `agent:workflow:execute` - Execute workflows
   - `agent:workflow:status` - Get status
   - `agent:workflow:cancel/pause/resume` - Control
   - `agent:orchestrate` - Pattern execution
   - Event forwarding for real-time updates

### Types

**New Types** (`src/types/agent.types.ts`):

- `AgentType`, `AgentStatus`, `AgentRegistration`
- `AgentCapability`, `AgentExecutor`
- `PromptTemplate`, `PromptVariable`, `CreateTemplateRequest`
- `WorkflowDefinition`, `WorkflowStep`, `WorkflowState`
- `WorkflowContext`, `StepResult`
- `OrchestrationRequest`, `OrchestrationStep`, `OrchestrationResult`
- `WorkflowMetric`, `StepMetric`, `TemplateMetric`, `AgentMetric`
- All WebSocket payload types

### Configuration

**New Environment Variables** (`.env.example`, `src/config/server.config.ts`):

```
AGENT_MAX_CONCURRENT_WORKFLOWS=10
AGENT_WORKFLOW_TIMEOUT_MS=600000
AGENT_ENABLE_QUEUE=true
AGENT_MAX_QUEUE_SIZE=100
AGENT_MAX_WORKFLOW_STEPS=50
AGENT_CONTEXT_TTL_SECONDS=3600
AGENT_TEMPLATE_CACHE_TTL=300
AGENT_ENABLE_PARALLEL_EXECUTION=true
AGENT_MAX_PARALLEL_STEPS=5
```

### Tests

**Unit Tests** (`tests/unit/`):

- `prompt-template.service.test.ts`
- `agent-registry.service.test.ts`
- `workflow-context.service.test.ts`
- `workflow-engine.service.test.ts`
- `orchestration.service.test.ts`
- `agent-metrics.service.test.ts`

**Integration Tests** (`tests/integration/`):

- `agent.test.ts` - REST API tests
- `agent-websocket.test.ts` - WebSocket tests

### Documentation

- `docs/adr/0006-agent-orchestration.md` - Architecture Decision Record
- `docs/backend/agent-orchestration.md` - Architecture overview
- `docs/backend/agent-orchestration-api.md` - API documentation (detailed)
- `docs/api/agent-endpoints.md` - REST API endpoint reference
- `docs/examples/agent-workflows.md` - Workflow examples
- `docs/phase-14-status.md` - Phase status summary
- `docs/phase-14-handoff.md` - This document

## Architecture

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

## Key Integration Points

| Component       | Integrates With  | Description                          |
| --------------- | ---------------- | ------------------------------------ |
| Agent Registry  | Claude Service   | Creates built-in Claude executor     |
| Agent Registry  | Strudel Service  | Creates built-in Strudel executor    |
| Workflow Engine | Agent Registry   | Executes agents for workflow steps   |
| Workflow Engine | Workflow Context | Manages step results and variables   |
| Orchestration   | Workflow Engine  | Uses engine for complex patterns     |
| WebSocket       | Workflow Engine  | Subscribes to workflow events        |
| Metrics         | All Services     | Collects metrics from all components |

## Redis Key Patterns

| Pattern                          | Description                  |
| -------------------------------- | ---------------------------- |
| `prompt:template:{id}`           | Template storage             |
| `prompt:template:version:{id}`   | Version history (sorted set) |
| `agent:registry`                 | Agent hash map               |
| `workflow:context:{id}`          | Workflow context             |
| `workflow:context:snapshot:{id}` | Context snapshots            |
| `workflow:state:{id}`            | Workflow state               |
| `workflow:queue`                 | Workflow queue               |
| `agent:metrics:*`                | Metrics data                 |

## Usage Examples

### Execute a Workflow

```typescript
import { executeWorkflow } from './services/workflow-engine.service.js';

const workflow = {
  id: 'content-pipeline',
  name: 'Content Generation',
  steps: [
    {
      id: 'outline',
      name: 'Generate Outline',
      agentId: 'agent_claude_default',
      input: { prompt: 'Create outline for {{topic}}' },
    },
    {
      id: 'expand',
      name: 'Expand Content',
      agentId: 'agent_claude_default',
      input: { prompt: 'Expand: {{steps.outline.output.text}}' },
      dependsOn: ['outline'],
    },
  ],
};

const result = await executeWorkflow(workflow, { topic: 'AI Ethics' });
```

### Sequential Orchestration

```typescript
import { orchestrateSequential } from './services/orchestration.service.js';

const result = await orchestrateSequential(
  [
    { agentId: 'agent_claude_default', input: { prompt: 'Summarize...' } },
    { agentId: 'agent_claude_default', input: { prompt: 'Translate...' } },
  ],
  { userId: 'user-1' }
);
```

### Template Interpolation

```typescript
import {
  createTemplate,
  interpolateTemplate,
  getTemplate,
} from './services/prompt-template.service.js';

await createTemplate({
  name: 'greeting',
  content: 'Hello {{user.name}}!',
  variables: [{ name: 'user.name', type: 'string', required: true }],
});

const template = await getTemplate('tpl_...');
const { interpolated } = interpolateTemplate(template, {
  user: { name: 'Alice' },
});
// => "Hello Alice!"
```

## Remaining Work

1. **Main Application Update**: Initialize agent services in `src/index.ts`

All documentation has been completed:

- Architecture overview: `docs/backend/agent-orchestration.md`
- API endpoint reference: `docs/api/agent-endpoints.md`
- Workflow examples: `docs/examples/agent-workflows.md`
- Phase status: `docs/phase-14-status.md`
- Implementation tracker: Updated with Phase 14 status

## Testing

Run the tests:

```bash
# Unit tests
npm test -- tests/unit/prompt-template.service.test.ts
npm test -- tests/unit/agent-registry.service.test.ts
npm test -- tests/unit/workflow-context.service.test.ts
npm test -- tests/unit/workflow-engine.service.test.ts
npm test -- tests/unit/orchestration.service.test.ts
npm test -- tests/unit/agent-metrics.service.test.ts

# Integration tests
npm test -- tests/integration/agent.test.ts
npm test -- tests/integration/agent-websocket.test.ts
```

## Bug Fixes

### Workflow Timeout Event Consistency (2026-01-11)

**Issue**: Workflow timeout emitted an unhandled event name (`workflow:failed`),
so WebSocket clients never received timeout failure notifications.

**Fix**: Changed the timeout path in `src/services/workflow-engine.service.ts`
to emit the standard `failed` event type (matching other failure paths). The
payload now includes `failedStepId: undefined` to maintain consistency with the
`AgentWorkflowFailedPayload` type expected by the WebSocket handler in
`src/websocket/handlers/agent.handler.ts`.

**Files Modified**:

- `src/services/workflow-engine.service.ts` (line 1057)

## Known Limitations

1. Custom agents must be registered programmatically (no REST API for executor
   functions)
2. Workflow history limited by Redis list trimming
3. No built-in authentication for custom agents
4. Metrics retention based on Redis TTL

## Security Considerations

1. Template content is stored as-is - validate for injection risks
2. Custom agent executors run in the same process - trust boundary
3. Workflow context accessible by step - no step-level isolation
4. Rate limiting applied at route level
