# Makefile for Operator API
# Supports building for various platforms and architectures

# Variables
BINARY_NAME := operator
MAIN_PATH := ./cmd/server/main.go
DIST_DIR := ./dist
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date +%FT%T%z)
LDFLAGS := -ldflags "-X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)"

# Default target
.PHONY: all
all: clean build-all

# Clean the dist directory
.PHONY: clean
clean:
	@echo "Cleaning dist directory..."
	@rm -rf $(DIST_DIR)
	@mkdir -p $(DIST_DIR)
	@echo "Done."

# Build for the current platform
.PHONY: build
build:
	@echo "Building for current platform..."
	@go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "Done."

# Build for all platforms
.PHONY: build-all
build-all: build-windows build-darwin build-linux
	@echo "All builds completed successfully."

# Windows builds
.PHONY: build-windows
build-windows: build-windows-amd64 build-windows-386 build-windows-arm64

.PHONY: build-windows-amd64
build-windows-amd64:
	@echo "Building for Windows (amd64)..."
	@GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-x86_64-pc-windows-msvc.exe $(MAIN_PATH)
	@echo "Done."

.PHONY: build-windows-386
build-windows-386:
	@echo "Building for Windows (386)..."
	@GOOS=windows GOARCH=386 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-i686-pc-windows-msvc.exe $(MAIN_PATH)
	@echo "Done."

.PHONY: build-windows-arm64
build-windows-arm64:
	@echo "Building for Windows (arm64)..."
	@GOOS=windows GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-aarch64-pc-windows-msvc.exe $(MAIN_PATH)
	@echo "Done."

# macOS builds
.PHONY: build-darwin
build-darwin: build-darwin-amd64 build-darwin-arm64

.PHONY: build-darwin-amd64
build-darwin-amd64:
	@echo "Building for macOS (amd64)..."
	@GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-x86_64-apple-darwin $(MAIN_PATH)
	@echo "Done."

.PHONY: build-darwin-arm64
build-darwin-arm64:
	@echo "Building for macOS (arm64)..."
	@GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-aarch64-apple-darwin $(MAIN_PATH)
	@echo "Done."

# Linux builds
.PHONY: build-linux
build-linux: build-linux-amd64 build-linux-386 build-linux-arm64 build-linux-arm

.PHONY: build-linux-amd64
build-linux-amd64:
	@echo "Building for Linux (amd64)..."
	@GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-x86_64-unknown-linux-gnu $(MAIN_PATH)
	@echo "Done."

.PHONY: build-linux-386
build-linux-386:
	@echo "Building for Linux (386)..."
	@GOOS=linux GOARCH=386 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-i686-unknown-linux-gnu $(MAIN_PATH)
	@echo "Done."

.PHONY: build-linux-arm64
build-linux-arm64:
	@echo "Building for Linux (arm64)..."
	@GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-aarch64-unknown-linux-gnu $(MAIN_PATH)
	@echo "Done."

.PHONY: build-linux-arm
build-linux-arm:
	@echo "Building for Linux (arm)..."
	@GOOS=linux GOARCH=arm go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-arm-unknown-linux-gnueabihf $(MAIN_PATH)
	@echo "Done."

# Package builds (adjust as needed)
.PHONY: package
package: build-all
	@echo "Creating distribution packages..."
	@cd $(DIST_DIR) && \
		for file in $$(ls); do \
			if [ -f "$$file" ]; then \
				tar -czf "$$file.tar.gz" "$$file"; \
				if [[ "$$file" == *.exe ]]; then \
					zip -q "$$file.zip" "$$file"; \
				fi; \
			fi; \
		done
	@echo "Done."

# Run the application
.PHONY: run
run: build
	@echo "Running the application..."
	@$(DIST_DIR)/$(BINARY_NAME)

# Install dependencies
.PHONY: deps
deps:
	@echo "Installing dependencies..."
	@go mod download
	@echo "Done."

# Test the application
.PHONY: test
test:
	@echo "Running tests..."
	@go test -v ./...
	@echo "Done."

# Show help
.PHONY: help
help:
	@echo "Operator API Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  build            Build for the current platform"
	@echo "  build-all        Build for all platforms"
	@echo "  build-windows    Build for all Windows architectures"
	@echo "  build-darwin     Build for all macOS architectures"
	@echo "  build-linux      Build for all Linux architectures"
	@echo "  clean            Clean the dist directory"
	@echo "  deps             Install dependencies"
	@echo "  package          Create distribution packages"
	@echo "  run              Run the application"
	@echo "  test             Run tests"
	@echo "  help             Show this help message"