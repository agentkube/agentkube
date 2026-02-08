# Contributing to Agentkube

Thank you for your interest in contributing to Agentkube! We appreciate every contribution, whether it's a bug report, feature request, documentation improvement, or code change. This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Improving Documentation](#improving-documentation)
  - [Contributing Code](#contributing-code)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Development Workflow](#development-workflow)
  - [Branching Strategy](#branching-strategy)
  - [Commit Messages](#commit-messages)
  - [Pull Requests](#pull-requests)
- [Coding Standards](#coding-standards)
  - [TypeScript / React](#typescript--react)
  - [Rust (Tauri)](#rust-tauri)
  - [Go (Operator)](#go-operator)
- [Testing](#testing)
- [Issue Labels](#issue-labels)
- [Community](#community)
- [License](#license)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [info@agentkube.com](mailto:info@agentkube.com).

---

## How Can I Contribute?

### Reporting Bugs

Found a bug? Please help us by [opening an issue](https://github.com/agentkube/agentkube/issues/new?template=bug_report.md) using the **Bug Report** template.

Before opening a new issue:

1. **Search existing issues** to avoid duplicates
2. **Check the latest release** to confirm the bug still exists
3. **Gather information** including:
   - Agentkube version (check Settings > Updates)
   - Operating system and version
   - Kubernetes cluster type and version
   - Steps to reproduce the issue
   - Expected vs. actual behavior
   - Screenshots or logs, if applicable

### Suggesting Features

Have an idea for Agentkube? [Open a feature request](https://github.com/agentkube/agentkube/issues/new?template=feature_request.md) using the **Feature Request** template.

A great feature request includes:

- The problem you're trying to solve
- Your proposed solution and how you'd use it
- Any workarounds you're currently using
- Where in the application you imagine it living

### Improving Documentation

Documentation improvements are always welcome! This includes:

- Fixing typos or unclear wording
- Adding examples or tutorials
- Improving inline code comments
- Updating outdated documentation

### Contributing Code

Ready to write code? Here's the general process:

1. Find or create an issue to work on
2. Comment on the issue to let others know you're working on it
3. Fork the repository and set up your [development environment](DEVELOPMENT.md)
4. Create a feature branch from `main`
5. Make your changes with clear, atomic commits
6. Open a pull request

---

## Development Setup

For detailed instructions on setting up your development environment, see the **[Development Guide](DEVELOPMENT.md)**.

Quick summary of prerequisites:

| Component | Requirement |
|-----------|-------------|
| Node.js | v18+ |
| Rust | 1.71+ |
| Go | 1.24+ |
| Package Manager | npm or pnpm |
| OS | macOS 10.14+, Windows 10+, or modern Linux |

---

## Project Architecture

Agentkube is a multi-language desktop application built with three main components:

```
agentkube/
├── src/                    # Frontend (React + TypeScript)
│   ├── api/                #   API client functions
│   ├── components/         #   Reusable React components
│   ├── contexts/           #   React Context providers (state management)
│   ├── hooks/              #   Custom React hooks
│   ├── pages/              #   Page-level components (route targets)
│   ├── types/              #   TypeScript type definitions
│   ├── utils/              #   Utility functions
│   ├── styles/             #   Global CSS files
│   ├── locales/            #   i18n translation files
│   ├── App.tsx             #   Main app with routing
│   └── main.tsx            #   Entry point
│
├── src-tauri/              # Desktop shell (Rust + Tauri 2.0)
│   ├── src/
│   │   ├── lib.rs          #   Tauri app builder, command handlers
│   │   ├── main.rs         #   Entry point, spawns backend processes
│   │   ├── terminal/       #   PTY/terminal management
│   │   ├── browser/        #   Webview management
│   │   └── network_*.rs    #   Network monitoring
│   ├── capabilities/       #   Tauri security capabilities
│   └── tauri.conf.json     #   Tauri configuration
│
├── internal/
│   └── operator/           # Backend API server (Go + Gin)
│       ├── cmd/server/     #   Entry point
│       ├── internal/       #   HTTP handlers, routes, multiplexer
│       └── pkg/            #   Business logic packages
│           ├── helm/       #     Helm chart management
│           ├── search/     #     Full-text search (Bleve)
│           ├── metrics/    #     Prometheus metrics collection
│           ├── exec/       #     Kubernetes exec utilities
│           ├── canvas/     #     Dependency graph visualization
│           ├── dispatchers/#     Notification dispatchers
│           └── ...         #     (and more)
│
├── .github/                # CI/CD workflows, issue templates
├── assets/                 # Marketing and branding assets
└── public/                 # Static assets (splash screen)
```

### How the Components Interact

1. **Tauri (Rust)** is the desktop shell. It creates the application window, manages the lifecycle, and spawns the Go operator and orchestrator binaries as child processes on startup.
2. **Frontend (React)** runs inside the Tauri webview. It communicates with the operator backend via HTTP/WebSocket proxied through Vite's dev server (or directly in production).
3. **Operator (Go)** is the backend API server running on `localhost:4688`. It handles all Kubernetes operations, search indexing, Helm management, security scanning, and more.

### Key Port Assignments

| Port | Service | Description |
|------|---------|-------------|
| 5422 | Vite Dev Server | Frontend hot-reload server |
| 4688 | Operator API | Go backend REST/WebSocket API |
| 4689 | Orchestrator | AI orchestrator service |

---

## Development Workflow

### Branching Strategy

- `main` is the primary branch and should always be in a deployable state
- Create feature branches from `main` using the naming convention:
  - `feature/short-description` for new features
  - `fix/short-description` for bug fixes
  - `docs/short-description` for documentation changes
  - `refactor/short-description` for code refactoring
  - `chore/short-description` for maintenance tasks

### Commit Messages

We follow a conventional-ish commit style. Use clear, descriptive commit messages:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` / `ft` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `refactor` - Code refactoring (no feature/fix)
- `chore` - Maintenance, dependencies, tooling
- `test` - Adding or updating tests
- `style` - Formatting, whitespace (no code change)
- `perf` - Performance improvements

**Scopes (optional):**
- `frontend` - React/TypeScript frontend
- `tauri` - Rust/Tauri desktop shell
- `operator` - Go backend operator
- `helm` - Helm integration
- `security` - Security scanning features
- `ui` - UI/UX changes
- `chore` - Build/tooling changes

**Examples:**

```
feat(frontend): add resource dependency graph visualization
fix(operator): resolve WebSocket connection leak on namespace switch
docs: update contribution guide with setup instructions
chore: bump React to 18.2.0
```

### Pull Requests

When opening a pull request:

1. **Fill out the PR description** explaining:
   - What the change does and why
   - How you tested it
   - Screenshots/recordings for UI changes
   - Any breaking changes

2. **Keep PRs focused** - one logical change per PR. Large changes should be split into smaller, reviewable PRs.

3. **Ensure your code:**
   - Builds without errors (`npm run build`)
   - Passes any existing tests
   - Follows the coding standards below
   - Is properly formatted (`npm run format`)

4. **Respond to review feedback** promptly and constructively.

5. **PR titles** should follow the same convention as commit messages:
   ```
   feat(frontend): add cluster health overview widget
   ```

---

## Coding Standards

### TypeScript / React

- **Framework:** React 18 with TypeScript (strict mode)
- **Styling:** Tailwind CSS with dark mode support (class-based)
- **Components:** Use functional components with hooks
- **State management:** React Context API (see `src/contexts/`)
- **Routing:** React Router DOM with `HashRouter`
- **Path aliases:** Use `@/` to reference `src/` (e.g., `import { Button } from "@/components/ui/button"`)

**Style guidelines:**

```typescript
// Use named exports for components
export const MyComponent = () => { ... };

// Use TypeScript interfaces for props
interface MyComponentProps {
  title: string;
  onAction: () => void;
}

// Use the cn() utility for conditional Tailwind classes
import { cn } from "@/lib/utils";
<div className={cn("base-class", isActive && "active-class")} />
```

**Formatting:**
- Prettier handles formatting automatically. Run `npm run format` before committing.
- Import sorting is handled by `@ianvs/prettier-plugin-sort-imports`.
- Tailwind class sorting is handled by `prettier-plugin-tailwindcss`.

### Rust (Tauri)

- **Edition:** Rust 2021
- **Minimum Rust version:** 1.71
- **Style:** Follow standard Rust conventions (`rustfmt`)
- Use `anyhow::Result` for error handling where appropriate
- Tauri commands should be registered in `src-tauri/src/lib.rs`

```rust
// Format your code with rustfmt
cargo fmt

// Check for common mistakes
cargo clippy
```

### Go (Operator)

- **Go version:** 1.24+
- **Web framework:** Gin
- **Style:** Follow standard Go conventions (`gofmt`, `go vet`)
- Handlers go in `internal/operator/internal/handlers/`
- Business logic packages go in `internal/operator/pkg/`
- Routes are defined in `internal/operator/internal/routes/`

```bash
# Format Go code
gofmt -w .

# Run static analysis
go vet ./...
```

---

## Testing

### Frontend

```bash
# TypeScript type checking
npx tsc --noEmit
```

### Go Operator

```bash
cd internal/operator

# Run all tests
go test -v ./...

# Run tests for a specific package
go test -v ./pkg/helm/...
```

### Rust (Tauri)

```bash
cd src-tauri

# Run Rust tests
cargo test
```

### Manual Testing Checklist

When testing UI or integration changes, verify:

- [ ] Application starts without errors
- [ ] Cluster connection works
- [ ] Navigation between pages functions correctly
- [ ] Dark and light themes render properly
- [ ] No console errors in the DevTools
- [ ] Feature works across namespace switches
- [ ] Responsive layout is maintained

---

## Issue Labels

Issues and PRs are automatically labeled. Here are the key labels:

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `enhancement` | New feature or improvement |
| `documentation` | Documentation updates |
| `good first issue` | Good for newcomers |
| `help wanted` | Extra attention needed |
| `security` | Security-related issues |
| `performance` | Performance improvements |
| `rust` | Relates to Rust/Tauri code |
| `backend` | Relates to Go operator |
| `ui` | User interface changes |
| `dependencies` | Dependency updates |
| `high-priority` | Urgent issues |

Look for issues labeled **`good first issue`** or **`help wanted`** if you're new to the project.

---

## Community

- **Discord:** Join our community at [discord.gg/UxnwzcjMWA](https://discord.gg/UxnwzcjMWA)
- **Issue Tracker:** [github.com/agentkube/agentkube/issues](https://github.com/agentkube/agentkube/issues)
- **Email:** [info@agentkube.com](mailto:info@agentkube.com)
- **Website:** [agentkube.com](https://agentkube.com)
- **Documentation:** [docs.agentkube.com](https://docs.agentkube.com)

---

## License

By contributing to Agentkube, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).

---

Thank you for helping make Agentkube better! We look forward to your contributions.
