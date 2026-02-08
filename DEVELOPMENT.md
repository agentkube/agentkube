# Development Guide

This guide walks you through setting up a local development environment for Agentkube. The project has three main components -- a **React/TypeScript frontend**, a **Rust/Tauri desktop shell**, and a **Go backend operator** -- so there are a few moving parts, but we'll get you up and running step by step.

## Table of Contents

- [Prerequisites](#prerequisites)
  - [System Requirements](#system-requirements)
  - [Required Tools](#required-tools)
  - [Platform-Specific Setup](#platform-specific-setup)
- [Getting the Code](#getting-the-code)
- [Installing Dependencies](#installing-dependencies)
  - [Frontend Dependencies](#frontend-dependencies)
  - [Rust / Tauri Dependencies](#rust--tauri-dependencies)
  - [Go Operator Dependencies](#go-operator-dependencies)
- [Running in Development](#running-in-development)
  - [Option 1: Full Tauri Desktop App](#option-1-full-tauri-desktop-app)
  - [Option 2: Frontend Only](#option-2-frontend-only)
  - [Option 3: Go Operator Only](#option-3-go-operator-only)
- [Building for Production](#building-for-production)
  - [Building the Frontend](#building-the-frontend)
  - [Building the Tauri App](#building-the-tauri-app)
  - [Building the Go Operator](#building-the-go-operator)
- [Project Configuration](#project-configuration)
  - [Vite Configuration](#vite-configuration)
  - [Tauri Configuration](#tauri-configuration)
  - [TypeScript Configuration](#typescript-configuration)
  - [Tailwind CSS Configuration](#tailwind-css-configuration)
- [Common Development Tasks](#common-development-tasks)
  - [Adding a New Page](#adding-a-new-page)
  - [Adding a New API Endpoint Handler](#adding-a-new-api-endpoint-handler)
  - [Adding a New Tauri Command](#adding-a-new-tauri-command)
  - [Working with UI Components](#working-with-ui-components)
- [Debugging](#debugging)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

| OS | Minimum Version |
|----|----------------|
| macOS | 10.14 (Mojave) or higher |
| Windows | Windows 10 or higher |
| Linux | Modern distributions (AMD64, ARM64) |

### Required Tools

Install the following before getting started:

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Node.js** | v18+ | Frontend build tooling | [nodejs.org](https://nodejs.org/) |
| **npm** or **pnpm** | Latest | JavaScript package manager | Comes with Node.js / [pnpm.io](https://pnpm.io/) |
| **Rust** | 1.71+ | Tauri desktop shell | [rustup.rs](https://rustup.rs/) |
| **Go** | 1.24+ | Backend operator | [go.dev/dl](https://go.dev/dl/) |
| **Git** | Latest | Version control | [git-scm.com](https://git-scm.com/) |

**Optional but recommended:**

| Tool | Purpose |
|------|---------|
| **kubectl** | Testing Kubernetes operations |
| **Helm** | Testing Helm chart features |
| **Docker** | Running local Kubernetes clusters |
| **minikube** / **kind** / **k3d** | Local Kubernetes cluster for testing |

### Platform-Specific Setup

#### macOS

```bash
# Install Xcode Command Line Tools (required for Rust compilation)
xcode-select --install

# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js, Rust, and Go
brew install node go
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### Windows

1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload (required for Rust)
2. Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10+)
3. Install Node.js from [nodejs.org](https://nodejs.org/)
4. Install Rust from [rustup.rs](https://rustup.rs/)
5. Install Go from [go.dev/dl](https://go.dev/dl/)

#### Linux (Debian/Ubuntu)

```bash
# Install system dependencies required by Tauri
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libwebkit2gtk-4.1-dev \
  javascriptcoregtk-4.1 \
  libsoup-3.0 \
  patchelf

# Install Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Go
wget https://go.dev/dl/go1.24.1.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.1.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
```

#### Linux (Fedora/RHEL)

```bash
# Install system dependencies required by Tauri
sudo dnf install -y \
  gcc \
  gcc-c++ \
  openssl-devel \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  webkit2gtk4.1-devel \
  patchelf

# Install Node.js
sudo dnf install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Go (download from go.dev/dl)
```

---

## Getting the Code

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/agentkube.git
cd agentkube

# Add the upstream remote
git remote add upstream https://github.com/agentkube/agentkube.git

# Verify remotes
git remote -v
```

---

## Installing Dependencies

### Frontend Dependencies

From the project root:

```bash
# Install Node.js dependencies
npm install
```

This installs all frontend dependencies including React, Tailwind CSS, Radix UI, Monaco Editor, xterm.js, and more.

### Rust / Tauri Dependencies

Rust dependencies are managed by Cargo and will be automatically downloaded on first build:

```bash
cd src-tauri

# Download and compile dependencies (this may take a few minutes the first time)
cargo build

# Return to project root
cd ..
```

> **Note:** The first Rust build can take 5-10 minutes as it compiles all dependencies. Subsequent builds are much faster thanks to incremental compilation.

### Go Operator Dependencies

```bash
cd internal/operator

# Download Go module dependencies
go mod download

# Return to project root
cd ../..
```

---

## Running in Development

### Option 1: Full Tauri Desktop App

This runs the complete application -- frontend, Tauri shell, and operator -- as a desktop app with hot-reload:

```bash
# From the project root
npm run tauri dev
```

This command:
1. Starts the Vite dev server on port **5422** with hot-reload
2. Compiles and launches the Tauri desktop application
3. The Tauri app spawns the operator and orchestrator binaries automatically

> **Note:** The operator and orchestrator binaries must be present in `src-tauri/bin/` for the full app to work. During the open-source transition, these may need to be built separately. See [Building the Go Operator](#building-the-go-operator).

### Option 2: Frontend Only

If you're only working on the React frontend:

```bash
# Start the Vite dev server
npm run dev
```

This starts the frontend on [http://localhost:5422](http://localhost:5422). API calls are proxied to the backend services (operator on port 4688, orchestrator on port 4689).

> **Note:** You'll need the operator running separately for full functionality. See Option 3.

### Option 3: Go Operator Only

If you're working on the backend:

```bash
cd internal/operator

# Run directly with Go
go run ./cmd/server/main.go

# Or build and run
make build
./dist/operator
```

The operator starts on port **4688** by default.

---

## Building for Production

### Building the Frontend

```bash
# Type-check and build the frontend
npm run build
```

Output is written to the `dist/` directory.

### Building the Tauri App

```bash
# Build the complete desktop application
npm run tauri build
```

This produces platform-specific installers:
- **macOS:** `.dmg` file in `src-tauri/target/release/bundle/dmg/`
- **Windows:** `.exe` installer in `src-tauri/target/release/bundle/nsis/`
- **Linux:** `.deb` and `.rpm` in `src-tauri/target/release/bundle/`

### Building the Go Operator

```bash
cd internal/operator

# Build for your current platform
./build.sh current
# or
make build

# Build for all platforms
./build.sh all
# or
make build-all

# Build for a specific platform
./build.sh darwin-arm64    # macOS Apple Silicon
./build.sh darwin-amd64    # macOS Intel
./build.sh linux-amd64     # Linux 64-bit
./build.sh windows-amd64   # Windows 64-bit

# Clean build artifacts
make clean
```

Built binaries are placed in `internal/operator/dist/`.

#### Supported Build Targets

| OS | Architecture | Binary Name |
|----|-------------|-------------|
| macOS | ARM64 (Apple Silicon) | `operator-aarch64-apple-darwin` |
| macOS | AMD64 (Intel) | `operator-x86_64-apple-darwin` |
| Linux | AMD64 | `operator-x86_64-unknown-linux-gnu` |
| Linux | ARM64 | `operator-aarch64-unknown-linux-gnu` |
| Linux | 386 | `operator-i686-unknown-linux-gnu` |
| Linux | ARM | `operator-arm-unknown-linux-gnueabihf` |
| Windows | AMD64 | `operator-x86_64-pc-windows-msvc.exe` |
| Windows | ARM64 | `operator-aarch64-pc-windows-msvc.exe` |
| Windows | 386 | `operator-i686-pc-windows-msvc.exe` |

---

## Project Configuration

### Vite Configuration

Defined in `vite.config.ts`:

- **Dev server port:** 5422 (strict -- fails if unavailable)
- **Path alias:** `@` maps to `src/`
- **API proxies:**
  - `/api` -> `http://localhost:7654`
  - `/operator` -> `http://localhost:4688/api/v1`
  - `/orchestrator` -> `http://localhost:4689/orchestrator`
  - `/v2/security` -> `https://scan.agentkube.com/api/v1`
- **Build target:** Chrome 105 (Windows), Safari 13 (macOS/Linux)

### Tauri Configuration

Defined in `src-tauri/tauri.conf.json`:

- **App identifier:** `platform.agentkube.app`
- **Window size:** 1400 x 900 (default)
- **Deep link protocol:** `agentkube://`
- **Bundled resources:** Operator and orchestrator binaries
- **Auto-updater:** Enabled with signature verification

### TypeScript Configuration

Defined in `tsconfig.json`:

- **Target:** ES2021
- **Strict mode:** Enabled
- **Path aliases:** `@/*` maps to `src/*`
- **JSX:** `react-jsx`

### Tailwind CSS Configuration

Defined in `tailwind.config.js`:

- **Dark mode:** Class-based (`class`)
- **Custom fonts:** Inter, DM Sans, Geist, Raleway, Anton
- **Theme:** HSL-based color system with CSS variables
- **Plugins:** `tailwindcss-animate`, `tailwind-scrollbar`

---

## Common Development Tasks

### Adding a New Page

1. Create a new page component in `src/pages/`:

```typescript
// src/pages/MyFeaturePage.tsx
export const MyFeaturePage = () => {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">My Feature</h1>
      {/* Your content here */}
    </div>
  );
};
```

2. Add a route in `src/App.tsx`:

```typescript
import { MyFeaturePage } from "@/pages/MyFeaturePage";

// Inside the router configuration:
<Route path="/dashboard/my-feature" element={<MyFeaturePage />} />
```

3. Add navigation to the sidebar or menu as needed.

### Adding a New API Endpoint Handler

In the Go operator:

1. Create a handler in `internal/operator/internal/handlers/`:

```go
// internal/operator/internal/handlers/myfeature.go
package handlers

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

func MyFeatureHandler(c *gin.Context) {
    // Your handler logic
    c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
```

2. Register the route in `internal/operator/internal/routes/`.

3. Add a corresponding API client function in the frontend at `src/api/`.

### Adding a New Tauri Command

1. Define the command in Rust (`src-tauri/src/lib.rs` or a new module):

```rust
#[tauri::command]
async fn my_command(param: String) -> Result<String, String> {
    // Your logic here
    Ok(format!("Result: {}", param))
}
```

2. Register it in the Tauri builder in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    my_command,
])
```

3. Call it from the frontend:

```typescript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<string>("my_command", { param: "hello" });
```

### Working with UI Components

The project uses [Radix UI](https://www.radix-ui.com/) primitives styled with Tailwind CSS (similar to shadcn/ui). Reusable components live in `src/components/ui/`.

To use existing components:

```typescript
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
```

When creating new UI components, follow the existing patterns in `src/components/ui/`.

---

## Debugging

### Frontend Debugging

- **DevTools:** Press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux) in the Tauri app to open browser DevTools
- **React DevTools:** Install the browser extension for React component inspection
- **Console logs:** Check both the browser console and the terminal running Vite

### Tauri / Rust Debugging

- **Logs:** Tauri logs are written to platform-specific directories:
  - macOS: `~/Library/Logs/platform.agentkube.app/`
  - Linux: `~/.local/share/platform.agentkube.app/logs/`
  - Windows: `%APPDATA%/platform.agentkube.app/logs/`
- **Rust logging:** Use `log::info!()`, `log::error!()`, etc.
- **Build with debug info:** `cargo build` (debug profile is default)

### Go Operator Debugging

- **Structured logging:** The operator uses `zerolog` for structured logging
- **Run with verbose output:** Check the operator's log output in the terminal
- **Test endpoints:** Use `curl` or a tool like Postman to test API endpoints on `http://localhost:4688/api/v1/`

---

## Troubleshooting

### Common Issues

#### `npm run dev` fails with port conflict

Port 5422 is configured as `strictPort`. If another process is using it:

```bash
# Find the process using port 5422
lsof -i :5422

# Kill the process, or change the port in vite.config.ts (not recommended)
```

#### Rust compilation fails

```bash
# Update Rust toolchain
rustup update

# Clean and rebuild
cd src-tauri
cargo clean
cargo build
```

#### Go build fails with dependency errors

```bash
cd internal/operator

# Tidy and re-download dependencies
go mod tidy
go mod download
```

#### Tauri app window is blank

- Check the Vite dev server is running on port 5422
- Check the browser console for JavaScript errors (open DevTools)
- Verify `src-tauri/tauri.conf.json` has the correct `devUrl`

#### Operator binary not found on app startup

The Tauri app expects operator binaries in `src-tauri/bin/operator/`. Build and place them:

```bash
cd internal/operator
./build.sh current

# Copy to the expected location
mkdir -p ../../../src-tauri/bin/operator/
cp dist/operator-* ../../../src-tauri/bin/operator/
```

#### Cross-compilation fails for Go

Ensure CGO is disabled for cross-compilation:

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ./dist/operator-x86_64-unknown-linux-gnu ./cmd/server/main.go
```

#### `WebView2` errors on Windows

Download and install the latest WebView2 runtime from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

### Getting Help

If you're stuck:

1. Search [existing issues](https://github.com/agentkube/agentkube/issues) for similar problems
2. Ask in our [Discord community](https://discord.gg/UxnwzcjMWA)
3. Open a new issue with detailed reproduction steps

---

Happy coding! If something in this guide is unclear or outdated, please open an issue or PR to help improve it.
