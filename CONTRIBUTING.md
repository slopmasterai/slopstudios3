# Contributing to Slop Studios 3

Thank you for your interest in contributing to Slop Studios 3! This document
provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)

## Code of Conduct

Please be respectful and professional in all interactions. We are committed to
providing a welcoming and inclusive environment for all contributors.

## Getting Started

### Prerequisites

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment (see [README.md](README.md))

### First-time Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/slopstudios3.git
cd slopstudios3

# Add upstream remote
git remote add upstream https://github.com/slopstudios/slopstudios3.git

# Install dependencies
npm install

# Set up pre-commit hooks
npm run prepare
```

## Development Workflow

### 1. Create a Branch

Always create a new branch from `develop` for your work:

```bash
# Sync with upstream
git fetch upstream
git checkout develop
git merge upstream/develop

# Create feature branch
git checkout -b feature/your-feature-name
```

### 2. Branch Naming Convention

Use descriptive branch names with prefixes:

- `feature/` - New features (e.g., `feature/user-authentication`)
- `fix/` - Bug fixes (e.g., `fix/login-validation`)
- `hotfix/` - Urgent production fixes (e.g., `hotfix/security-patch`)
- `docs/` - Documentation changes (e.g., `docs/api-reference`)
- `refactor/` - Code refactoring (e.g., `refactor/database-layer`)
- `test/` - Test additions/modifications (e.g., `test/auth-coverage`)

### 3. Make Your Changes

- Write clean, well-documented code
- Follow the coding standards
- Add tests for new functionality
- Update documentation as needed

### 4. Test Your Changes

```bash
# Run all tests
npm run test

# Run linter
npm run lint

# Run type checker
npm run typecheck

# Check formatting
npm run format:check
```

### 5. Commit Your Changes

Follow the [commit guidelines](#commit-guidelines) below.

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Coding Standards

### General Principles

- Write self-documenting code with clear variable and function names
- Keep functions small and focused on a single responsibility
- Prefer composition over inheritance
- Avoid premature optimization
- Follow the DRY (Don't Repeat Yourself) principle

### TypeScript/JavaScript

- Use TypeScript for all new code
- Enable strict mode
- Define explicit types for function parameters and return values
- Use interfaces for object shapes
- Prefer `const` over `let`, avoid `var`
- Use async/await over callbacks or raw promises

### Formatting

This project uses Prettier for code formatting. Run `npm run format` before
committing.

```javascript
// Good
const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

// Bad
const calculateTotal = (items:Item[]) : number => { return items.reduce((sum,item)=>sum+item.price,0) }
```

### File Organization

- One component/class per file
- Group related files in directories
- Use index files for clean exports
- Keep test files adjacent to source files or in parallel structure

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/)
specification.

### Commit Message Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, semicolons, etc.)
- `refactor` - Code refactoring without functionality changes
- `perf` - Performance improvements
- `test` - Adding or modifying tests
- `build` - Build system or external dependency changes
- `ci` - CI configuration changes
- `chore` - Other changes that don't modify src or test files

### Examples

```bash
# Feature
feat(auth): add password reset functionality

# Bug fix
fix(api): handle null response in user endpoint

# Documentation
docs(readme): update installation instructions

# With body and footer
feat(payment): implement Stripe integration

Added support for credit card payments using Stripe API.
Includes webhook handling for payment events.

Closes #123
```

### Rules

- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize the first letter
- No period at the end of subject line
- Keep subject line under 72 characters
- Use body for detailed explanation when needed

## Pull Request Process

### Before Submitting

- [ ] All tests pass locally
- [ ] Linting passes with no errors
- [ ] Type checking passes
- [ ] Code is formatted correctly
- [ ] Documentation is updated
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with `develop`

### PR Title

Follow the same format as commit messages:

```
feat(component): add new feature description
```

### PR Description

Use the pull request template. Include:

- Summary of changes
- Related issue numbers
- Testing performed
- Screenshots (for UI changes)
- Breaking changes (if any)

### Review Process

1. Submit your PR
2. Automated checks run (CI pipeline)
3. Request review from maintainers
4. Address review feedback
5. Once approved, PR will be merged

## Code Review Guidelines

### For Authors

- Keep PRs small and focused
- Respond to feedback promptly
- Don't take feedback personally
- Ask for clarification if needed
- Update your PR based on feedback

### For Reviewers

- Be respectful and constructive
- Explain the "why" behind suggestions
- Distinguish between required changes and suggestions
- Approve when changes meet standards
- Review promptly (within 24-48 hours)

### What to Look For

- Correctness of implementation
- Test coverage
- Code clarity and maintainability
- Performance implications
- Security considerations
- Documentation completeness

## Questions?

If you have questions about contributing, feel free to:

- Open a discussion on GitHub
- Ask in the PR comments
- Contact the maintainers

Thank you for contributing!
