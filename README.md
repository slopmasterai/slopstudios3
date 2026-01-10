# Slop Studios 3

A modern AI-powered media and art platform.

## Overview

Slop Studios 3 is a next-generation creative platform leveraging artificial
intelligence for media generation, manipulation, and distribution.

## Prerequisites

- Node.js >= 20.0.0 (see `.nvmrc`)
- Docker and Docker Compose
- Git

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

| Command                    | Description              |
| -------------------------- | ------------------------ |
| `npm run dev`              | Start development server |
| `npm run build`            | Build for production     |
| `npm run test`             | Run all tests            |
| `npm run test:unit`        | Run unit tests           |
| `npm run test:integration` | Run integration tests    |
| `npm run test:e2e`         | Run end-to-end tests     |
| `npm run lint`             | Run linter               |
| `npm run lint:fix`         | Fix linting issues       |
| `npm run format`           | Format code              |
| `npm run typecheck`        | Run type checker         |

## Environment Variables

| Variable       | Description                | Required | Default       |
| -------------- | -------------------------- | -------- | ------------- |
| `NODE_ENV`     | Environment mode           | No       | `development` |
| `PORT`         | Server port                | No       | `3000`        |
| `DATABASE_URL` | Database connection string | Yes      | -             |
| `REDIS_URL`    | Redis connection string    | No       | -             |
| `API_KEY`      | External API key           | Yes      | -             |
| `LOG_LEVEL`    | Logging level              | No       | `info`        |

See `.env.example` for a complete list of environment variables.

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

- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Architecture Decision Records](docs/adr/)
- [API Documentation](docs/api/)

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
