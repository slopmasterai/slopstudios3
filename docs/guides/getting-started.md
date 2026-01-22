# Getting Started with Slop Studios 3

This guide will help you set up and run Slop Studios 3 locally for development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 20.0.0 (use [nvm](https://github.com/nvm-sh/nvm) for version management)
- **Docker** and **Docker Compose** (for Redis and optional containerized development)
- **Git** for version control
- **Claude CLI** (optional, for full AI features)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/slopstudios/slopstudios3.git
cd slopstudios3
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration. At minimum, set:

```env
# Required for AI features
ANTHROPIC_API_KEY=sk-ant-your-api-key

# Required for authentication
JWT_SECRET=your-secure-jwt-secret
APP_SECRET=your-secure-app-secret
```

### 4. Start Redis

```bash
docker-compose up -d redis
```

Or if you have Redis installed locally:

```bash
redis-server
```

### 5. Start the Development Server

```bash
npm run dev
```

The server will start at `http://localhost:3000`.

## Verify Installation

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "0.0.1",
    "uptime": 10
  }
}
```

### API Documentation

View the interactive API documentation:

```bash
npm run docs:serve
```

Then open `http://localhost:8080` in your browser.

## Project Structure

```
slopstudios3/
├── src/
│   ├── config/           # Configuration management
│   ├── middleware/       # Fastify middleware
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   └── websocket/        # WebSocket handlers
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── docs/
│   ├── api/              # API documentation
│   ├── guides/           # User guides
│   └── adr/              # Architecture Decision Records
├── client/               # Frontend application
└── scripts/              # Utility scripts
```

## Key Features

### Claude AI Integration

Execute AI prompts via REST API:

```bash
curl -X POST http://localhost:3000/api/v1/claude/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, Claude!"}'
```

### Strudel Live Coding

Validate and render audio patterns:

```bash
curl -X POST http://localhost:3000/api/v1/strudel/validate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "s(\"bd sd hh sd\")"}'
```

### Agent Orchestration

Create multi-agent workflows:

```bash
curl -X POST http://localhost:3000/api/v1/agents/orchestrate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "sequential",
    "tasks": [
      {"id": "task1", "agentType": "claude", "prompt": "Generate a story"}
    ]
  }'
```

## Development Workflow

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Code Quality

```bash
# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Type checking
npm run typecheck
```

### Building

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

## Docker Development

### Full Stack with Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Build Docker Image

```bash
npm run docker:build
npm run docker:run
```

## Getting Help

- **Documentation**: See the [docs/](../docs/) directory
- **API Reference**: Run `npm run docs:serve`
- **Issues**: [GitHub Issues](https://github.com/slopstudios/slopstudios3/issues)

## Next Steps

- [Claude Integration Guide](./claude-integration.md)
- [Strudel Integration Guide](./strudel-integration.md)
- [Agent Orchestration Guide](./agent-orchestration.md)
- [WebSocket Integration Guide](./websocket-integration.md)
