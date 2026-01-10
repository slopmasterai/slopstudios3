# ADR 0002: Use TypeScript as Primary Language

## Status

Accepted

## Context

We need to choose a primary programming language for the Slop Studios 3
platform. The platform will include:

- Web application frontend
- API backend services
- Build and tooling scripts

Key considerations:

- Team familiarity and expertise
- Type safety and maintainability
- Ecosystem and library availability
- Developer experience and tooling

## Decision

We will use TypeScript as our primary programming language for both frontend and
backend development.

Configuration:

- Strict mode enabled
- ES2022 target for modern JavaScript features
- Module resolution set to Node16/NodeNext for ESM support

## Consequences

### Positive

- Strong type system catches errors at compile time
- Excellent IDE support with IntelliSense
- Same language across frontend and backend reduces context switching
- Large ecosystem of typed libraries (@types packages)
- Easy to onboard JavaScript developers
- Enables gradual migration from JavaScript

### Negative

- Additional compilation step required
- Type definitions may be missing or outdated for some libraries
- Learning curve for developers new to static typing
- Build configuration complexity

### Neutral

- Requires maintaining tsconfig.json configurations
- Need to decide on strict vs. loose type checking policies
- Team must agree on TypeScript coding conventions
