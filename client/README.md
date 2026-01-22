# Slop Studios 3 - Frontend

Modern React-based frontend for Slop Studios 3, providing a rich UI for Claude AI commands, Strudel live coding, and Agent orchestration.

## Tech Stack

- **React 18** with TypeScript
- **Vite 5** for development and builds
- **TanStack Query** for server state
- **Zustand** for client state
- **Tailwind CSS** with Radix UI components
- **Socket.IO** for real-time updates

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- Backend running on `http://localhost:3000`

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/
│   ├── ui/           # Base UI components
│   ├── layout/       # App layout components
│   └── features/     # Feature-specific components
├── lib/              # Utilities (API, Socket, helpers)
├── services/         # API service layer
├── hooks/            # Custom React hooks
├── stores/           # Zustand state stores
├── types/            # TypeScript types
├── pages/            # Page components
├── App.tsx           # Root component
├── main.tsx          # Entry point
└── index.css         # Global styles
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript check |
| `npm run test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |

## Environment Variables

Create a `.env.local` file for local development:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
VITE_APP_NAME=Slop Studios 3
VITE_APP_VERSION=0.0.1
VITE_ENABLE_DEVTOOLS=true
```

## Features

### Authentication
- Login/Register pages
- JWT token management
- Protected routes
- User settings

### Dashboard
- System overview
- Quick actions
- Recent activity
- Service health

### Claude AI
- Command execution
- Real-time output streaming
- Process management
- History view

### Strudel Studio
- Pattern editor
- Syntax validation
- Audio rendering
- Preset patterns

### Agent Workflows
- Agent registry
- Workflow builder
- Real-time progress
- Multiple orchestration patterns

### Templates
- CRUD operations
- Variable definitions
- Template preview
- Tag organization

## Docker

### Development

```bash
# With docker-compose (from root)
docker-compose --profile dev up frontend-dev
```

### Production

```bash
# Build image
docker build -t slop-frontend .

# Run container
docker run -p 80:80 slop-frontend
```

## Architecture

See [Frontend Architecture](../docs/frontend/architecture.md) for detailed documentation.

## Contributing

1. Follow the existing code patterns
2. Use TypeScript strictly
3. Write tests for new features
4. Follow the component library conventions
5. Run `npm run lint` before committing

## License

Proprietary - Slop Studios
