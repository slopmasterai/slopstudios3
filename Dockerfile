# ===========================================
# Slop Studios 3 - Production Dockerfile
# ===========================================

# Build arguments
ARG NODE_VERSION=20
ARG BUILD_DATE
ARG GIT_SHA
ARG VERSION

# ===========================================
# Stage 1: Dependencies
# ===========================================
FROM node:${NODE_VERSION}-alpine AS deps

WORKDIR /app

# Install dependencies needed for native modules
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# ===========================================
# Stage 2: Builder
# ===========================================
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# ===========================================
# Stage 3: Production Runner
# ===========================================
FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Add labels
LABEL org.opencontainers.image.title="Slop Studios 3"
LABEL org.opencontainers.image.description="A modern AI-powered media and art platform"
LABEL org.opencontainers.image.source="https://github.com/slopstudios/slopstudios3"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.version="${VERSION}"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Install security updates
RUN apk add --no-cache dumb-init && \
    apk upgrade --no-cache

# Copy production dependencies
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/package.json ./

# Set ownership
RUN chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
