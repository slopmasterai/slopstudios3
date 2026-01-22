# Agent Workflow Examples

This document provides practical examples of using the Agent Orchestration System.

## Basic Examples

### 1. Simple Sequential Workflow

A basic workflow that generates content in two steps.

```json
{
  "id": "simple-sequential",
  "name": "Simple Sequential Workflow",
  "steps": [
    {
      "id": "generate",
      "name": "Generate Content",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Write a short story about a robot"
      }
    },
    {
      "id": "summarize",
      "name": "Summarize Content",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Summarize this story in one sentence: {{steps.generate.output.text}}"
      },
      "dependsOn": ["generate"]
    }
  ]
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/v1/agents/workflows \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "simple-sequential",
    "name": "Simple Sequential Workflow",
    "steps": [
      {
        "id": "generate",
        "name": "Generate Content",
        "agentId": "agent_claude_default",
        "input": { "prompt": "Write a short story about a robot" }
      },
      {
        "id": "summarize",
        "name": "Summarize Content",
        "agentId": "agent_claude_default",
        "input": { "prompt": "Summarize this story: {{steps.generate.output.text}}" },
        "dependsOn": ["generate"]
      }
    ]
  }'
```

### 2. Parallel Content Generation

Generate multiple pieces of content simultaneously.

```json
{
  "id": "parallel-generation",
  "name": "Parallel Content Generation",
  "steps": [
    {
      "id": "headline",
      "name": "Generate Headline",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Write a catchy headline for: {{topic}}"
      }
    },
    {
      "id": "intro",
      "name": "Generate Introduction",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Write an introduction paragraph for: {{topic}}"
      }
    },
    {
      "id": "conclusion",
      "name": "Generate Conclusion",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Write a conclusion paragraph for: {{topic}}"
      }
    }
  ],
  "context": {
    "topic": "The Future of Renewable Energy"
  }
}
```

### 3. Multi-Agent Workflow (Claude + Strudel)

Combine text generation with audio creation.

```json
{
  "id": "multi-agent",
  "name": "Content with Soundtrack",
  "steps": [
    {
      "id": "poem",
      "name": "Generate Poem",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Write a short haiku about nature"
      }
    },
    {
      "id": "mood",
      "name": "Determine Musical Mood",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Suggest a musical mood (calm, energetic, mysterious) for: {{steps.poem.output.text}}"
      },
      "dependsOn": ["poem"]
    },
    {
      "id": "soundtrack",
      "name": "Generate Soundtrack",
      "agentId": "agent_strudel_default",
      "input": {
        "pattern": "sound(\"piano\").note(\"c e g\").slow(2)"
      }
    }
  ]
}
```

## Advanced Examples

### 4. Content Pipeline with Error Handling

A production-ready content pipeline with retries.

```json
{
  "id": "content-pipeline",
  "name": "Production Content Pipeline",
  "steps": [
    {
      "id": "research",
      "name": "Research Topic",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Research key facts about {{topic}}. Provide 5 bullet points.",
        "systemPrompt": "You are a research assistant. Be factual and concise."
      },
      "retryPolicy": {
        "maxRetries": 3,
        "retryDelayMs": 2000,
        "backoffMultiplier": 2
      }
    },
    {
      "id": "outline",
      "name": "Create Outline",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Create an article outline based on: {{steps.research.output.text}}"
      },
      "dependsOn": ["research"],
      "retryPolicy": {
        "maxRetries": 2,
        "retryDelayMs": 1000
      }
    },
    {
      "id": "draft",
      "name": "Write Draft",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Write a 500-word article following this outline: {{steps.outline.output.text}}"
      },
      "dependsOn": ["outline"],
      "timeout": 60000
    },
    {
      "id": "edit",
      "name": "Edit and Polish",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Edit this article for clarity and grammar: {{steps.draft.output.text}}"
      },
      "dependsOn": ["draft"]
    }
  ],
  "context": {
    "topic": "Machine Learning in Healthcare"
  }
}
```

### 5. Diamond Dependency Pattern

Steps with complex dependencies forming a diamond pattern.

```json
{
  "id": "diamond-pattern",
  "name": "Diamond Dependency Workflow",
  "description": "A -> B, C (parallel) -> D (merge)",
  "steps": [
    {
      "id": "init",
      "name": "Initialize Data",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Generate initial data: {{seed}}"
      }
    },
    {
      "id": "branch-a",
      "name": "Process Branch A",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Transform for analysis: {{steps.init.output.text}}"
      },
      "dependsOn": ["init"]
    },
    {
      "id": "branch-b",
      "name": "Process Branch B",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Transform for visualization: {{steps.init.output.text}}"
      },
      "dependsOn": ["init"]
    },
    {
      "id": "merge",
      "name": "Merge Results",
      "agentId": "agent_claude_default",
      "input": {
        "prompt": "Combine results:\nAnalysis: {{steps.branch-a.output.text}}\nVisualization: {{steps.branch-b.output.text}}"
      },
      "dependsOn": ["branch-a", "branch-b"]
    }
  ],
  "context": {
    "seed": "User engagement data Q4 2025"
  }
}
```

## Orchestration Patterns

### Sequential Pattern

Execute steps one after another, passing results between steps.

```typescript
import { orchestrateSequential } from './services/orchestration.service.js';

const result = await orchestrateSequential([
  {
    agentId: 'agent_claude_default',
    input: { prompt: 'Generate a title' }
  },
  {
    agentId: 'agent_claude_default',
    input: { prompt: 'Write content for title: {{previousOutput.text}}' }
  },
  {
    agentId: 'agent_claude_default',
    input: { prompt: 'Edit: {{previousOutput.text}}' }
  }
], { userId: 'user-1' }, { stopOnError: true });
```

**REST API**:
```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate/sequential \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      { "agentId": "agent_claude_default", "input": { "prompt": "Generate a title" } },
      { "agentId": "agent_claude_default", "input": { "prompt": "Write content for: {{previousOutput.text}}" } }
    ],
    "options": { "stopOnError": true }
  }'
```

### Parallel Pattern

Execute independent steps simultaneously.

```typescript
import { orchestrateParallel } from './services/orchestration.service.js';

const result = await orchestrateParallel([
  { agentId: 'agent_claude_default', input: { prompt: 'Task A' } },
  { agentId: 'agent_claude_default', input: { prompt: 'Task B' } },
  { agentId: 'agent_strudel_default', input: { pattern: 'sound("bd")' } }
], { userId: 'user-1' }, { maxConcurrent: 2 });
```

**REST API**:
```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate/parallel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "steps": [
      { "agentId": "agent_claude_default", "input": { "prompt": "Task A" } },
      { "agentId": "agent_claude_default", "input": { "prompt": "Task B" } }
    ],
    "options": { "maxConcurrent": 2 }
  }'
```

### Conditional Pattern

Execute based on runtime conditions.

```typescript
import { orchestrateConditional } from './services/orchestration.service.js';

const result = await orchestrateConditional(
  // Condition evaluator
  async (context) => context.userTier === 'premium',
  // Then step
  {
    agentId: 'agent_claude_default',
    input: { prompt: 'Premium detailed analysis' }
  },
  // Else step
  {
    agentId: 'agent_claude_default',
    input: { prompt: 'Basic summary' }
  },
  { userId: 'user-1', userTier: 'premium' }
);
```

### Map-Reduce Pattern

Process multiple items and aggregate results.

```typescript
import { orchestrateMapReduce } from './services/orchestration.service.js';

const items = ['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4'];

const result = await orchestrateMapReduce(
  items,
  // Map: summarize each chapter
  (item) => ({
    agentId: 'agent_claude_default',
    input: {
      prompt: `Summarize ${item} in 2 sentences`
    }
  }),
  // Reduce: combine all summaries
  {
    agentId: 'agent_claude_default',
    input: {
      prompt: 'Combine these chapter summaries into a book overview:\n{{mapResults}}'
    }
  },
  { userId: 'user-1' }
);
```

## Template-Based Workflows

### Creating and Using Templates

```typescript
import { createTemplate, getTemplate } from './services/prompt-template.service.js';

// Create a reusable template
const { template } = await createTemplate({
  name: 'blog-post',
  content: `Write a {{style}} blog post about {{topic}}.
Target audience: {{audience}}
Tone: {{tone}}
Word count: approximately {{wordCount}} words.`,
  variables: [
    { name: 'style', type: 'string', required: true },
    { name: 'topic', type: 'string', required: true },
    { name: 'audience', type: 'string', required: false, defaultValue: 'general readers' },
    { name: 'tone', type: 'string', required: false, defaultValue: 'informative' },
    { name: 'wordCount', type: 'number', required: false, defaultValue: '500' }
  ],
  tags: ['blog', 'content']
});

// Use template in a workflow
const workflow = {
  id: 'templated-blog',
  name: 'Templated Blog Post',
  steps: [
    {
      id: 'generate',
      name: 'Generate Post',
      agentId: 'agent_claude_default',
      input: {
        templateId: template.id,
        variables: {
          style: 'technical',
          topic: 'GraphQL vs REST',
          wordCount: 800
        }
      }
    }
  ]
};
```

**REST API**:
```bash
# Create template
curl -X POST http://localhost:3000/api/v1/agents/templates \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "blog-post",
    "content": "Write a {{style}} blog post about {{topic}}.",
    "variables": [
      { "name": "style", "type": "string", "required": true },
      { "name": "topic", "type": "string", "required": true }
    ],
    "tags": ["blog"]
  }'

# Interpolate template
curl -X POST http://localhost:3000/api/v1/agents/templates/tpl_abc123/interpolate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "style": "technical",
      "topic": "GraphQL vs REST"
    }
  }'
```

## WebSocket Real-Time Example

### Tracking Workflow Progress

```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

// Start workflow
socket.emit('agent:workflow:execute', {
  workflow: {
    id: 'realtime-demo',
    name: 'Real-time Demo',
    steps: [
      { id: 'step-1', name: 'Step 1', agentId: 'agent_claude_default', input: { prompt: 'First task' } },
      { id: 'step-2', name: 'Step 2', agentId: 'agent_claude_default', input: { prompt: 'Second task' }, dependsOn: ['step-1'] }
    ]
  }
}, (response) => {
  console.log('Workflow started:', response);
});

// Listen for events
socket.on('agent:workflow:started', (data) => {
  console.log(`Workflow ${data.workflowId} started`);
});

socket.on('agent:workflow:step:started', (data) => {
  console.log(`Step ${data.stepName} started`);
});

socket.on('agent:workflow:step:completed', (data) => {
  console.log(`Step ${data.stepId} completed:`, data.output);
});

socket.on('agent:workflow:completed', (data) => {
  console.log('Workflow completed:', data.results);
});

socket.on('agent:workflow:failed', (data) => {
  console.error('Workflow failed:', data.error);
});
```

## Error Handling Best Practices

### 1. Use Retry Policies for External APIs

```json
{
  "retryPolicy": {
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "backoffMultiplier": 2,
    "retryableErrors": ["TIMEOUT", "RATE_LIMIT", "SERVICE_UNAVAILABLE"]
  }
}
```

### 2. Set Appropriate Timeouts

```json
{
  "id": "step-with-timeout",
  "timeout": 30000,
  "input": { "prompt": "Long-running task..." }
}
```

### 3. Handle Partial Failures

```typescript
const result = await orchestrateParallel(steps, context, {
  continueOnError: true // Collect all results, including failures
});

const successful = result.results.filter(r => r.success);
const failed = result.results.filter(r => !r.success);
```

## Performance Tips

1. **Parallelize Independent Steps**: Use `dependsOn` carefully to maximize parallelism
2. **Batch Similar Operations**: Group related API calls in parallel steps
3. **Use Templates for Repeated Prompts**: Reduces prompt construction overhead
4. **Set Reasonable Timeouts**: Prevent stuck workflows from blocking resources
5. **Monitor Metrics**: Use the `/api/v1/agents/metrics` endpoint to identify bottlenecks

## Related Documentation

- [Agent Orchestration Architecture](../backend/agent-orchestration.md)
- [Agent Endpoints API](../api/agent-endpoints.md)
- [ADR-0006: Agent Orchestration](../adr/0006-agent-orchestration.md)
