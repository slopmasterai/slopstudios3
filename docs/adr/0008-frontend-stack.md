# ADR 0008: Frontend Technology Stack

## Status

Accepted

## Context

Slop Studios 3 requires a modern, performant frontend to complement the existing backend services. The frontend must:

1. Integrate seamlessly with REST APIs and WebSocket services
2. Provide real-time updates for long-running processes
3. Support complex state management patterns
4. Be maintainable and type-safe
5. Offer excellent developer experience
6. Support responsive design and accessibility

## Decision

We will use the following technology stack for the frontend:

### Core Framework
- **React 18** - Industry-standard UI library with mature ecosystem
- **TypeScript 5** - Type safety and improved developer experience

### Build Tooling
- **Vite 5** - Fast development server and optimized production builds

### Routing
- **React Router 6** - Client-side routing with data APIs

### State Management
- **Zustand** - Lightweight, simple state management for client state
- **TanStack Query 5** - Powerful server state management with caching

### HTTP/WebSocket
- **Axios** - Feature-rich HTTP client
- **Socket.IO Client** - Real-time bidirectional communication

### Styling
- **Tailwind CSS 3** - Utility-first CSS framework
- **Radix UI** - Unstyled, accessible component primitives
- **Class Variance Authority** - Type-safe component variants

### Form Handling
- **React Hook Form** - Performant form management
- **Zod** - Schema validation

### Testing
- **Vitest** - Vite-native test runner
- **React Testing Library** - Component testing

## Alternatives Considered

### Framework Alternatives

#### Next.js
- Pros: SSR, file-based routing, built-in optimizations
- Cons: Overhead for SPA use case, added complexity
- Decision: Overkill for our SPA requirements

#### Vue.js
- Pros: Gentle learning curve, good documentation
- Cons: Smaller ecosystem, team familiarity with React
- Decision: React preferred due to team experience

### State Management Alternatives

#### Redux Toolkit
- Pros: Mature, extensive middleware
- Cons: Boilerplate, overkill for our needs
- Decision: Zustand provides simplicity with sufficient power

#### Jotai/Recoil
- Pros: Atomic state model
- Cons: Different mental model, less mature
- Decision: Zustand's simplicity preferred

### Styling Alternatives

#### CSS Modules
- Pros: Scoped styles, familiar CSS
- Cons: More files, less utility
- Decision: Tailwind's productivity wins

#### Styled Components
- Pros: CSS-in-JS, dynamic styling
- Cons: Runtime overhead, bundle size
- Decision: Tailwind's zero-runtime preferred

## Consequences

### Positive

1. **Type Safety**: TypeScript catches errors at compile time
2. **Fast Development**: Vite provides instant HMR
3. **Maintainable State**: Clear separation of client/server state
4. **Real-Time Ready**: Socket.IO integrates smoothly
5. **Accessible UI**: Radix UI provides ARIA compliance
6. **Rapid Styling**: Tailwind enables quick iteration
7. **Team Familiarity**: React is well-known by the team

### Negative

1. **Learning Curve**: TanStack Query and Zustand have their own patterns
2. **Bundle Size**: More dependencies than minimal alternatives
3. **Tailwind Verbosity**: Long class strings in components

### Risks

1. **Dependency Updates**: Major version changes may require migration
2. **Socket Complexity**: Real-time state sync can be tricky
3. **Type Maintenance**: TypeScript types need to stay in sync with backend

## Implementation Notes

### Directory Structure

```
client/
├── src/
│   ├── components/ui/     # Radix-based primitives
│   ├── components/layout/ # App shell
│   ├── components/features/ # Domain components
│   ├── lib/               # Axios, Socket.IO setup
│   ├── services/          # API abstraction layer
│   ├── hooks/             # Custom hooks (TanStack Query wrappers)
│   ├── stores/            # Zustand stores
│   ├── types/             # TypeScript types
│   └── pages/             # Route components
```

### State Patterns

1. **Client State** (Zustand)
   - UI preferences (theme, sidebar)
   - Authentication state
   - WebSocket connection state

2. **Server State** (TanStack Query)
   - API data with caching
   - Automatic refetching
   - Optimistic updates

### Real-Time Updates

1. WebSocket events update TanStack Query cache
2. Streaming data goes through custom hooks
3. Connection state managed by Zustand

## References

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vitejs.dev)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://zustand-demo.pmnd.rs)
- [Tailwind CSS](https://tailwindcss.com)
- [Radix UI](https://radix-ui.com)
