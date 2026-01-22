# Troubleshooting Guide

This guide helps diagnose and resolve common issues in Slop Studios 3.

## Quick Diagnostics

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

### Check Component Status

```bash
# Claude service
curl http://localhost:3000/api/v1/claude/health

# Strudel service
curl http://localhost:3000/api/v1/strudel/health

# Agent system
curl http://localhost:3000/api/v1/agents/health
```

### Check Logs

```bash
# Development
npm run dev 2>&1 | tee app.log

# Production (Docker)
docker logs slopstudios3 --tail 100 -f

# Kubernetes
kubectl logs -f deployment/slopstudios3
```

## Common Issues

### Application Won't Start

#### Port Already in Use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### Missing Environment Variables

**Error:**
```
Error: Missing required environment variable: JWT_SECRET
```

**Solution:**
```bash
# Check .env file exists
ls -la .env

# Copy from example
cp .env.example .env

# Edit with required values
nano .env
```

#### Redis Connection Failed

**Error:**
```
Error: Connection to Redis failed
```

**Solution:**
```bash
# Check Redis is running
redis-cli ping

# Start Redis (Docker)
docker-compose up -d redis

# Check connection string
echo $REDIS_URL
```

### Authentication Issues

#### Invalid Token

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

**Solutions:**

1. Token expired - refresh token:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/refresh \
     -H "Authorization: Bearer $OLD_TOKEN"
   ```

2. Token malformed - check format:
   ```bash
   # Token should be: Bearer eyJhbG...
   echo $TOKEN | cut -d'.' -f2 | base64 -d
   ```

3. JWT secret changed - re-login

#### Rate Limited

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "retryAfter": 60
  }
}
```

**Solution:**
- Wait for `retryAfter` seconds
- Reduce request frequency
- Increase rate limits in config if appropriate

### Claude Integration Issues

#### Claude CLI Not Available

**Error:**
```
Claude CLI not available, using API fallback
```

**Solutions:**

1. Install Claude CLI:
   ```bash
   # Follow Anthropic installation instructions
   ```

2. Configure path:
   ```env
   CLAUDE_CLI_PATH=/path/to/claude
   ```

3. Enable API fallback:
   ```env
   CLAUDE_USE_API_FALLBACK=true
   ```

#### API Key Invalid

**Error:**
```
Error: Invalid API key
```

**Solution:**
```bash
# Check API key format (should start with sk-ant-)
echo $ANTHROPIC_API_KEY

# Get new key from Anthropic console
```

#### Process Timeout

**Error:**
```
Error: Process timeout after 300000ms
```

**Solutions:**

1. Increase timeout:
   ```env
   CLAUDE_PROCESS_TIMEOUT_MS=600000
   ```

2. Simplify prompt

3. Use streaming for long operations

### Strudel Integration Issues

#### Pattern Validation Failed

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid pattern syntax"
  }
}
```

**Solution:**
- Check pattern syntax
- Validate locally first:
  ```bash
  curl -X POST http://localhost:3000/api/v1/strudel/validate \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"code": "s(\"bd sd\")"}'
  ```

#### Render Timeout

**Error:**
```
Error: Render timeout
```

**Solutions:**

1. Reduce duration:
   ```json
   { "options": { "duration": 10 } }
   ```

2. Increase timeout:
   ```env
   STRUDEL_RENDER_TIMEOUT_MS=180000
   ```

### Workflow Issues

#### Workflow Stuck

**Symptoms:**
- Status remains "running" indefinitely
- No progress updates

**Solutions:**

1. Check workflow status:
   ```bash
   curl http://localhost:3000/api/v1/agents/workflows/wf_xxx \
     -H "Authorization: Bearer $TOKEN"
   ```

2. Cancel and retry:
   ```bash
   curl -X DELETE http://localhost:3000/api/v1/agents/workflows/wf_xxx \
     -H "Authorization: Bearer $TOKEN"
   ```

3. Check dependent services

#### Step Failed

**Error:**
```
Step xyz failed: <error message>
```

**Solutions:**

1. Check step output:
   ```bash
   curl http://localhost:3000/api/v1/agents/workflows/wf_xxx \
     -H "Authorization: Bearer $TOKEN" | jq '.data.stepResults'
   ```

2. Fix step configuration

3. Add retry policy:
   ```json
   {
     "retryPolicy": {
       "maxRetries": 3,
       "initialDelayMs": 1000
     }
   }
   ```

### WebSocket Issues

#### Connection Refused

**Error:**
```
WebSocket connection failed
```

**Solutions:**

1. Check server is running
2. Verify correct URL and port
3. Check firewall/proxy settings
4. Verify WebSocket support in proxy

#### Authentication Failed

**Error:**
```
Authentication error
```

**Solution:**
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'valid-jwt-token'  // Ensure token is valid
  }
});
```

#### Messages Not Received

**Symptoms:**
- Connected but no events

**Solutions:**

1. Verify subscription:
   ```javascript
   socket.emit('subscribe:workflow', { workflowId: 'wf_xxx' });
   ```

2. Check event handlers:
   ```javascript
   socket.on('workflow:progress', (data) => console.log(data));
   ```

3. Verify correct namespace

### Database Issues

#### Connection Pool Exhausted

**Error:**
```
Error: Connection pool exhausted
```

**Solutions:**

1. Increase pool size:
   ```env
   DATABASE_POOL_SIZE=20
   ```

2. Check for connection leaks

3. Add connection timeout

#### Query Timeout

**Error:**
```
Error: Query timeout
```

**Solutions:**

1. Optimize slow queries
2. Add database indexes
3. Increase timeout setting

### Memory Issues

#### Out of Memory

**Error:**
```
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
```

**Solutions:**

1. Increase memory limit:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm start
   ```

2. Check for memory leaks:
   ```bash
   node --inspect dist/index.js
   ```

3. Profile memory usage

#### High Memory Usage

**Symptoms:**
- Memory grows over time
- OOM kills

**Diagnosis:**
```bash
# Check current usage
curl http://localhost:3000/api/v1/health | jq '.data.memory'

# Monitor over time
watch -n 5 'curl -s http://localhost:3000/api/v1/health | jq .data.memory'
```

## Debugging Tools

### Enable Debug Logging

```bash
DEBUG=* npm run dev
LOG_LEVEL=debug npm run dev
```

### Inspect Network

```bash
# Check listening ports
netstat -tlnp | grep node

# Check connections
ss -tnp | grep :3000
```

### Profile Performance

```bash
# CPU profiling
node --prof dist/index.js
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --inspect dist/index.js
# Open chrome://inspect
```

### Check Redis

```bash
# Connect to Redis
redis-cli

# Check memory
INFO memory

# Check connected clients
CLIENT LIST

# Monitor commands
MONITOR
```

## Getting Help

If issues persist:

1. Check [GitHub Issues](https://github.com/slopstudios/slopstudios3/issues)
2. Review recent changes in git log
3. Contact team with:
   - Error message
   - Steps to reproduce
   - Environment details
   - Relevant logs
