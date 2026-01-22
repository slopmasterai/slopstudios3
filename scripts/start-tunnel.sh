#!/bin/bash
# Start Cloudflare Tunnel to expose your local server to the internet
# This gives your friends a public HTTPS URL to access your server.
#
# Prerequisites:
#   brew install cloudflared
#
# Usage:
#   ./scripts/start-tunnel.sh
#   # Share the printed URL with friends!

set -e

PORT="${PORT:-3000}"

echo "==================================="
echo "  Cloudflare Tunnel"
echo "==================================="
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "cloudflared is not installed."
    echo ""
    echo "To install on macOS:"
    echo "  brew install cloudflared"
    echo ""
    echo "To install on Linux:"
    echo "  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared"
    echo "  chmod +x cloudflared"
    echo "  sudo mv cloudflared /usr/local/bin/"
    echo ""
    exit 1
fi

# Check if backend is running
if ! curl -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
    echo "Warning: Backend doesn't seem to be running on port $PORT"
    echo "Make sure to start it first with: ./scripts/start-local.sh"
    echo ""
    echo "Starting tunnel anyway..."
    echo ""
fi

echo "Starting Cloudflare Quick Tunnel..."
echo "This creates a temporary public URL for your server."
echo ""
echo "The URL will appear below. Share it with your friends!"
echo "Note: URL changes each time you restart the tunnel."
echo ""
echo "For a permanent URL, set up a Cloudflare account and create a named tunnel."
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""
echo "-----------------------------------"

# Start the tunnel
# The --url flag creates a quick tunnel without needing a Cloudflare account
cloudflared tunnel --url "http://localhost:$PORT"
