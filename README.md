# Slop Studios 3

A modern AI-powered media and art platform.

## Overview

Slop Studios 3 is a next-generation creative platform leveraging artificial
intelligence for media generation, manipulation, and distribution.

## Prerequisites

- Node.js >= 20.0.0 (see `.nvmrc`)
- Docker and Docker Compose
- Git
- Claude CLI (optional, for full AI features)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/slopstudios/slopstudios3.git
cd slopstudios3
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
```

### 3. Install Dependencies

```bash
# Using the setup script (recommended)
./scripts/setup.sh

# Or manually
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Run with Docker (Alternative)

```bash
docker-compose up -d
```

## Project Structure

```
slopstudios3/
├── src/                    # Source code
│   ├── components/         # UI components
│   ├── services/           # Business logic
│   ├── utils/              # Utility functions
│   └── types/              # TypeScript type definitions
├── tests/                  # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests
├── docs/                   # Documentation
│   ├── adr/                # Architecture Decision Records
│   └── api/                # API documentation
├── scripts/                # Build and utility scripts
├── config/                 # Configuration files
├── public/                 # Static assets
├── infrastructure/         # Infrastructure as Code
└── .github/                # GitHub workflows and templates
```

## Available Scripts

| Command                    | Description                    |
| -------------------------- | ------------------------------ |
| `npm run dev`              | Start development server       |
| `npm run dev:debug`        | Start with debugging enabled   |
| `npm run build`            | Build for production           |
| `npm run test`             | Run all tests                  |
| `npm run test:unit`        | Run unit tests                 |
| `npm run test:integration` | Run integration tests          |
| `npm run test:e2e`         | Run end-to-end tests           |
| `npm run lint`             | Run linter                     |
| `npm run lint:fix`         | Fix linting issues             |
| `npm run format`           | Format code                    |
| `npm run typecheck`        | Run type checker               |
| `npm run docs:api`         | Generate API documentation     |
| `npm run docs:serve`       | Preview API documentation      |
| `npm run docs:lint`        | Validate OpenAPI specification |

## Environment Variables

| Variable                          | Description                             | Required | Default                 |
| --------------------------------- | --------------------------------------- | -------- | ----------------------- |
| `NODE_ENV`                        | Environment mode                        | No       | `development`           |
| `PORT`                            | Server port                             | No       | `3000`                  |
| `DATABASE_URL`                    | Database connection string              | Yes      | -                       |
| `REDIS_URL`                       | Redis connection string                 | No       | -                       |
| `API_KEY`                         | External API key                        | Yes      | -                       |
| `LOG_LEVEL`                       | Logging level                           | No       | `info`                  |
| `ANTHROPIC_API_KEY`               | Anthropic API key for Claude            | No       | -                       |
| `CLAUDE_CLI_PATH`                 | Path to Claude CLI binary               | No       | `/usr/local/bin/claude` |
| `CLAUDE_MAX_CONCURRENT_PROCESSES` | Max concurrent Claude CLI processes     | No       | `5`                     |
| `CLAUDE_PROCESS_TIMEOUT_MS`       | Timeout for Claude processes in ms      | No       | `300000`                |
| `CLAUDE_ENABLE_QUEUE`             | Enable request queuing when at capacity | No       | `true`                  |
| `CLAUDE_MAX_QUEUE_SIZE`           | Max requests to queue before rejecting  | No       | `100`                   |
| `CLAUDE_USE_API_FALLBACK`         | Use Anthropic API when CLI unavailable  | No       | `true`                  |
| `STRUDEL_MAX_CONCURRENT_RENDERS`  | Max concurrent audio renders            | No       | `3`                     |
| `STRUDEL_RENDER_TIMEOUT_MS`       | Timeout for audio rendering in ms       | No       | `120000`                |
| `STRUDEL_MAX_PATTERN_LENGTH`      | Max pattern code length in chars        | No       | `100000`                |
| `STRUDEL_MAX_RENDER_DURATION`     | Max audio duration in seconds           | No       | `600`                   |

See `.env.example` for a complete list of environment variables.

## Claude CLI Integration

The platform includes AI-powered features through Claude CLI integration:

### Setup

1. **Install Claude CLI** (optional but recommended):

   ```bash
   # Follow Anthropic's installation instructions
   # https://docs.anthropic.com/en/docs/claude-code
   ```

2. **Configure API Key** (required for API fallback):
   ```bash
   # Add to .env
   ANTHROPIC_API_KEY=sk-ant-your-api-key
   ```

### Features

- **REST API**: Execute Claude commands via HTTP at `/api/v1/claude/*`
- **WebSocket Streaming**: Real-time output via Socket.IO
- **Process Management**: Queue, cancel, and monitor AI processes
- **API Fallback**: Automatic fallback to Anthropic SDK when CLI unavailable

### Health Check

```bash
curl http://localhost:3000/api/v1/claude/health
```

See [Claude Integration Documentation](docs/backend/claude-integration.md) for
details.

## Strudel Live Coding Integration

The platform includes live coding music features through Strudel integration:

### Features

- **Pattern Validation**: Syntax checking using JavaScript parsing
- **Audio Rendering**: Generate audio files from Strudel patterns
- **REST API**: Execute patterns via HTTP at `/api/v1/strudel/*`
- **WebSocket Streaming**: Real-time progress via Socket.IO
- **Multiple Formats**: WAV, MP3, OGG, FLAC output (WAV currently implemented)

### Example

```javascript
// Validate a pattern
curl -X POST http://localhost:3000/api/v1/strudel/validate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "note(\"c3 e3 g3\").s(\"sawtooth\")"}'

// Execute and render audio
curl -X POST http://localhost:3000/api/v1/strudel/execute \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "s(\"bd sd hh sd\").gain(0.8)",
    "options": { "duration": 10 }
  }'
```

### Health Check

```bash
curl http://localhost:3000/api/v1/strudel/health
```

See [Strudel Integration Documentation](docs/backend/strudel-integration.md) for
details.

## Agent Orchestration

The platform includes a powerful multi-agent orchestration system:

### Features

- **Workflow Engine**: Execute multi-step AI workflows with sequential, parallel, conditional, and map-reduce patterns
- **Agent Registry**: Manage and discover AI agents dynamically
- **Prompt Templates**: Reusable, versioned prompt templates with variable substitution
- **Self-Critique**: Iterative refinement of agent outputs
- **Multi-Agent Discussions**: Collaborative decision-making between agents
- **Real-time Updates**: WebSocket-based progress monitoring

### Example

```bash
# Create a workflow
curl -X POST http://localhost:3000/api/v1/agents/workflows \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "id": "research-workflow",
      "steps": [
        { "id": "research", "type": "claude", "prompt": "Research: {{topic}}" },
        { "id": "summarize", "type": "claude", "prompt": "Summarize: {{research.output}}" }
      ]
    },
    "context": { "topic": "AI safety" }
  }'

# Get workflow status
curl http://localhost:3000/api/v1/agents/workflows/<id> \
  -H "Authorization: Bearer <token>"
```

See [Agent Orchestration Documentation](docs/guides/agent-orchestration.md) for details.

## Development

### Code Style

This project uses ESLint and Prettier for code quality and formatting.
Pre-commit hooks automatically run linting and formatting on staged files.

### Testing

We aim for high test coverage. Please write tests for new features and bug
fixes.

```bash
# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Branching Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `hotfix/*` - Production bug fixes
- `release/*` - Release preparation

## Documentation

### Guides
- [Getting Started](docs/guides/getting-started.md)
- [Claude Integration](docs/guides/claude-integration.md)
- [Agent Orchestration](docs/guides/agent-orchestration.md)
- [WebSocket Integration](docs/guides/websocket-integration.md)

### API
- [OpenAPI Specification](docs/api/openapi.yaml)
- [Agent Endpoints](docs/api/agent-endpoints.md)

### Operations
- [Production Checklist](docs/deployment/production-checklist.md)
- [Troubleshooting Guide](docs/operations/troubleshooting.md)

### Development
- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Architecture Decision Records](docs/adr/)
- [Frontend Integration](docs/frontend/integration-guide.md)

## Deployment

### Staging

Automatic deployment to staging occurs on merge to `develop` branch.

### Production

Production deployments require manual approval and occur on merge to `main`
branch.

See [deployment documentation](docs/deployment.md) for detailed instructions.

## Support

For questions or issues:

- Create an issue in this repository
- Contact the development team

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
