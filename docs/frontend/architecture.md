# Frontend Architecture

## Overview

The Slop Studios 3 frontend is a modern React-based single-page application (SPA) built with Vite, TypeScript, and a component-driven architecture. It integrates seamlessly with the backend REST APIs and WebSocket services for real-time updates.

## Technology Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| Framework | React 18 | UI library |
| Build Tool | Vite 5 | Development and production builds |
| Language | TypeScript 5 | Type safety |
| Routing | React Router 6 | Client-side routing |
| State Management | Zustand | Client state |
| Server State | TanStack Query 5 | API state management and caching |
| HTTP Client | Axios | REST API calls |
| WebSocket | Socket.IO Client | Real-time updates |
| Styling | Tailwind CSS 3 | Utility-first CSS |
| UI Components | Radix UI + Custom | Accessible component library |
| Icons | Lucide React | Icon library |
| Forms | React Hook Form | Form management |
| Validation | Zod | Schema validation |

## Directory Structure

```
client/
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── ui/              # Base primitives (Button, Input, etc.)
│   │   ├── layout/          # Layout components (Header, Sidebar)
│   │   └── features/        # Feature-specific components
│   │       └── auth/        # Authentication components
│   ├── lib/                 # Utilities and configurations
│   │   ├── api.ts          # Axios client setup
│   │   ├── socket.ts       # Socket.IO client setup
│   │   └── utils.ts        # Helper functions
│   ├── services/           # API service layer
│   │   ├── auth.service.ts
│   │   ├── claude.service.ts
│   │   ├── strudel.service.ts
│   │   └── agent.service.ts
│   ├── hooks/              # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useClaude.ts
│   │   ├── useStrudel.ts
│   │   ├── useAgents.ts
│   │   ├── useTemplates.ts
│   │   ├── useSocket.ts
│   │   └── useToast.ts
│   ├── stores/             # Zustand state stores
│   │   ├── auth.store.ts
│   │   ├── ui.store.ts
│   │   └── socket.store.ts
│   ├── types/              # TypeScript type definitions
│   │   └── index.ts
│   ├── pages/              # Page components
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Claude.tsx
│   │   ├── Strudel.tsx
│   │   ├── Agents.tsx
│   │   ├── Templates.tsx
│   │   ├── Settings.tsx
│   │   └── NotFound.tsx
│   ├── App.tsx             # Root component with routing
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global styles
├── public/                 # Static assets
├── index.html             # HTML entry point
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies
```

## Architecture Patterns

### Component Architecture

Components are organized by function:

1. **UI Components** (`components/ui/`) - Primitive, reusable components
   - Built on Radix UI for accessibility
   - Styled with Tailwind CSS and CVA
   - Exported from a central index file

2. **Layout Components** (`components/layout/`) - Application shell
   - `AppLayout` - Main layout with sidebar and header
   - `Header` - Top navigation and user menu
   - `Sidebar` - Navigation menu
   - `Footer` - Page footer

3. **Feature Components** (`components/features/`) - Domain-specific
   - Grouped by feature domain
   - Contain business logic
   - Compose UI components

### State Management

The application uses a dual-state architecture:

1. **Client State (Zustand)**
   - UI preferences (theme, sidebar state)
   - Authentication state
   - WebSocket connection state
   - Persisted to localStorage where appropriate

2. **Server State (TanStack Query)**
   - API data caching and synchronization
   - Automatic background refetching
   - Optimistic updates for mutations
   - Error and loading states

### Data Flow

```
User Interaction
       │
       ▼
   Page Component
       │
       ▼
   Custom Hook (useAuth, useClaude, etc.)
       │
       ├──► TanStack Query (Server State)
       │           │
       │           ▼
       │       Service Layer
       │           │
       │           ▼
       │       Axios Client ──► Backend API
       │
       └──► Zustand Store (Client State)
                   │
                   ▼
              localStorage
```

### Real-Time Updates

WebSocket integration provides real-time updates:

```
Socket.IO Server
       │
       ▼
   Socket Client (lib/socket.ts)
       │
       ▼
   Socket Store (stores/socket.store.ts)
       │
       ▼
   Custom Hooks (useClaudeStream, useWorkflowStream)
       │
       ▼
   Component State Updates
```

## API Integration

### HTTP Client

The Axios client (`lib/api.ts`) provides:

- Base URL configuration from environment
- JWT token injection via interceptor
- 401 response handling with redirect
- Request/response logging in development

### Service Layer

Each service module encapsulates API calls:

```typescript
// Example: Claude Service
claudeService.executeCommand(command, options)
claudeService.getProcessStatus(processId)
claudeService.cancelProcess(processId)
claudeService.listProcesses(params)
```

### Custom Hooks

Hooks combine services with TanStack Query:

```typescript
// Example usage
const { processes, executeAsync, isExecuting } = useClaude();
```

## Routing

Routes are configured in `App.tsx`:

| Path | Component | Access |
|------|-----------|--------|
| `/` | Redirect | Depends on auth |
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/dashboard` | Dashboard | Protected |
| `/claude` | Claude | Protected |
| `/strudel` | Strudel | Protected |
| `/agents` | Agents | Protected |
| `/templates` | Templates | Protected |
| `/settings` | Settings | Protected |
| `*` | NotFound | Public |

Protected routes use the `ProtectedRoute` component to enforce authentication.

## Styling

### Tailwind CSS

Configuration includes:
- Custom color palette using CSS variables
- Dark mode support via class strategy
- Responsive breakpoints
- Custom animations

### Component Variants

Using Class Variance Authority (CVA):

```typescript
const buttonVariants = cva(
  "base-classes",
  {
    variants: {
      variant: {
        default: "default-classes",
        destructive: "destructive-classes",
      },
      size: {
        default: "size-default",
        sm: "size-sm",
        lg: "size-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

## Error Handling

1. **Error Boundary** - Catches React errors and displays fallback UI
2. **API Error Interceptor** - Handles 401, logs errors
3. **TanStack Query** - Retry logic, error states
4. **Toast Notifications** - User-friendly error messages

## Performance

### Code Splitting

Vite's rollup configuration splits:
- Vendor chunks (React, React Router)
- Query chunk (TanStack Query)
- UI chunk (Radix components)

### Caching

- TanStack Query stale time: 5 minutes
- Automatic cache invalidation on mutations
- Window focus refetching for critical data

## Development

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API URL |
| `VITE_WS_URL` | WebSocket server URL |
| `VITE_APP_NAME` | Application name |
| `VITE_APP_VERSION` | Application version |

### Scripts

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # Run ESLint
npm run test      # Run tests
```

## Deployment

### Docker

Production Docker image uses:
1. Build stage with Node.js
2. Serve stage with nginx

### nginx Configuration

- SPA routing fallback
- API proxy to backend
- Static asset caching
- Security headers
