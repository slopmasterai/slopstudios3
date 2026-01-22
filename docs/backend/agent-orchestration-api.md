# Agent Orchestration API Documentation

## Overview

The Agent Orchestration API provides endpoints for managing prompt templates, registering agents, executing workflows, and orchestrating multi-agent operations.

**Base URL**: `/api/v1/agents`

## Authentication

All endpoints (except health) require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Template Endpoints

### Create Template

**POST** `/templates`

Create a new prompt template.

**Request Body**:
```json
{
  "name": "greeting-template",
  "content": "Hello {{name}}, welcome to {{place}}!",
  "variables": [
    {
      "name": "name",
      "type": "string",
      "required": true,
      "description": "User's name"
    },
    {
      "name": "place",
      "type": "string",
      "required": false,
      "defaultValue": "our platform"
    }
  ],
  "tags": ["greeting", "onboarding"]
}
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "template": {
      "id": "tpl_abc123",
      "name": "greeting-template",
      "content": "Hello {{name}}, welcome to {{place}}!",
      "variables": [...],
      "tags": ["greeting", "onboarding"],
      "version": 1,
      "createdAt": "2026-01-11T10:00:00Z",
      "updatedAt": "2026-01-11T10:00:00Z"
    }
  }
}
```

### Get Template

**GET** `/templates/:id`

Retrieve a template by ID.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "tpl_abc123",
    "name": "greeting-template",
    "content": "Hello {{name}}, welcome to {{place}}!",
    "variables": [...],
    "version": 1,
    ...
  }
}
```

### Update Template

**PUT** `/templates/:id`

Update an existing template. Creates a new version.

**Request Body**:
```json
{
  "content": "Hi {{name}}! Welcome to {{place}}!",
  "variables": [...]
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "template": {
      "id": "tpl_abc123",
      "version": 2,
      ...
    }
  }
}
```

### Delete Template

**DELETE** `/templates/:id`

Delete a template.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "message": "Template deleted successfully"
  }
}
```

### List Templates

**GET** `/templates`

List all templates with optional filtering.

**Query Parameters**:
- `tags` (string): Comma-separated tags to filter by
- `page` (number): Page number (default: 1)
- `pageSize` (number): Items per page (default: 20)

**Response** (200):
```json
{
  "success": true,
  "data": {
    "templates": [...],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

### Interpolate Template

**POST** `/templates/:id/interpolate`

Interpolate variables into a template.

**Request Body**:
```json
{
  "variables": {
    "name": "Alice",
    "place": "Slop Studios"
  }
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "interpolated": "Hello Alice, welcome to Slop Studios!",
    "templateId": "tpl_abc123",
    "templateVersion": 1
  }
}
```

---

## Agent Registry Endpoints

### Register Agent

**POST** `/registry`

Register a new agent.

**Request Body**:
```json
{
  "name": "Custom Code Agent",
  "type": "custom",
  "capabilities": [
    {
      "name": "code-generation",
      "description": "Generate code snippets",
      "inputSchema": {...},
      "outputSchema": {...}
    }
  ],
  "config": {
    "timeout": 30000
  }
}
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "agent": {
      "id": "agent_xyz789",
      "name": "Custom Code Agent",
      "type": "custom",
      "status": "available",
      "capabilities": [...],
      "registeredAt": "2026-01-11T10:00:00Z"
    }
  }
}
```

### List Agents

**GET** `/registry`

List all registered agents.

**Query Parameters**:
- `type` (string): Filter by agent type (claude, strudel, custom)
- `status` (string): Filter by status (available, busy, offline, error)
- `capability` (string): Filter by capability name

**Response** (200):
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent_claude_default",
        "name": "Claude",
        "type": "claude",
        "status": "available",
        ...
      },
      {
        "id": "agent_strudel_default",
        "name": "Strudel",
        "type": "strudel",
        "status": "available",
        ...
      }
    ]
  }
}
```

### Get Agent

**GET** `/registry/:id`

Get details of a specific agent.

### Unregister Agent

**DELETE** `/registry/:id`

Remove an agent from the registry.

### Execute Agent

**POST** `/registry/:id/execute`

Execute an agent directly.

**Request Body**:
```json
{
  "input": {
    "prompt": "Write a haiku about coding"
  },
  "options": {
    "timeout": 30000
  }
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "output": {
      "text": "Lines of logic flow\nBugs emerge from shadowed code\nDebug brings the dawn"
    },
    "durationMs": 1523,
    "agentId": "agent_claude_default"
  }
}
```

---

## Workflow Endpoints

### Execute Workflow

**POST** `/workflows`

Execute a new workflow.

**Request Body**:
```json
{
  "id": "wf_myworkflow",
  "name": "Content Generation Pipeline",
  "steps": [
    {
      "id": "step-1",
      "name": "Generate Outline",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Create an outline for: {{topic}}"
      }
    },
    {
      "id": "step-2",
      "name": "Expand Sections",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Expand this outline: {{steps.step-1.output.text}}"
      },
      "dependsOn": ["step-1"]
    },
    {
      "id": "step-3",
      "name": "Generate Audio",
      "agentId": "agent_strudel_default",
      "input": {
        "pattern": "sound(\"piano\").note(\"c e g\")"
      }
    }
  ],
  "context": {
    "topic": "The Future of AI"
  }
}
```

**Response** (202):
```json
{
  "success": true,
  "data": {
    "workflowId": "wf_myworkflow",
    "status": "running",
    "message": "Workflow execution started"
  }
}
```

### Get Workflow Status

**GET** `/workflows/:id`

Get the current status of a workflow.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "workflowId": "wf_myworkflow",
    "status": "running",
    "progress": 66,
    "completedSteps": ["step-1", "step-2"],
    "pendingSteps": ["step-3"],
    "failedSteps": [],
    "startedAt": "2026-01-11T10:00:00Z"
  }
}
```

### Cancel Workflow

**DELETE** `/workflows/:id`

Cancel a running workflow.

### Pause Workflow

**POST** `/workflows/:id/pause`

Pause a running workflow.

### Resume Workflow

**POST** `/workflows/:id/resume`

Resume a paused workflow.

### List Workflows

**GET** `/workflows`

List all workflows.

**Query Parameters**:
- `status` (string): Filter by status (pending, running, paused, completed, failed, cancelled)
- `page` (number): Page number
- `pageSize` (number): Items per page

---

## Orchestration Endpoints

### Orchestrate

**POST** `/orchestrate`

Execute steps using a specific pattern.

**Request Body**:
```json
{
  "pattern": "sequential",
  "steps": [
    { "agentId": "agent_claude_default", "input": { "prompt": "Step 1" } },
    { "agentId": "agent_claude_default", "input": { "prompt": "Step 2" } }
  ],
  "options": {
    "stopOnError": true
  }
}
```

**Available Patterns**:
- `sequential`: Execute steps one after another
- `parallel`: Execute all steps concurrently
- `conditional`: Execute based on condition evaluation
- `map-reduce`: Map over items and reduce results

### Sequential Orchestration

**POST** `/orchestrate/sequential`

Execute steps sequentially.

**Request Body**:
```json
{
  "steps": [
    { "agentId": "agent_claude_default", "input": { "prompt": "First task" } },
    { "agentId": "agent_claude_default", "input": { "prompt": "Second task using {{previousOutput}}" } }
  ],
  "options": {
    "stopOnError": true
  }
}
```

### Parallel Orchestration

**POST** `/orchestrate/parallel`

Execute steps in parallel.

**Request Body**:
```json
{
  "steps": [
    { "agentId": "agent_claude_default", "input": { "prompt": "Task A" } },
    { "agentId": "agent_claude_default", "input": { "prompt": "Task B" } },
    { "agentId": "agent_strudel_default", "input": { "pattern": "..." } }
  ],
  "options": {
    "maxConcurrent": 3
  }
}
```

---

## Metrics Endpoint

### Get Metrics

**GET** `/metrics`

Get orchestration system metrics.

**Query Parameters**:
- `periodSeconds` (number): Time period in seconds (default: 3600)
- `includeRecent` (boolean): Include recent detailed metrics

**Response** (200):
```json
{
  "success": true,
  "data": {
    "periodSeconds": 3600,
    "workflows": {
      "total": 150,
      "successful": 140,
      "failed": 10,
      "averageDurationMs": 5230,
      "p50DurationMs": 4500,
      "p95DurationMs": 12000,
      "p99DurationMs": 18000
    },
    "steps": {
      "total": 750,
      "successful": 720,
      "failed": 30,
      "averageDurationMs": 1200
    },
    "templates": {
      "totalOperations": 500,
      "cacheHits": 400,
      "cacheMisses": 100
    },
    "agents": {
      "totalExecutions": 800,
      "byType": {
        "claude": { "total": 500, "successful": 490 },
        "strudel": { "total": 200, "successful": 195 },
        "custom": { "total": 100, "successful": 98 }
      }
    }
  }
}
```

---

## Health Endpoint

### Health Check

**GET** `/health`

Check system health (no authentication required).

**Response** (200):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "agents": {
      "total": 3,
      "available": 3,
      "busy": 0,
      "offline": 0
    },
    "workflows": {
      "active": 2,
      "queued": 5
    },
    "uptime": 86400
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
```

**Common Error Codes**:
- `UNAUTHORIZED`: Missing or invalid authentication
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid request body
- `WORKFLOW_INVALID`: Invalid workflow definition
- `AGENT_UNAVAILABLE`: Agent is not available
- `TEMPLATE_ERROR`: Template interpolation failed
- `TIMEOUT_ERROR`: Operation timed out
- `RATE_LIMIT_EXCEEDED`: Too many requests

---

## WebSocket Events

Connect to the WebSocket server at `/` and emit/listen to these events:

### Client to Server

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:workflow:execute` | `{ workflow: WorkflowDefinition }` | Execute a workflow |
| `agent:workflow:status` | `{ workflowId: string }` | Get workflow status |
| `agent:workflow:cancel` | `{ workflowId: string }` | Cancel workflow |
| `agent:workflow:pause` | `{ workflowId: string }` | Pause workflow |
| `agent:workflow:resume` | `{ workflowId: string }` | Resume workflow |
| `agent:orchestrate` | `{ pattern, steps, options }` | Orchestrate steps |

### Server to Client

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:workflow:started` | `{ workflowId, name, timestamp }` | Workflow started |
| `agent:workflow:step:started` | `{ workflowId, stepId, stepName }` | Step started |
| `agent:workflow:step:completed` | `{ workflowId, stepId, output }` | Step completed |
| `agent:workflow:step:failed` | `{ workflowId, stepId, error }` | Step failed |
| `agent:workflow:completed` | `{ workflowId, results }` | Workflow completed |
| `agent:workflow:failed` | `{ workflowId, error }` | Workflow failed |
| `agent:workflow:cancelled` | `{ workflowId }` | Workflow cancelled |
| `agent:workflow:paused` | `{ workflowId }` | Workflow paused |
| `agent:workflow:resumed` | `{ workflowId }` | Workflow resumed |
