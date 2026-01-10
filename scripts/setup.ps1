# ===========================================
# Slop Studios 3 - Development Setup Script (Windows)
# ===========================================

$ErrorActionPreference = "Stop"

# Colors
function Write-Status { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

# Header
Write-Host ""
Write-Host "==========================================="
Write-Host "  Slop Studios 3 - Development Setup"
Write-Host "==========================================="
Write-Host ""

# Check Node.js
Write-Status "Checking Node.js installation..."
try {
    $nodeVersion = node -v
    Write-Success "Node.js found: $nodeVersion"

    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 20) {
        Write-Warning "Node.js version 20+ is recommended. Current: $nodeVersion"
        Write-Status "Consider using nvm-windows to install the correct version"
    }
} catch {
    Write-Error "Node.js is not installed!"
    Write-Status "Please install Node.js 20+ from https://nodejs.org/"
    exit 1
}

# Check npm
Write-Status "Checking npm installation..."
try {
    $npmVersion = npm -v
    Write-Success "npm found: v$npmVersion"
} catch {
    Write-Error "npm is not installed!"
    exit 1
}

# Check Git
Write-Status "Checking Git installation..."
try {
    $gitVersion = git --version
    Write-Success "Git found: $gitVersion"
} catch {
    Write-Error "Git is not installed!"
    Write-Status "Please install Git from https://git-scm.com/"
    exit 1
}

# Check Docker (optional)
Write-Status "Checking Docker installation..."
try {
    $dockerVersion = docker --version
    Write-Success "Docker found: $dockerVersion"
} catch {
    Write-Warning "Docker is not installed. It's optional but recommended."
}

# Install dependencies
Write-Status "Installing npm dependencies..."
npm install

if ($LASTEXITCODE -eq 0) {
    Write-Success "Dependencies installed successfully!"
} else {
    Write-Error "Failed to install dependencies"
    exit 1
}

# Setup environment file
if (!(Test-Path .env)) {
    Write-Status "Creating .env file from template..."
    Copy-Item .env.example .env
    Write-Success ".env file created. Please update it with your configuration."
} else {
    Write-Status ".env file already exists, skipping..."
}

# Setup Husky
Write-Status "Setting up Git hooks with Husky..."
try {
    npm run prepare 2>$null
} catch {
    Write-Warning "Husky setup skipped"
}

# Verify TypeScript
Write-Status "Verifying TypeScript configuration..."
npm run typecheck 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Success "TypeScript configuration is valid!"
} else {
    Write-Warning "TypeScript check had issues - expected for new project"
}

# Summary
Write-Host ""
Write-Host "==========================================="
Write-Host "  Setup Complete!"
Write-Host "==========================================="
Write-Host ""
Write-Success "Development environment is ready!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Update .env with your configuration"
Write-Host "  2. Run 'npm run dev' to start development server"
Write-Host "  3. Run 'npm test' to run tests"
Write-Host ""
