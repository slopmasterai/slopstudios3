# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Slop
Studios 3 project.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision
made along with its context and consequences.

## Index

| ADR                                           | Title                              | Status   |
| --------------------------------------------- | ---------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md) | Record Architecture Decisions      | Accepted |
| [0002](0002-use-typescript.md)                | Use TypeScript as Primary Language | Accepted |
| [0003](0003-use-github-actions-for-ci-cd.md)  | Use GitHub Actions for CI/CD       | Accepted |

## Creating a New ADR

1. Copy the template below
2. Create a new file: `NNNN-title-with-dashes.md`
3. Fill in all sections
4. Submit a PR for review
5. Update this README index

## Template

```markdown
# ADR NNNN: Title

## Status

Proposed | Accepted | Deprecated | Superseded by [ADR XXXX](XXXX-title.md)

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?

### Positive

- ...

### Negative

- ...

### Neutral

- ...
```

## References

- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
  by Michael Nygard
- [ADR GitHub Organization](https://adr.github.io/)
