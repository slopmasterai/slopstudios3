# ADR-0009: API Documentation Strategy

## Status

Accepted

## Context

As Slop Studios 3 approaches production readiness, comprehensive API documentation is essential for:

- Developer onboarding
- Client integration
- API evolution and versioning
- Interactive API exploration

We need to choose a documentation approach that:

1. Stays synchronized with the actual API
2. Is easy to maintain
3. Provides interactive features
4. Supports versioning

## Decision

We will use **OpenAPI 3.0 Specification** with **Redoc** for documentation generation.

### OpenAPI Specification

- Single source of truth: `docs/api/openapi.yaml`
- Comprehensive schema definitions for all endpoints
- Request/response examples
- Authentication documentation
- Error code documentation

### Tooling

1. **Redoc CLI** for generating static HTML documentation
2. **Redoc preview** for local development
3. **CI validation** to ensure spec validity

### Documentation Scripts

```bash
npm run docs:api    # Build static docs
npm run docs:serve  # Preview docs locally
npm run docs:lint   # Validate OpenAPI spec
```

### Structure

```
docs/api/
├── openapi.yaml     # Main OpenAPI specification
└── index.html       # Generated documentation (not committed)
```

## Consequences

### Positive

- Industry-standard format
- Excellent tooling ecosystem
- Client SDK generation possible
- Interactive "try it out" functionality
- Version control friendly (YAML)

### Negative

- Manual maintenance required to keep in sync
- Large specification file
- Learning curve for OpenAPI syntax

### Mitigations

- Add CI step to validate spec against actual routes (future)
- Use TypeBox schemas to generate OpenAPI schemas (future)
- Regular documentation reviews during PRs

## Alternatives Considered

### Swagger UI

- More widely known but heavier
- Redoc has better design and UX

### Auto-generation from Code

- FastifySwagger can auto-generate
- Less control over documentation quality
- Harder to add examples and descriptions

### API Blueprint / RAML

- Less ecosystem support than OpenAPI
- Fewer integration options

## Related

- [OpenAPI Specification](https://spec.openapis.org/oas/v3.0.3)
- [Redoc Documentation](https://github.com/Redocly/redoc)
