#!/bin/bash

# ===========================================
# Slop Studios 3 - Development Setup Script
# ===========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Header
echo ""
echo "==========================================="
echo "  Slop Studios 3 - Development Setup"
echo "==========================================="
echo ""

# Check Node.js
print_status "Checking Node.js installation..."
if command_exists node; then
    NODE_VERSION=$(node -v)
    print_success "Node.js found: $NODE_VERSION"

    # Check if version is >= 20
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
    if [ "$MAJOR_VERSION" -lt 20 ]; then
        print_warning "Node.js version 20+ is recommended. Current: $NODE_VERSION"
        print_status "Consider using nvm to install the correct version:"
        echo "  nvm install 20"
        echo "  nvm use 20"
    fi
else
    print_error "Node.js is not installed!"
    print_status "Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

# Check npm
print_status "Checking npm installation..."
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    print_success "npm found: v$NPM_VERSION"
else
    print_error "npm is not installed!"
    exit 1
fi

# Check Git
print_status "Checking Git installation..."
if command_exists git; then
    GIT_VERSION=$(git --version)
    print_success "Git found: $GIT_VERSION"
else
    print_error "Git is not installed!"
    print_status "Please install Git from https://git-scm.com/"
    exit 1
fi

# Check Docker (optional)
print_status "Checking Docker installation..."
if command_exists docker; then
    DOCKER_VERSION=$(docker --version)
    print_success "Docker found: $DOCKER_VERSION"
else
    print_warning "Docker is not installed. It's optional but recommended for containerized development."
fi

# Install dependencies
print_status "Installing npm dependencies..."
npm install

if [ $? -eq 0 ]; then
    print_success "Dependencies installed successfully!"
else
    print_error "Failed to install dependencies"
    exit 1
fi

# Setup environment file
if [ ! -f .env ]; then
    print_status "Creating .env file from template..."
    cp .env.example .env
    print_success ".env file created. Please update it with your configuration."
else
    print_status ".env file already exists, skipping..."
fi

# Setup Husky (git hooks)
print_status "Setting up Git hooks with Husky..."
npm run prepare 2>/dev/null || print_warning "Husky setup skipped (may not be in a git repository)"

# Verify TypeScript compilation
print_status "Verifying TypeScript configuration..."
npm run typecheck 2>/dev/null

if [ $? -eq 0 ]; then
    print_success "TypeScript configuration is valid!"
else
    print_warning "TypeScript check had issues - this is expected for a new project"
fi

# Summary
echo ""
echo "==========================================="
echo "  Setup Complete!"
echo "==========================================="
echo ""
print_success "Development environment is ready!"
echo ""
echo "Next steps:"
echo "  1. Update .env with your configuration"
echo "  2. Run 'npm run dev' to start development server"
echo "  3. Run 'npm test' to run tests"
echo ""
echo "Available commands:"
echo "  npm run dev        - Start development server"
echo "  npm run build      - Build for production"
echo "  npm test           - Run tests"
echo "  npm run lint       - Run linter"
echo "  npm run format     - Format code"
echo ""
