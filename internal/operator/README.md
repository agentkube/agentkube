# Operator

Agentkube: Operator API

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Building from Source](#building-from-source)
  - [Using the Build Script](#using-the-build-script)
  - [Manual Building](#manual-building)
  - [Supported Platforms](#supported-platforms)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Development](#development)
  - [Project Structure](#project-structure)
  - [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)


## Requirements

- Go 1.18 or higher

## Installation

### Pre-built Binaries

Download the latest pre-built binary for your platform from the [Releases](https://github.com/agentkube/operator/releases) page.

```bash
# Example for Linux (x86_64)
curl -LO https://github.com/agentkube/operator/releases/latest/download/operator-x86_64-unknown-linux-gnu.tar.gz
tar -xzf operator-x86_64-unknown-linux-gnu.tar.gz
chmod +x operator-x86_64-unknown-linux-gnu
```

### Using Go Install

```bash
go install github.com/yourusername/operator-api/cmd/server@latest
```

## Building from Source

### Using the Build Script

The project includes a comprehensive build script that can compile the application for various platforms.

```bash
# Make the script executable
chmod +x build.sh

# Build for all platforms
./build.sh all

# Build for specific platforms
./build.sh windows      # All Windows architectures
./build.sh darwin       # All macOS architectures
./build.sh linux        # All Linux architectures

# Build for specific architectures
./build.sh windows-amd64   # Windows 64-bit
./build.sh windows-386     # Windows 32-bit
./build.sh windows-arm64   # Windows ARM64
./build.sh darwin-arm64    # macOS ARM64 (Apple Silicon)

# Get help
./build.sh help
```

### Manual Building

If you prefer to build manually, you can use the Go compiler directly:

```bash
# For the current platform
go build -o ./dist/operator ./cmd/server/main.go

# For a specific platform (example: Windows 64-bit)
GOOS=windows GOARCH=amd64 go build -o ./dist/operator-x86_64-pc-windows-msvc.exe ./cmd/server/main.go

# For macOS ARM64 (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o ./dist/operator-aarch64-apple-darwin ./cmd/server/main.go
```

### Supported Platforms

The build system supports compiling for the following platforms:

| OS      | Architectures                  | Binary Name Examples                           |
|---------|--------------------------------|------------------------------------------------|
| Windows | amd64 (64-bit), 386 (32-bit), arm64 | `operator-x86_64-pc-windows-msvc.exe` (64-bit)<br>`operator-i686-pc-windows-msvc.exe` (32-bit)<br>`operator-aarch64-pc-windows-msvc.exe` (ARM64) |
| macOS   | amd64 (Intel), arm64 (Apple Silicon) | `operator-x86_64-apple-darwin` (Intel)<br>`operator-aarch64-apple-darwin` (Apple Silicon) |
| Linux   | amd64 (64-bit), 386 (32-bit), arm64, arm | `operator-x86_64-unknown-linux-gnu` (64-bit)<br>`operator-i686-unknown-linux-gnu` (32-bit)<br>`operator-aarch64-unknown-linux-gnu` (ARM64)<br>`operator-arm-unknown-linux-gnueabihf` (ARM) |



## Usage

### Basic Examples

Starting the server:

```bash
# Start with default settings
./operator

go run ./cmd/server/main.go


```



### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## Troubleshooting

### Common Issues

**Problem**: Server won't start
**Solution**: Check if the port is already in use or if you have the correct permissions.

```bash
# Check if port is in use
lsof -i :8080
# or on Windows
netstat -ano | findstr :8080
```

**Problem**: Cross-compilation fails
**Solution**: Ensure you have the necessary dependencies and CGO is disabled if needed.

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ./dist/operator-x86_64-unknown-linux-gnu ./cmd/server/main.go
```

---

© 2025 Agentkube. All Rights Reserved.