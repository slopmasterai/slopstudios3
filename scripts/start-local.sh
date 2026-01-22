#!/bin/bash
# Start Slop Studios locally with Claude CLI support
# This script starts the database services and runs the backend natively
# so it can access your authenticated Claude CLI.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==================================="
echo "  Slop Studios - Local Startup"
echo "==================================="
echo ""

# Check for Claude CLI
CLAUDE_PATH="${CLAUDE_CLI_PATH:-$(which claude 2>/dev/null || echo "")}"
if [ -z "$CLAUDE_PATH" ]; then
    echo "Warning: Claude CLI not found in PATH"
    echo "AI features will not work without Claude CLI"
    echo "Install from: https://claude.ai/download"
    echo ""
else
    echo "Claude CLI found: $CLAUDE_PATH"
    # Test if authenticated
    if $CLAUDE_PATH --version >/dev/null 2>&1; then
        echo "Claude CLI version: $($CLAUDE_PATH --version 2>/dev/null || echo 'unknown')"
    fi
    echo ""
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    echo "Install from: https://docker.com"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "Error: Docker is not running"
    echo "Please start Docker Desktop"
    exit 1
fi

echo "Starting database services..."
docker-compose -f docker-compose.local.yml up -d

# Wait for databases to be ready
echo "Waiting for PostgreSQL..."
until docker exec slopstudios-db-local pg_isready -U postgres &>/dev/null; do
    sleep 1
done
echo "PostgreSQL is ready"

echo "Waiting for Redis..."
until docker exec slopstudios-redis-local redis-cli ping &>/dev/null; do
    sleep 1
done
echo "Redis is ready"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.local.example" ]; then
        echo "Creating .env from .env.local.example..."
        cp .env.local.example .env
    else
        echo "Warning: No .env file found"
        echo "Creating minimal .env..."
        cat > .env << 'EOF'
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:devpassword@localhost:5432/slopstudios3
REDIS_URL=redis://localhost:6379
JWT_SECRET=local-dev-secret-change-for-production
APP_SECRET=local-app-secret-change-for-production
CORS_ORIGIN=*
LOG_LEVEL=info
EOF
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

if [ ! -d "client/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd client && npm install && cd ..
fi

# Build frontend
echo ""
echo "Building frontend..."
cd client && npm run build && cd ..

echo ""
echo "==================================="
echo "  Starting Backend Server"
echo "==================================="
echo ""
echo "Backend will be available at: http://localhost:3000"
echo "Frontend served from: http://localhost:3000"
echo ""
echo "To expose to the internet, run in another terminal:"
echo "  ./scripts/start-tunnel.sh"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start backend in development mode
npm run dev
