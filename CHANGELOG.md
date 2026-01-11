# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- N/A

### Changed

- N/A

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- N/A

### Security

- N/A

## Phase 12 - Claude CLI Integration (2026-01-10)

### Added

- Claude CLI wrapper service for AI operations
  (`src/services/claude.service.ts`)
- Process manager service with lifecycle tracking
  (`src/services/process-manager.service.ts`)
- Claude metrics service for monitoring
  (`src/services/claude-metrics.service.ts`)
- REST API endpoints for Claude operations:
  - `POST /api/v1/claude/execute` - Execute Claude command synchronously
  - `POST /api/v1/claude/execute/async` - Execute Claude command asynchronously
  - `GET /api/v1/claude/processes/:id` - Get process status
  - `DELETE /api/v1/claude/processes/:id` - Cancel running process
  - `GET /api/v1/claude/processes` - List user's processes
  - `GET /api/v1/claude/metrics` - Retrieve metrics data
  - `GET /api/v1/claude/health` - Health check endpoint
- WebSocket handlers for real-time Claude streaming
  (`src/websocket/handlers/claude.handler.ts`)
- Process queue with configurable concurrency limits
- Anthropic SDK integration (`@anthropic-ai/sdk`) for API fallback
- Graceful shutdown with process cleanup
- Claude types definitions (`src/types/claude.types.ts`)
- ADR-0004 documenting Claude CLI integration architecture

### Dependencies

- `@anthropic-ai/sdk` - Anthropic SDK for direct API access

## Phase 11 - Backend Core (2026-01-10)

### Added

- Backend core with Fastify HTTP server
- Socket.IO WebSocket server for real-time communication
- Redis-backed session management
- JWT authentication middleware
- Rate limiting middleware
- Health check endpoints
- Structured logging with Pino

## Phases 1-10 - Infrastructure Setup (2024-01-10)

### Added

- Initial project infrastructure setup
- Git repository with version control configuration
- Project directory structure
- Development environment configuration
- Code quality tools (ESLint, Prettier)
- Testing infrastructure (Jest)
- CI/CD pipelines (GitHub Actions)
- Docker containerization
- Infrastructure as Code (Terraform)
- Monitoring and observability configuration
- Documentation infrastructure

## [0.0.1] - YYYY-MM-DD

### Added

- Initial release

---

## Release Notes Template

When creating a new release, copy the following template:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- New features

### Changed

- Changes in existing functionality

### Deprecated

- Soon-to-be removed features

### Removed

- Removed features

### Fixed

- Bug fixes

### Security

- Security improvements
```

## Version Guidelines

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions
- **PATCH** version for backwards-compatible bug fixes

[Unreleased]: https://github.com/slopstudios/slopstudios3/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/slopstudios/slopstudios3/releases/tag/v0.0.1
