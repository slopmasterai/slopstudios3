# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `clearInstallationCache()` export in Claude service for cache management
- Redis connection pooling with `generic-pool` for improved connection management
  - Configurable pool size (`REDIS_POOL_MIN_SIZE`, `REDIS_POOL_MAX_SIZE`)
  - Acquisition timeouts (`REDIS_POOL_ACQUIRE_TIMEOUT_MS`)
  - Idle connection eviction (`REDIS_POOL_IDLE_TIMEOUT_MS`)
  - Periodic health checks (`REDIS_POOL_HEALTH_CHECK_INTERVAL_MS`)
- Redis pool metrics for monitoring (`getPoolMetrics()`)
  - Connection counts: size, available, borrowed, pending
  - Operation counts: acquisitions, releases, errors
  - Health check statistics: passed, failed, last check time
  - Average acquire time tracking
- Pool metrics exposed via `/health/redis` and `/health/metrics` endpoints
- `acquireClient()`, `releaseClient()`, and `withClient()` helpers for pool usage

### Changed

- `validateClaudeInstallation()` now uses in-memory caching (60s TTL) to avoid
  blocking `execSync` calls on every request
- `getClaudeServiceHealth()` accepts optional `forceRefresh` parameter (default:
  `true`) to control cache behavior

### Deprecated

- N/A

### Removed

- N/A

### Fixed

- Claude CLI availability check no longer blocks on every API call, reducing
  latency for `executeClaudeCommand`, `enqueueClaudeCommand`, and
  `isClaudeAvailable`

### Security

- N/A

## Phase 16 - Polish, Optimization & Documentation (2026-01-11)

### Added

#### Error Handling
- Circuit breaker pattern for external service fault tolerance (`src/utils/circuit-breaker.ts`)
- Enhanced error middleware with error categories and rate tracking
- Error factory methods for common error types (validation, notFound, tokenExpired, etc.)
- `getAllErrorRates()` for error rate monitoring by category

#### Logging
- Correlation ID propagation using AsyncLocalStorage
- Log sampling configuration for high-volume production environments
- Performance logging utilities (`logTiming()`, `createTimer()`, `withTiming()`)
- Memory usage logging (`getMemoryUsage()`, `logMemoryUsage()`)
- Structured logging helpers (`logRequest()`, `logExternalCall()`, `logEvent()`)

#### TypeScript Types
- Branded types for type-safe identifiers (`src/types/branded.types.ts`)
  - UserId, AgentId, WorkflowId, SessionId, ProcessId, TemplateId, DiscussionId
  - Type-safe primitives: PositiveInt, Percentage, Ratio, DurationMs, ISOTimestamp, Email, URL
- Utility types (`src/types/utility.types.ts`)
  - Object manipulation: DeepPartial, DeepRequired, DeepReadonly, Mutable
  - Result types with isSuccess/isFailure type guards
  - State machine types for workflows, agents, processes

#### Documentation
- Complete OpenAPI 3.0 specification (`docs/api/openapi.yaml`)
- User guides:
  - Getting Started guide (`docs/guides/getting-started.md`)
  - Claude Integration guide (`docs/guides/claude-integration.md`)
  - Agent Orchestration guide (`docs/guides/agent-orchestration.md`)
  - WebSocket Integration guide (`docs/guides/websocket-integration.md`)
- Operations documentation:
  - Production deployment checklist (`docs/deployment/production-checklist.md`)
  - Troubleshooting guide (`docs/operations/troubleshooting.md`)
- Frontend integration guide (`docs/frontend/integration-guide.md`)
- Architecture Decision Records:
  - ADR-0009: API Documentation Strategy
  - ADR-0010: Performance Optimization Approach
  - ADR-0011: Error Handling Standards

#### Health Endpoints
- Enhanced `/health` endpoint with node version and environment info
- Enhanced `/health/ready` with memory and performance metrics
- New `/health/metrics` endpoint for detailed performance monitoring
- Memory pressure detection in readiness checks

#### Configuration
- Circuit breaker configuration options
- Log sampling configuration options
- Memory threshold configuration options
- Enhanced configuration validation

### Changed

- Health check responses now include nodeVersion and environment
- Readiness probe includes memory usage and error rates
- Configuration validation is more comprehensive with better error messages
- README updated with new documentation links and agent orchestration section

### Dependencies

- `@redocly/cli` - OpenAPI documentation generation

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
