# Deployment Guide

Share Slop Studios with your friends using your Claude subscription - no API key needed.

## Quick Start (Recommended)

Run on your Mac and share via Cloudflare Tunnel. All AI features work using your authenticated Claude CLI.

### Prerequisites

1. **Docker** - [Install Docker Desktop](https://docker.com)
2. **Claude CLI** - Authenticated via `claude login`
3. **Cloudflare Tunnel** - `brew install cloudflared`

### Start the Server

```bash
# Terminal 1: Start the server
./scripts/start-local.sh

# Terminal 2: Create public URL
./scripts/start-tunnel.sh

# Share the tunnel URL with friends!
```

That's it! Friends can access the full app with Generate, Improve, and Expert Discussion.

---

## How It Works

```
Friends → Cloudflare Tunnel → Your Mac → Claude CLI → Your Subscription
                ↓
          JWT Auth + Rate Limiting (10 requests/hour per user)
```

- **Backend runs on your Mac** where Claude CLI is authenticated
- **Friends access via HTTPS** through Cloudflare Tunnel
- **Per-user rate limiting** protects your subscription
- **JWT authentication** - users register/login to use the app

---

## Detailed Setup

### Step 1: Install Prerequisites

```bash
# Docker Desktop
# Download from https://docker.com

# Cloudflare Tunnel (for sharing)
brew install cloudflared

# Verify Claude CLI is authenticated
claude --version
```

### Step 2: Configure Environment

```bash
# Copy the template
cp .env.local.example .env

# (Optional) Generate secure secrets
openssl rand -hex 32  # Use for JWT_SECRET
openssl rand -hex 32  # Use for APP_SECRET
```

### Step 3: Start Services

```bash
# Start databases (PostgreSQL + Redis)
docker-compose -f docker-compose.local.yml up -d

# Start the backend (with Claude CLI access)
./scripts/start-local.sh
```

### Step 4: Share with Friends

```bash
# In a new terminal
./scripts/start-tunnel.sh

# You'll see output like:
# Your quick Tunnel has been created! Visit it at:
# https://random-words-here.trycloudflare.com
```

Share that URL with your friends!

---

## Rate Limiting & Protection

Your Claude subscription is protected by built-in limits:

| Limit | Value | Purpose |
|-------|-------|---------|
| Per-user Claude requests | 10/hour | Prevents abuse |
| Concurrent processes | 5 max | Prevents overload |
| Request queue | 100 max | Handles bursts |

---

## Stopping the Server

```bash
# Stop the tunnel (Ctrl+C in tunnel terminal)

# Stop the backend (Ctrl+C in server terminal)

# Stop databases
docker-compose -f docker-compose.local.yml down
```

---

## Troubleshooting

### Claude CLI Not Found

```bash
# Check if Claude is installed
which claude

# If not found, install from:
# https://claude.ai/download

# Then authenticate:
claude login
```

### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill it or use a different port
PORT=3001 ./scripts/start-local.sh
```

### Database Connection Failed

```bash
# Check if Docker containers are running
docker ps

# Restart if needed
docker-compose -f docker-compose.local.yml down
docker-compose -f docker-compose.local.yml up -d
```

### Tunnel Not Starting

```bash
# Check if cloudflared is installed
cloudflared --version

# If not, install it
brew install cloudflared
```

---

## Permanent Tunnel URL (Optional)

The quick tunnel gives you a random URL that changes each restart. For a permanent URL:

1. Create a [Cloudflare account](https://cloudflare.com)
2. Set up a named tunnel: `cloudflared tunnel create slopstudios`
3. Configure DNS in Cloudflare dashboard
4. Use: `cloudflared tunnel run slopstudios`

---

## Cloud Deployment (Alternative)

If you prefer cloud hosting with an Anthropic API key, see the [Railway deployment guide](docs/deployment/railway.md).

Note: Cloud deployment requires an `ANTHROPIC_API_KEY` since the Claude CLI won't be available.
