# Agent Collaboration System

This document describes the Agent Collaboration System, which extends the Agent Orchestration framework with advanced multi-agent interaction patterns: **Self-Critique** and **Discussion**.

## Overview

The collaboration system enables sophisticated agent interactions beyond simple sequential or parallel execution:

- **Self-Critique Pattern**: Agents iteratively review and improve their outputs based on configurable quality criteria
- **Discussion Pattern**: Multiple agents collaborate through structured dialogue, debate, and consensus-building

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestration Service                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Sequential  │  │  Parallel   │  │     Collaboration       │ │
│  │   Pattern   │  │   Pattern   │  │  ┌─────────┐ ┌────────┐ │ │
│  └─────────────┘  └─────────────┘  │  │  Self-  │ │ Disc-  │ │ │
│                                     │  │ Critique│ │ ussion │ │ │
│                                     │  └─────────┘ └────────┘ │ │
│                                     └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Agent Registry                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Claude  │  │ Strudel  │  │  Custom  │  │   ...    │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Self-Critique Pattern

### Concept

Self-critique enables an agent to iteratively improve its output by:
1. Generating an initial response
2. Evaluating the response against quality criteria
3. Generating improvement suggestions
4. Creating an improved version
5. Repeating until quality threshold is met or max iterations reached

### Configuration

```typescript
interface SelfCritiqueConfig {
  maxIterations: number;       // Maximum improvement iterations (1-10)
  qualityThreshold: number;    // Target quality score (0.0-1.0)
  criteria: QualityCriterion[]; // Evaluation criteria
  evaluationPromptTemplate?: string;    // Custom evaluation prompt
  improvementPromptTemplate?: string;   // Custom improvement prompt
  timeoutMs?: number;          // Override default timeout
}

interface QualityCriterion {
  name: string;           // Criterion identifier
  weight: number;         // Weight in overall score (0.0-1.0)
  description: string;    // What this criterion measures
  rubric?: string;        // Detailed scoring guide
}
```

### Example Usage

```typescript
// REST API
POST /api/v1/agents/orchestrate/self-critique
{
  "agentId": "claude",
  "prompt": "Write a technical explanation of recursion for beginners",
  "config": {
    "maxIterations": 5,
    "qualityThreshold": 0.85,
    "criteria": [
      {
        "name": "clarity",
        "weight": 0.4,
        "description": "Clear and understandable for beginners"
      },
      {
        "name": "accuracy",
        "weight": 0.4,
        "description": "Technically accurate"
      },
      {
        "name": "examples",
        "weight": 0.2,
        "description": "Includes helpful examples"
      }
    ]
  }
}

// Response
{
  "success": true,
  "data": {
    "id": "critique_abc123",
    "status": "completed",
    "originalOutput": "Recursion is when a function calls itself...",
    "finalOutput": "Recursion is a programming technique where...",
    "iterations": [...],
    "totalIterations": 3,
    "converged": true,
    "finalScore": 0.88
  }
}
```

### WebSocket Events

```typescript
// Client -> Server
socket.emit('agent:critique:execute', {
  agentId: 'claude',
  prompt: 'Write about recursion',
  config: { ... }
});

// Server -> Client
socket.on('agent:critique:iteration', (data) => {
  // { id, iteration, score, feedback }
});

socket.on('agent:critique:converged', (data) => {
  // { id, finalScore, totalIterations }
});

socket.on('agent:critique:completed', (data) => {
  // Full result object
});
```

## Discussion Pattern

### Concept

Discussion enables multiple agents to collaborate through structured dialogue:
1. Each participant provides their perspective on the topic
2. Contributions are synthesized
3. Consensus is evaluated using the configured strategy
4. Process repeats until consensus is reached or max rounds completed

### Configuration

```typescript
interface DiscussionConfig {
  maxRounds: number;              // Maximum discussion rounds (1-10)
  consensusThreshold: number;     // Required agreement level (0.0-1.0)
  consensusStrategy: ConsensusStrategy; // How to evaluate consensus
  synthesisPromptTemplate?: string;     // Custom synthesis prompt
  contributionPromptTemplate?: string;  // Custom contribution prompt
  timeoutMs?: number;             // Override default timeout
}

type ConsensusStrategy =
  | 'unanimous'    // All participants must agree
  | 'majority'     // >50% agreement required
  | 'weighted'     // Agreement weighted by participant weights
  | 'facilitator'; // Designated facilitator makes final decision

interface DiscussionParticipant {
  id: string;           // Unique participant ID
  agentId: string;      // Agent type to use
  role: string;         // Role in discussion (expert, critic, etc.)
  weight?: number;      // Weight for weighted consensus (default: 1.0)
  systemPrompt?: string; // Optional role-specific prompt
}
```

### Consensus Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `unanimous` | All participants must agree at threshold level | High-stakes decisions |
| `majority` | More than half must agree | Democratic decisions |
| `weighted` | Agreement weighted by participant weights | Expert-driven decisions |
| `facilitator` | Participant with `facilitator` role decides | Guided discussions |

### Example Usage

```typescript
// REST API
POST /api/v1/agents/orchestrate/discussion
{
  "topic": "Best practices for API versioning",
  "participants": [
    {
      "id": "architect",
      "agentId": "claude",
      "role": "software-architect",
      "weight": 1.5,
      "systemPrompt": "You are an experienced software architect..."
    },
    {
      "id": "developer",
      "agentId": "claude",
      "role": "senior-developer",
      "weight": 1.0
    },
    {
      "id": "critic",
      "agentId": "claude",
      "role": "devil's-advocate",
      "weight": 0.8,
      "systemPrompt": "Challenge assumptions and point out potential issues..."
    }
  ],
  "config": {
    "maxRounds": 5,
    "consensusThreshold": 0.85,
    "consensusStrategy": "weighted"
  }
}

// Response
{
  "success": true,
  "data": {
    "id": "discussion_xyz789",
    "status": "completed",
    "topic": "Best practices for API versioning",
    "rounds": [...],
    "totalRounds": 3,
    "converged": true,
    "finalConsensus": "Use URL path versioning with semantic versions...",
    "consensusScore": 0.89
  }
}
```

### WebSocket Events

```typescript
// Client -> Server
socket.emit('agent:discussion:execute', {
  topic: 'API versioning',
  participants: [...],
  config: { ... }
});

// Server -> Client
socket.on('agent:discussion:round-started', (data) => {
  // { id, roundNumber }
});

socket.on('agent:discussion:contribution', (data) => {
  // { id, roundNumber, participantId, content }
});

socket.on('agent:discussion:round-completed', (data) => {
  // { id, roundNumber, synthesis, consensusScore }
});

socket.on('agent:discussion:converged', (data) => {
  // { id, finalConsensus, consensusScore, totalRounds }
});

socket.on('agent:discussion:completed', (data) => {
  // Full result object
});
```

## API Reference

### Self-Critique Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents/orchestrate/self-critique` | Execute self-critique workflow |
| GET | `/api/v1/agents/critique/:id` | Get critique result by ID |
| GET | `/api/v1/agents/critique/metrics` | Get self-critique metrics |

### Discussion Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents/orchestrate/discussion` | Execute discussion workflow |
| GET | `/api/v1/agents/discussion/:id` | Get discussion result by ID |
| GET | `/api/v1/agents/discussion/metrics` | Get discussion metrics |

## Metrics

### Self-Critique Metrics

```typescript
interface SelfCritiqueMetrics {
  totalCritiques: number;
  completedCritiques: number;
  failedCritiques: number;
  avgIterations: number;
  avgFinalScore: number;
  convergenceRate: number;
  avgDurationMs: number;
  byAgent: Record<string, {
    total: number;
    avgScore: number;
    convergenceRate: number;
  }>;
}
```

### Discussion Metrics

```typescript
interface DiscussionMetrics {
  totalDiscussions: number;
  completedDiscussions: number;
  failedDiscussions: number;
  avgRounds: number;
  avgParticipants: number;
  avgConsensusScore: number;
  convergenceRate: number;
  avgDurationMs: number;
  byStrategy: Record<ConsensusStrategy, {
    total: number;
    convergenceRate: number;
  }>;
}
```

## Configuration

Environment variables for collaboration settings:

```bash
# Self-Critique Settings
AGENT_CRITIQUE_MAX_ITERATIONS=5       # Maximum iterations per critique
AGENT_CRITIQUE_DEFAULT_THRESHOLD=0.8  # Default quality threshold
AGENT_CRITIQUE_TIMEOUT_MS=600000      # 10 minute timeout

# Discussion Settings
AGENT_DISCUSSION_MAX_ROUNDS=5         # Maximum rounds per discussion
AGENT_DISCUSSION_MAX_PARTICIPANTS=10  # Maximum participants
AGENT_DISCUSSION_CONVERGENCE_THRESHOLD=0.85  # Default consensus threshold
AGENT_DISCUSSION_TIMEOUT_MS=900000    # 15 minute timeout
```

## Best Practices

### Self-Critique

1. **Define Clear Criteria**: Use specific, measurable criteria with clear descriptions
2. **Balance Weights**: Ensure weights reflect actual priorities
3. **Set Realistic Thresholds**: Too high thresholds may cause excessive iterations
4. **Monitor Iterations**: If consistently hitting max iterations, adjust criteria or threshold

### Discussion

1. **Diverse Perspectives**: Include participants with different viewpoints
2. **Clear Roles**: Define distinct roles for each participant
3. **Appropriate Strategy**: Match consensus strategy to the decision type
4. **Weight Expertise**: Use weights to give more influence to domain experts

## Error Handling

Both patterns emit error events and include error information in results:

```typescript
// Error response structure
{
  "success": false,
  "error": {
    "code": "COLLABORATION_ERROR",
    "message": "Critique execution timed out after 600000ms",
    "details": {
      "pattern": "self-critique",
      "agentId": "claude",
      "iterationsCompleted": 3
    }
  }
}
```

## Built-in Prompt Templates

The collaboration system uses prompt templates that are registered on startup and can be listed, customized, or overridden through the prompt template service.

### Template IDs

| Template ID | Pattern | Purpose |
|------------|---------|---------|
| `builtin:self-critique:evaluation` | Self-Critique | Evaluates output quality against criteria |
| `builtin:self-critique:improvement` | Self-Critique | Generates improved content based on feedback |
| `builtin:discussion:participant` | Discussion | Guides participant contributions |
| `builtin:discussion:facilitator` | Discussion | Synthesizes contributions and assesses consensus |

### Template Fallback Behavior

When the collaboration services need a template:
1. If a custom template is provided in the request config, it is used
2. Otherwise, the registered template is fetched from the template service
3. If the registered template is unavailable (e.g., Redis is down), the built-in default is used

This ensures the system remains functional even when Redis is unavailable.

### Customizing Templates

Templates can be overridden in Redis, allowing customization without code changes:

```bash
# List all templates including built-in ones
GET /api/v1/agents/templates?tags=builtin

# Update a built-in template
PUT /api/v1/agents/templates/builtin:self-critique:evaluation
```

See [Collaboration Workflow Examples](../examples/collaboration-workflows.md#built-in-prompt-templates) for detailed customization examples.

## Related Documentation

- [Agent Orchestration](./agent-orchestration.md)
- [WebSocket Events](./websocket-events.md)
- [API Endpoints](../api/agent-endpoints.md)
- [Example Workflows](./example-workflows.md)
