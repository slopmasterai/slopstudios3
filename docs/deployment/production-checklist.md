# Production Deployment Checklist

This checklist ensures a safe and complete deployment to production.

## Pre-Deployment

### Code Quality

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Code coverage meets threshold: `npm run test:coverage`
- [ ] No console.log statements in production code
- [ ] No hardcoded secrets or credentials

### Environment Configuration

- [ ] `.env.production` configured with production values
- [ ] All required environment variables set:
  - [ ] `NODE_ENV=production`
  - [ ] `PORT` set appropriately
  - [ ] `DATABASE_URL` points to production database
  - [ ] `REDIS_URL` points to production Redis
  - [ ] `APP_SECRET` is strong and unique
  - [ ] `JWT_SECRET` is strong and unique
  - [ ] `ANTHROPIC_API_KEY` configured
- [ ] Rate limiting configured appropriately
- [ ] CORS origins restricted to allowed domains

### Security

- [ ] JWT secrets are strong (32+ characters, random)
- [ ] API keys are restricted to production IPs/domains
- [ ] SSL/TLS certificates are valid and not expiring
- [ ] Security headers enabled (Helmet)
- [ ] Rate limiting enabled
- [ ] Input validation in place
- [ ] No sensitive data in logs

### Infrastructure

- [ ] Database migrations applied
- [ ] Redis cluster healthy
- [ ] Load balancer configured
- [ ] Health check endpoints working
- [ ] Monitoring and alerting set up
- [ ] Log aggregation configured
- [ ] Backup procedures tested

### Performance

- [ ] Memory limits configured
- [ ] Connection pool sizes appropriate
- [ ] Cache TTLs configured
- [ ] Query performance verified
- [ ] Asset compression enabled

## Deployment Steps

### 1. Prepare Release

```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Create release branch (if using GitFlow)
git checkout -b release/v1.0.0
```

### 2. Build

```bash
# Install dependencies
npm ci --production

# Build TypeScript
npm run build

# Verify build
ls -la dist/
```

### 3. Deploy

```bash
# Docker deployment
docker build -t slopstudios3:v1.0.0 .
docker push registry.example.com/slopstudios3:v1.0.0

# Kubernetes deployment
kubectl set image deployment/slopstudios3 \
  app=registry.example.com/slopstudios3:v1.0.0 \
  --record
```

### 4. Verify Deployment

- [ ] Application starts without errors
- [ ] Health check returns healthy: `curl https://api.example.com/api/v1/health`
- [ ] Authentication works
- [ ] Core features functional
- [ ] WebSocket connections working
- [ ] No error spikes in monitoring

### 5. Post-Deployment

- [ ] Update CHANGELOG.md
- [ ] Update documentation if needed
- [ ] Notify stakeholders
- [ ] Monitor error rates for 24 hours
- [ ] Keep rollback ready

## Rollback Procedure

If issues are detected:

```bash
# Docker rollback
docker pull registry.example.com/slopstudios3:previous-version
kubectl set image deployment/slopstudios3 \
  app=registry.example.com/slopstudios3:previous-version

# Verify rollback
curl https://api.example.com/api/v1/health
```

## Environment Variable Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://...` |
| `REDIS_URL` | Redis connection | `redis://...` |
| `APP_SECRET` | Application secret | `<random-string>` |
| `JWT_SECRET` | JWT signing secret | `<random-string>` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging verbosity | `info` |
| `ANTHROPIC_API_KEY` | Claude API key | - |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit | `100` |
| `CORS_ORIGIN` | Allowed origins | `*` |

## Monitoring Checklist

- [ ] Application metrics (latency, throughput)
- [ ] Error rates and types
- [ ] Memory and CPU usage
- [ ] Database connections
- [ ] Redis connections
- [ ] External API latency
- [ ] Queue depths
- [ ] WebSocket connections

## Contacts

| Role | Contact |
|------|---------|
| On-call Engineer | @oncall |
| Platform Team | @platform |
| Security Team | @security |
