# ADR 0007: Agent Collaboration System

## Status

Accepted

## Context

The existing Agent Orchestration system (Phase 14) supports basic orchestration patterns:
- Sequential execution
- Parallel execution
- Conditional branching
- Map-reduce processing

While these patterns enable workflow automation, they lack sophisticated agent-to-agent interaction capabilities. Modern AI applications increasingly require:

1. **Iterative Improvement**: Agents that can self-evaluate and improve their outputs
2. **Multi-Perspective Analysis**: Multiple agents providing different viewpoints
3. **Consensus Building**: Structured methods for agents to reach agreement
4. **Quality Assurance**: Built-in mechanisms for output quality validation

## Decision

We will extend the Agent Orchestration system with two new collaboration patterns:

### 1. Self-Critique Pattern

An agent iteratively improves its output by:
- Generating an initial response
- Evaluating against configurable quality criteria
- Generating improvement suggestions
- Creating improved versions
- Repeating until quality threshold or max iterations

Key design decisions:
- **Configurable Criteria**: Users define quality criteria with weights
- **Threshold-Based Termination**: Stops when quality meets threshold
- **Iteration Limits**: Hard limit prevents infinite loops
- **Evaluation Transparency**: Each iteration's evaluation is stored

### 2. Discussion Pattern

Multiple agents engage in structured dialogue:
- Each participant contributes their perspective
- Contributions are synthesized each round
- Consensus is evaluated using configurable strategies
- Process repeats until consensus or max rounds

Key design decisions:
- **Flexible Consensus Strategies**:
  - `unanimous`: All must agree
  - `majority`: >50% agreement
  - `weighted`: Agreement weighted by participant expertise
  - `facilitator`: Designated agent makes final decision

- **Role-Based Participants**: Each agent has a defined role and optional system prompt
- **Weight-Based Influence**: Experts can have more influence
- **Round-Based Structure**: Clear progression with synthesis

## Technical Implementation

### Architecture

```
                    ┌───────────────────────────┐
                    │   Orchestration Service   │
                    │   (extended patterns)     │
                    └───────────┬───────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
   │  Self-Critique │  │   Discussion   │  │    Existing    │
   │    Service     │  │    Service     │  │    Patterns    │
   └────────────────┘  └────────────────┘  └────────────────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    Agent Registry     │
                    │    (execute agents)   │
                    └───────────────────────┘
```

### State Management

Both patterns use Redis for state persistence:
- Current state (in-progress, completed, failed)
- Iteration/round history
- Metrics aggregation
- Result caching

### Event Architecture

Real-time updates via EventEmitter + WebSocket:
- Progress events during execution
- Completion/convergence notifications
- Error propagation

### Configuration Hierarchy

1. Environment defaults (server.config.ts)
2. Request-level overrides
3. Validation against hard limits

## Alternatives Considered

### 1. Single "Debate" Pattern

Combine self-critique and discussion into one pattern.

**Rejected because:**
- Different use cases require different approaches
- Self-critique is single-agent focused
- Discussion is multi-agent focused
- Combined pattern would be overly complex

### 2. External Orchestration

Use external orchestration tools (LangGraph, etc.)

**Rejected because:**
- Adds external dependency
- Less control over execution
- Integration complexity with existing system
- Performance overhead

### 3. Simple Retry Mechanism

Instead of self-critique, use simple retry with different prompts.

**Rejected because:**
- No structured evaluation
- No quality measurement
- No improvement guidance
- Less transparent

## Consequences

### Positive

1. **Enhanced Output Quality**: Self-critique enables iterative improvement
2. **Diverse Perspectives**: Discussion surfaces multiple viewpoints
3. **Structured Decision Making**: Consensus strategies provide clear outcomes
4. **Observability**: Detailed metrics and event streams
5. **Flexibility**: Configurable for different use cases
6. **Integration**: Seamless extension of existing orchestration

### Negative

1. **Increased Complexity**: Two new services to maintain
2. **Higher Costs**: Multiple agent calls per workflow
3. **Latency**: Multi-iteration/round patterns take longer
4. **State Management**: Additional Redis operations
5. **Learning Curve**: Users must understand new patterns

### Mitigations

- Clear documentation and examples
- Sensible defaults for configuration
- Timeout protection for runaway processes
- Metrics for cost/latency monitoring

## Performance Considerations

### Self-Critique
- 2-10 agent calls per execution
- Each iteration adds ~1-5 seconds
- Redis operations: O(iterations)

### Discussion
- (participants × rounds) agent calls
- Each round adds ~2-10 seconds
- Redis operations: O(rounds × participants)

### Optimizations
- Concurrent participant contributions within rounds
- Early termination on convergence
- Result caching for repeated queries

## Security Considerations

1. **Rate Limiting**: Applied at endpoint level
2. **Max Limits**: Hard caps on iterations/rounds/participants
3. **Timeout Protection**: Prevents infinite execution
4. **Input Validation**: All inputs validated via TypeBox schemas
5. **Authentication**: JWT required for all endpoints

## Future Extensions

1. **Voting System**: Explicit voting instead of implicit consensus
2. **Hierarchical Discussion**: Sub-discussions that feed into main
3. **Adaptive Criteria**: Automatically adjust based on history
4. **Cross-Pattern Composition**: Self-critique within discussion rounds
5. **Human-in-the-Loop**: Allow human participants in discussions

## References

- [Phase 14 ADR: Agent Orchestration](./0006-agent-orchestration.md)
- [Agent Collaboration Documentation](../backend/agent-collaboration.md)
- [Example Workflows](../examples/collaboration-workflows.md)
