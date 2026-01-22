# Agent Orchestration Guide

This guide explains how to use the agent orchestration system in Slop Studios 3 to create complex multi-agent workflows.

## Overview

The agent orchestration system enables:

- **Sequential Execution**: Run agents one after another
- **Parallel Execution**: Run multiple agents simultaneously
- **Conditional Execution**: Execute agents based on conditions
- **Map-Reduce**: Process collections with parallel agents
- **Workflows**: Define complex multi-step processes

## Orchestration Patterns

### Sequential Pattern

Execute agents in sequence, passing output from one to the next:

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate/sequential \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "sequential",
    "tasks": [
      {
        "id": "research",
        "agentType": "claude",
        "prompt": "Research the topic: {{topic}}"
      },
      {
        "id": "outline",
        "agentType": "claude",
        "prompt": "Create an outline based on: {{research.output}}"
      },
      {
        "id": "draft",
        "agentType": "claude",
        "prompt": "Write content based on: {{outline.output}}"
      }
    ],
    "context": {
      "topic": "renewable energy"
    }
  }'
```

### Parallel Pattern

Execute multiple agents simultaneously:

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate/parallel \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "parallel",
    "tasks": [
      {
        "id": "summary",
        "agentType": "claude",
        "prompt": "Summarize this text: {{text}}"
      },
      {
        "id": "sentiment",
        "agentType": "claude",
        "prompt": "Analyze sentiment of: {{text}}"
      },
      {
        "id": "keywords",
        "agentType": "claude",
        "prompt": "Extract keywords from: {{text}}"
      }
    ],
    "context": {
      "text": "Your text here..."
    }
  }'
```

### Conditional Pattern

Execute agents based on conditions:

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "conditional",
    "tasks": [
      {
        "id": "classify",
        "agentType": "claude",
        "prompt": "Classify this content type: {{content}}"
      },
      {
        "id": "process_article",
        "agentType": "claude",
        "prompt": "Summarize article: {{content}}",
        "condition": "classify.output.includes(\"article\")"
      },
      {
        "id": "process_code",
        "agentType": "claude",
        "prompt": "Review code: {{content}}",
        "condition": "classify.output.includes(\"code\")"
      }
    ],
    "context": {
      "content": "..."
    }
  }'
```

### Map-Reduce Pattern

Process collections in parallel and aggregate results:

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "map-reduce",
    "tasks": [
      {
        "id": "process",
        "agentType": "claude",
        "prompt": "Analyze: {{item}}",
        "input": ["item1", "item2", "item3"]
      }
    ],
    "options": {
      "reducePrompt": "Combine these analyses: {{results}}"
    }
  }'
```

## Workflows

Workflows define complex multi-step processes with dependencies.

### Create a Workflow

```bash
curl -X POST http://localhost:3000/api/v1/agents/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "id": "content-pipeline",
      "name": "Content Generation Pipeline",
      "description": "Generates and refines content",
      "steps": [
        {
          "id": "research",
          "name": "Research",
          "agentType": "claude",
          "prompt": "Research {{topic}}",
          "inputs": [
            {"variable": "topic", "source": "context", "value": "topic"}
          ],
          "outputs": [
            {"field": "output", "contextPath": "research_results"}
          ],
          "dependencies": []
        },
        {
          "id": "draft",
          "name": "Draft",
          "agentType": "claude",
          "prompt": "Write about: {{research_results}}",
          "inputs": [
            {"variable": "research_results", "source": "context", "value": "research_results"}
          ],
          "outputs": [
            {"field": "output", "contextPath": "draft"}
          ],
          "dependencies": ["research"]
        },
        {
          "id": "edit",
          "name": "Edit",
          "agentType": "claude",
          "prompt": "Edit and improve: {{draft}}",
          "inputs": [
            {"variable": "draft", "source": "context", "value": "draft"}
          ],
          "outputs": [
            {"field": "output", "contextPath": "final_content"}
          ],
          "dependencies": ["draft"]
        }
      ],
      "metadata": {
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z",
        "version": 1
      }
    },
    "context": {
      "topic": "sustainable living"
    }
  }'
```

### Workflow Control

#### Get Workflow Status

```bash
curl http://localhost:3000/api/v1/agents/workflows/wf_xxx \
  -H "Authorization: Bearer $TOKEN"
```

#### Pause Workflow

```bash
curl -X POST http://localhost:3000/api/v1/agents/workflows/wf_xxx/pause \
  -H "Authorization: Bearer $TOKEN"
```

#### Resume Workflow

```bash
curl -X POST http://localhost:3000/api/v1/agents/workflows/wf_xxx/resume \
  -H "Authorization: Bearer $TOKEN"
```

#### Cancel Workflow

```bash
curl -X DELETE http://localhost:3000/api/v1/agents/workflows/wf_xxx \
  -H "Authorization: Bearer $TOKEN"
```

### List Workflows

```bash
curl "http://localhost:3000/api/v1/agents/workflows?status=running&page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"
```

## Agent Registry

### List Available Agents

```bash
curl http://localhost:3000/api/v1/agents/registry \
  -H "Authorization: Bearer $TOKEN"
```

Built-in agents:
- `claude_default`: Default Claude agent
- `strudel_default`: Default Strudel agent

### Register Custom Agent

```bash
curl -X POST http://localhost:3000/api/v1/agents/registry \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom",
    "name": "My Custom Agent",
    "description": "Specialized agent for specific tasks",
    "capabilities": [
      {
        "name": "text_analysis",
        "description": "Analyzes text for specific patterns"
      }
    ],
    "config": {
      "model": "claude-3-sonnet"
    }
  }'
```

### Execute Agent Directly

```bash
curl -X POST http://localhost:3000/api/v1/agents/registry/agent_xxx/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Perform your specialized task",
    "context": {},
    "timeoutMs": 30000
  }'
```

## Prompt Templates

### Create Template

```bash
curl -X POST http://localhost:3000/api/v1/agents/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Code Reviewer",
    "description": "Reviews code for best practices",
    "content": "Review this {{language}} code:\n\n```{{language}}\n{{code}}\n```\n\nFocus on: {{focus_areas}}",
    "variables": [
      {"name": "language", "type": "string", "required": true},
      {"name": "code", "type": "string", "required": true},
      {"name": "focus_areas", "type": "array", "required": false, "default": ["security", "performance"]}
    ],
    "category": "workflow",
    "tags": ["code", "review"]
  }'
```

### Use Template in Orchestration

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "sequential",
    "tasks": [
      {
        "id": "review",
        "agentType": "claude",
        "promptTemplateId": "tpl_xxx",
        "variables": {
          "language": "typescript",
          "code": "function add(a, b) { return a + b }",
          "focus_areas": ["type safety", "error handling"]
        }
      }
    ]
  }'
```

## Real-time Updates

### WebSocket Connection

```javascript
const socket = io('http://localhost:3000/agent', {
  auth: { token: 'your-jwt-token' }
});

// Subscribe to workflow updates
socket.emit('subscribe:workflow', { workflowId: 'wf_xxx' });

// Receive progress updates
socket.on('workflow:progress', (data) => {
  console.log(`Step ${data.stepId}: ${data.status}`);
  console.log(`Overall progress: ${data.progress}%`);
});

// Receive step completion
socket.on('workflow:step:complete', (data) => {
  console.log(`Step ${data.stepId} completed:`, data.output);
});

// Receive workflow completion
socket.on('workflow:complete', (data) => {
  console.log('Workflow complete:', data.results);
});
```

## Configuration

### Environment Variables

```env
# Workflow Settings
AGENT_MAX_CONCURRENT_WORKFLOWS=10
AGENT_WORKFLOW_TIMEOUT_MS=600000
AGENT_ENABLE_QUEUE=true
AGENT_MAX_QUEUE_SIZE=100
AGENT_MAX_WORKFLOW_STEPS=50
AGENT_CONTEXT_TTL_SECONDS=3600

# Parallel Execution
AGENT_ENABLE_PARALLEL_EXECUTION=true
AGENT_MAX_PARALLEL_STEPS=5

# Template Cache
AGENT_TEMPLATE_CACHE_TTL=300
```

## Error Handling

### Common Errors

| Code | Description | Solution |
|------|-------------|----------|
| `WORKFLOW_NOT_FOUND` | Workflow doesn't exist | Check workflow ID |
| `WORKFLOW_TIMEOUT` | Execution exceeded timeout | Increase timeout or simplify |
| `STEP_FAILED` | A step failed to execute | Check step logs |
| `DEPENDENCY_FAILED` | Dependent step failed | Fix the upstream step |
| `AGENT_NOT_FOUND` | Agent doesn't exist | Register the agent first |

### Retry Policies

Configure retry behavior for workflow steps:

```json
{
  "retryPolicy": {
    "maxRetries": 3,
    "initialDelayMs": 1000,
    "backoffMultiplier": 2,
    "maxDelayMs": 30000
  }
}
```

### Continue on Error

Allow workflows to continue despite step failures:

```json
{
  "steps": [
    {
      "id": "optional_step",
      "continueOnError": true,
      ...
    }
  ]
}
```

## Metrics

### Get Orchestration Metrics

```bash
curl http://localhost:3000/api/v1/agents/orchestrate/metrics \
  -H "Authorization: Bearer $TOKEN"
```

Response:

```json
{
  "success": true,
  "data": {
    "total": 150,
    "byPattern": {
      "sequential": 80,
      "parallel": 50,
      "conditional": 20
    },
    "byStatus": {
      "completed": 140,
      "failed": 10
    },
    "avgDurationMs": 5000,
    "successRate": 0.93
  }
}
```

## Best Practices

### 1. Design for Failure

Always include error handling and retry policies:

```json
{
  "retryPolicy": {
    "maxRetries": 3,
    "initialDelayMs": 1000,
    "backoffMultiplier": 2
  },
  "continueOnError": false
}
```

### 2. Use Appropriate Timeouts

Set timeouts at workflow and step levels:

```json
{
  "timeoutMs": 300000,
  "steps": [
    {
      "timeoutMs": 60000
    }
  ]
}
```

### 3. Leverage Parallel Execution

Identify independent steps and run them in parallel:

```json
{
  "steps": [
    {"id": "A", "dependencies": []},
    {"id": "B", "dependencies": []},
    {"id": "C", "dependencies": ["A", "B"]}
  ]
}
```

### 4. Use Templates for Consistency

Create templates for common patterns and reuse them.

### 5. Monitor and Optimize

Track metrics and optimize slow workflows.

## Related Documentation

- [Claude Integration Guide](./claude-integration.md)
- [Agent Collaboration Guide](./agent-collaboration.md)
- [WebSocket Integration Guide](./websocket-integration.md)
