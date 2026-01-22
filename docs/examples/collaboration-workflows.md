# Collaboration Workflow Examples

This document provides practical examples of using the Agent Collaboration System's Self-Critique and Discussion patterns.

## Self-Critique Examples

### Example 1: Technical Writing Improvement

Improve technical documentation through iterative self-critique:

```typescript
const response = await fetch('/api/v1/agents/orchestrate/self-critique', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    agentId: 'claude',
    prompt: `Write API documentation for the following endpoint:

    POST /api/v1/users
    Creates a new user account.

    Request body:
    - email (string, required): User's email address
    - password (string, required): User's password (min 8 chars)
    - name (string, optional): User's display name

    Write clear, developer-friendly documentation.`,
    config: {
      maxIterations: 4,
      qualityThreshold: 0.85,
      criteria: [
        {
          name: 'completeness',
          weight: 0.3,
          description: 'Covers all parameters, responses, and error cases'
        },
        {
          name: 'clarity',
          weight: 0.3,
          description: 'Easy to understand for developers of all levels'
        },
        {
          name: 'examples',
          weight: 0.2,
          description: 'Includes practical code examples'
        },
        {
          name: 'formatting',
          weight: 0.2,
          description: 'Well-structured with proper markdown formatting'
        }
      ]
    }
  })
});
```

### Example 2: Code Review Self-Improvement

Have an agent review and improve its own code:

```typescript
const critiqueResult = await fetch('/api/v1/agents/orchestrate/self-critique', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    agentId: 'claude',
    prompt: `Write a TypeScript function that validates email addresses.

    Requirements:
    - Return true for valid emails, false for invalid
    - Handle edge cases
    - Include proper TypeScript types
    - Add JSDoc comments`,
    config: {
      maxIterations: 5,
      qualityThreshold: 0.9,
      criteria: [
        {
          name: 'correctness',
          weight: 0.35,
          description: 'Correctly validates all email formats per RFC 5322'
        },
        {
          name: 'type_safety',
          weight: 0.25,
          description: 'Proper TypeScript types with no any types'
        },
        {
          name: 'edge_cases',
          weight: 0.25,
          description: 'Handles edge cases (empty strings, special chars, etc.)'
        },
        {
          name: 'documentation',
          weight: 0.15,
          description: 'Clear JSDoc with examples'
        }
      ]
    }
  })
});
```

### Example 3: Real-time Self-Critique with WebSocket

Monitor critique progress in real-time:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: '<jwt-token>' }
});

// Track iteration progress
socket.on('agent:critique:iteration', (data) => {
  console.log(`Iteration ${data.iteration}:`);
  console.log(`  Score: ${data.score.toFixed(2)}`);
  console.log(`  Feedback: ${data.feedback}`);
  updateProgressUI(data);
});

// Handle convergence
socket.on('agent:critique:converged', (data) => {
  console.log(`Converged after ${data.totalIterations} iterations`);
  console.log(`Final score: ${data.finalScore.toFixed(2)}`);
});

// Handle completion
socket.on('agent:critique:completed', (result) => {
  console.log('Final output:', result.finalOutput);
  displayResult(result);
});

// Handle errors
socket.on('agent:critique:error', (error) => {
  console.error('Critique failed:', error.message);
  showError(error);
});

// Start the critique
socket.emit('agent:critique:execute', {
  agentId: 'claude',
  prompt: 'Explain quantum computing to a 10-year-old',
  config: {
    maxIterations: 4,
    qualityThreshold: 0.88,
    criteria: [
      { name: 'simplicity', weight: 0.5, description: 'Uses simple language a child can understand' },
      { name: 'accuracy', weight: 0.3, description: 'Scientifically accurate' },
      { name: 'engagement', weight: 0.2, description: 'Fun and engaging' }
    ]
  }
});
```

## Discussion Examples

### Example 1: Architecture Decision Review

Get multiple perspectives on an architecture decision:

```typescript
const discussion = await fetch('/api/v1/agents/orchestrate/discussion', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: `Should we use microservices or a monolith for our new e-commerce platform?

    Context:
    - Team size: 8 developers
    - Expected users: 10,000 daily active
    - Must support: catalog, cart, checkout, payments, notifications
    - Timeline: MVP in 3 months`,
    participants: [
      {
        id: 'architect',
        agentId: 'claude',
        role: 'senior-architect',
        weight: 1.5,
        systemPrompt: 'You are a senior software architect with 15 years of experience. Focus on scalability, maintainability, and team productivity.'
      },
      {
        id: 'pragmatist',
        agentId: 'claude',
        role: 'pragmatic-developer',
        weight: 1.0,
        systemPrompt: 'You are a pragmatic developer who values shipping fast and iterating. Focus on developer experience and time to market.'
      },
      {
        id: 'ops',
        agentId: 'claude',
        role: 'devops-engineer',
        weight: 1.0,
        systemPrompt: 'You are a DevOps engineer. Focus on deployment complexity, monitoring, and operational overhead.'
      },
      {
        id: 'critic',
        agentId: 'claude',
        role: 'devils-advocate',
        weight: 0.8,
        systemPrompt: 'Challenge every argument. Point out potential issues, hidden costs, and assumptions that might be wrong.'
      }
    ],
    config: {
      maxRounds: 4,
      consensusThreshold: 0.8,
      consensusStrategy: 'weighted'
    }
  })
});
```

### Example 2: Code Review Panel

Multiple agents review code from different perspectives:

```typescript
const codeReview = await fetch('/api/v1/agents/orchestrate/discussion', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: `Review this authentication middleware:

    \`\`\`typescript
    export async function authMiddleware(req, res, next) {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'No token' });

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
      } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
      }
    }
    \`\`\`

    Discuss potential improvements and issues.`,
    participants: [
      {
        id: 'security',
        agentId: 'claude',
        role: 'security-reviewer',
        weight: 2.0,
        systemPrompt: 'You are a security expert. Focus on authentication vulnerabilities, token handling, and security best practices.'
      },
      {
        id: 'typescript',
        agentId: 'claude',
        role: 'typescript-expert',
        weight: 1.0,
        systemPrompt: 'You are a TypeScript expert. Focus on type safety, error handling patterns, and TypeScript best practices.'
      },
      {
        id: 'perf',
        agentId: 'claude',
        role: 'performance-engineer',
        weight: 0.8,
        systemPrompt: 'You are a performance engineer. Focus on efficiency, caching opportunities, and potential bottlenecks.'
      }
    ],
    config: {
      maxRounds: 3,
      consensusThreshold: 0.75,
      consensusStrategy: 'weighted'
    }
  })
});
```

### Example 3: Facilitator-Led Discussion

Use a facilitator to guide discussion and make final decisions:

```typescript
const facilitatedDiscussion = await fetch('/api/v1/agents/orchestrate/discussion', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: 'Choose the best state management solution for our React application',
    participants: [
      {
        id: 'facilitator',
        agentId: 'claude',
        role: 'facilitator',
        weight: 1.0,
        systemPrompt: `You are a neutral facilitator. Your job is to:
          1. Summarize each participant's points fairly
          2. Identify areas of agreement and disagreement
          3. Ask clarifying questions
          4. Make a final recommendation based on the discussion`
      },
      {
        id: 'redux-fan',
        agentId: 'claude',
        role: 'redux-advocate',
        weight: 1.0,
        systemPrompt: 'You advocate for Redux. Explain its benefits for large applications.'
      },
      {
        id: 'zustand-fan',
        agentId: 'claude',
        role: 'zustand-advocate',
        weight: 1.0,
        systemPrompt: 'You advocate for Zustand. Explain its simplicity and performance benefits.'
      },
      {
        id: 'context-fan',
        agentId: 'claude',
        role: 'context-advocate',
        weight: 1.0,
        systemPrompt: 'You advocate for React Context + useReducer. Explain when built-in solutions are sufficient.'
      }
    ],
    config: {
      maxRounds: 4,
      consensusThreshold: 0.7,
      consensusStrategy: 'facilitator'
    }
  })
});
```

### Example 4: Real-time Discussion with WebSocket

Monitor discussion progress in real-time:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: '<jwt-token>' }
});

// Track round starts
socket.on('agent:discussion:round-started', (data) => {
  console.log(`\n=== Round ${data.roundNumber} Started ===`);
  displayRoundHeader(data.roundNumber);
});

// Track individual contributions
socket.on('agent:discussion:contribution', (data) => {
  console.log(`[${data.participantId}] (agreement: ${data.agreementScore.toFixed(2)})`);
  console.log(data.content);
  addContributionToUI(data);
});

// Track round completions
socket.on('agent:discussion:round-completed', (data) => {
  console.log(`\n--- Round ${data.roundNumber} Summary ---`);
  console.log(`Synthesis: ${data.synthesis}`);
  console.log(`Consensus: ${(data.consensusScore * 100).toFixed(0)}%`);
  updateRoundSummary(data);
});

// Handle convergence
socket.on('agent:discussion:converged', (data) => {
  console.log(`\n=== Consensus Reached! ===`);
  console.log(`Final consensus: ${data.finalConsensus}`);
  console.log(`Agreement level: ${(data.consensusScore * 100).toFixed(0)}%`);
  showConsensusReached(data);
});

// Handle completion
socket.on('agent:discussion:completed', (result) => {
  console.log('\nDiscussion complete:', result);
  displayFinalResult(result);
});

// Handle errors
socket.on('agent:discussion:error', (error) => {
  console.error('Discussion failed:', error.message);
  showError(error);
});

// Start the discussion
socket.emit('agent:discussion:execute', {
  topic: 'Best approach for handling API errors in our frontend',
  participants: [
    { id: 'ux', agentId: 'claude', role: 'ux-engineer', weight: 1.0 },
    { id: 'frontend', agentId: 'claude', role: 'frontend-dev', weight: 1.0 },
    { id: 'backend', agentId: 'claude', role: 'backend-dev', weight: 1.0 }
  ],
  config: {
    maxRounds: 4,
    consensusThreshold: 0.8,
    consensusStrategy: 'majority'
  }
});
```

## Combined Workflows

### Example: Discussion + Self-Critique Pipeline

First gather expert perspectives, then refine the consensus:

```typescript
async function refinedDecision(topic: string) {
  // Step 1: Multi-agent discussion
  const discussionResponse = await fetch('/api/v1/agents/orchestrate/discussion', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      topic,
      participants: [
        { id: 'expert1', agentId: 'claude', role: 'domain-expert', weight: 1.5 },
        { id: 'expert2', agentId: 'claude', role: 'practitioner', weight: 1.0 },
        { id: 'critic', agentId: 'claude', role: 'critic', weight: 0.8 }
      ],
      config: {
        maxRounds: 3,
        consensusThreshold: 0.75,
        consensusStrategy: 'weighted'
      }
    })
  });

  const discussionResult = await discussionResponse.json();

  if (!discussionResult.success) {
    throw new Error(`Discussion failed: ${discussionResult.error.message}`);
  }

  // Step 2: Self-critique to refine the consensus
  const critiqueResponse = await fetch('/api/v1/agents/orchestrate/self-critique', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer <token>',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agentId: 'claude',
      prompt: `Refine and improve the following decision summary, making it more actionable and comprehensive:

Original topic: ${topic}

Consensus reached: ${discussionResult.data.finalConsensus}

Please provide a refined, well-structured recommendation.`,
      config: {
        maxIterations: 3,
        qualityThreshold: 0.85,
        criteria: [
          { name: 'actionability', weight: 0.4, description: 'Clear, actionable steps' },
          { name: 'completeness', weight: 0.3, description: 'Addresses all aspects' },
          { name: 'clarity', weight: 0.3, description: 'Clear and well-organized' }
        ]
      }
    })
  });

  const critiqueResult = await critiqueResponse.json();

  return {
    discussionSummary: discussionResult.data.finalConsensus,
    refinedRecommendation: critiqueResult.data.finalOutput,
    discussionId: discussionResult.data.id,
    critiqueId: critiqueResult.data.id
  };
}

// Usage
const result = await refinedDecision('How should we structure our API error responses?');
console.log('Refined recommendation:', result.refinedRecommendation);
```

## Error Handling

```typescript
async function robustCollaboration(config) {
  try {
    const response = await fetch('/api/v1/agents/orchestrate/discussion', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer <token>',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    const result = await response.json();

    if (!result.success) {
      // Handle specific error types
      switch (result.error.code) {
        case 'TIMEOUT':
          console.log('Discussion timed out. Partial results:', result.error.details);
          // Could retry with fewer rounds or participants
          break;
        case 'AGENT_UNAVAILABLE':
          console.log('Agent not available:', result.error.details.agentId);
          // Could retry with different agent
          break;
        case 'PARTICIPANT_LIMIT':
          console.log('Too many participants');
          // Reduce participant count
          break;
        default:
          console.error('Unknown error:', result.error);
      }
      return null;
    }

    // Check if consensus was reached
    if (!result.data.converged) {
      console.log('No consensus reached after', result.data.totalRounds, 'rounds');
      console.log('Best attempt:', result.data.finalConsensus);
      // Could trigger additional discussion or escalate
    }

    return result.data;

  } catch (error) {
    console.error('Network error:', error);
    throw error;
  }
}
```

## Performance Tips

1. **Limit Iterations/Rounds**: Start with lower limits and increase if needed
2. **Use Weights Wisely**: Weight participants based on domain expertise
3. **Choose Right Strategy**: Use `majority` for speed, `unanimous` for critical decisions
4. **Monitor Metrics**: Track convergence rates to optimize configurations
5. **Cache Results**: Store results for similar queries to avoid redundant processing

## Built-in Prompt Templates

The collaboration system provides built-in prompt templates that are registered on startup and can be customized or overridden.

### Template IDs

| Template ID | Description | Used By |
|------------|-------------|---------|
| `builtin:self-critique:evaluation` | Evaluates output quality against specified criteria | Self-Critique pattern |
| `builtin:self-critique:improvement` | Generates improved content based on critique feedback | Self-Critique pattern |
| `builtin:discussion:participant` | Guides participants in collaborative discussions | Discussion pattern |
| `builtin:discussion:facilitator` | Synthesizes contributions and assesses consensus | Discussion pattern |

### Overriding Built-in Templates

You can override any built-in template by creating a new template with the same ID:

```typescript
// Override the evaluation template
await fetch('/api/v1/agents/templates', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id: 'builtin:self-critique:evaluation',
    name: 'Custom Evaluation Template',
    description: 'My customized evaluation template',
    content: `You are evaluating output quality.
Output: {{output}}
Criteria: {{criteria}}
... your custom format ...`,
    category: 'evaluation',
    tags: ['self-critique', 'evaluation', 'custom'],
    variables: [
      { name: 'output', type: 'string', required: true },
      { name: 'criteria', type: 'string', required: true }
    ]
  })
});
```

### Using Custom Templates in Requests

You can also provide a custom template per request without modifying the registry:

```typescript
// Self-critique with custom evaluation template
const critiqueResult = await fetch('/api/v1/agents/orchestrate/self-critique', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    agentId: 'claude',
    prompt: 'Write a summary of the article',
    config: {
      maxIterations: 3,
      qualityThreshold: 0.85,
      criteria: [...],
      evaluationPromptTemplate: 'Your custom evaluation prompt with {{output}} and {{criteria}}...',
      improvementPromptTemplate: 'Your custom improvement prompt...'
    }
  })
});

// Discussion with custom participant template
const discussionResult = await fetch('/api/v1/agents/orchestrate/discussion', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: 'API design discussion',
    participants: [...],
    config: {
      maxRounds: 4,
      consensusThreshold: 0.8,
      consensusStrategy: 'facilitator',
      contributionPromptTemplate: 'Your custom participant prompt...',
      synthesisPromptTemplate: 'Your custom facilitator prompt...'
    }
  })
});
```

### Template Variables Reference

**Self-Critique Evaluation Template:**
- `{{output}}` - The content being evaluated
- `{{criteria}}` - Formatted evaluation criteria

**Self-Critique Improvement Template:**
- `{{output}}` - The original output to improve
- `{{feedback}}` - Critique feedback
- `{{suggestions}}` - Improvement suggestions
- `{{scores}}` - Quality scores from evaluation

**Discussion Participant Template:**
- `{{role}}` - The participant's role
- `{{perspective}}` - The participant's perspective
- `{{topic}}` - The discussion topic
- `{{previousRound}}` - Previous round data (synthesis and contributions)

**Discussion Facilitator Template:**
- `{{topic}}` - The discussion topic
- `{{round}}` - Current round number
- `{{contributions}}` - Array of participant contributions
