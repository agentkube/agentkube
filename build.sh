#!/usr/bin/env bash
set -e

# TODO optimized binary
# CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags "-s -w -X main.version=$(git describe --tags --always --dirty 2>/dev/null || echo dev) -X main.buildTime=$(date +%FT%T%z)" -o ./dist/agentkube-operator-aarch64-apple-darwin ./cmd/server/main.go
# Variables
BINARY_NAME="agentkube-operator"
MAIN_PATH="./cmd/server/main.go"
DIST_DIR="./dist"
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(date +%FT%T%z)
LDFLAGS="-s -w -X main.version=${VERSION} -X main.buildTime=${BUILD_TIME}"

# Print help message
function show_help {
    echo "Build Script for Operator API"
    echo ""
    echo "Usage: ./build.sh [target]"
    echo ""
    echo "Targets:"
    echo "  all               Build for all platforms (default)"
    echo "  clean             Clean the dist directory"
    echo "  current           Build for the current platform"
    echo "  windows           Build for all Windows architectures"
    echo "  windows-amd64     Build for Windows 64-bit"
    echo "  windows-386       Build for Windows 32-bit"
    echo "  windows-arm64     Build for Windows ARM64"
    echo "  darwin            Build for all macOS architectures"
    echo "  darwin-amd64      Build for macOS Intel 64-bit"
    echo "  darwin-arm64      Build for macOS ARM64 (Apple Silicon)"
    echo "  linux             Build for all Linux architectures"
    echo "  linux-amd64       Build for Linux 64-bit"
    echo "  linux-386         Build for Linux 32-bit"
    echo "  linux-arm64       Build for Linux ARM64"
    echo "  linux-arm         Build for Linux ARM"
    echo "  package           Create distribution packages"
    echo "  help              Show this help message"
    echo ""
}

# Clean the dist directory
function clean {
    echo "Cleaning dist directory..."
    rm -rf ${DIST_DIR}
    mkdir -p ${DIST_DIR}
    echo "Done."
}

# Build for a specific platform
function build {
    local os=$1
    local arch=$2
    local output=$3
    
    echo "Building for ${os}/${arch}..."
    CGO_ENABLED=0 GOOS=${os} GOARCH=${arch} go build -trimpath -ldflags "${LDFLAGS}" -o "${DIST_DIR}/${output}" ${MAIN_PATH}
    echo "Done."
}

# Build Windows binaries
function build_windows {
    build_windows_amd64
    build_windows_386
    build_windows_arm64
}

function build_windows_amd64 {
    build "windows" "amd64" "${BINARY_NAME}-x86_64-pc-windows-msvc.exe"
}

function build_windows_386 {
    build "windows" "386" "${BINARY_NAME}-i686-pc-windows-msvc.exe"
}

function build_windows_arm64 {
    build "windows" "arm64" "${BINARY_NAME}-aarch64-pc-windows-msvc.exe"
}

# Build macOS binaries
function build_darwin {
    build_darwin_amd64
    build_darwin_arm64
}

function build_darwin_amd64 {
    build "darwin" "amd64" "${BINARY_NAME}-x86_64-apple-darwin"
}

function build_darwin_arm64 {
    build "darwin" "arm64" "${BINARY_NAME}-aarch64-apple-darwin"
}

# Build Linux binaries
function build_linux {
    build_linux_amd64
    build_linux_386
    build_linux_arm64
    build_linux_arm
}

function build_linux_amd64 {
    build "linux" "amd64" "${BINARY_NAME}-x86_64-unknown-linux-gnu"
}

function build_linux_386 {
    build "linux" "386" "${BINARY_NAME}-i686-unknown-linux-gnu"
}

function build_linux_arm64 {
    build "linux" "arm64" "${BINARY_NAME}-aarch64-unknown-linux-gnu"
}

function build_linux_arm {
    build "linux" "arm" "${BINARY_NAME}-arm-unknown-linux-gnueabihf"
}

# Build for current platform
function build_current {
    echo "Building for current platform..."
    CGO_ENABLED=0 go build -trimpath -ldflags "${LDFLAGS}" -o "${DIST_DIR}/${BINARY_NAME}" ${MAIN_PATH}
    echo "Done."
}

# Build all platforms
function build_all {
    build_windows
    build_darwin
    build_linux
    echo "All builds completed successfully."
}

# Create packages
function package {
    echo "Creating distribution packages..."
    cd ${DIST_DIR}
    for file in $(ls); do
        if [ -f "$file" ]; then
            tar -czf "$file.tar.gz" "$file"
            if [[ "$file" == *.exe ]]; then
                zip -q "$file.zip" "$file"
            fi
        fi
    done
    cd ..
    echo "Done."
}

# Parse command line arguments
if [ $# -eq 0 ]; then
    # No arguments, build all by default
    clean
    build_all
else
    # Process arguments
    case "$1" in
        "clean")
            clean
            ;;
        "current")
            build_current
            ;;
        "windows")
            build_windows
            ;;
        "windows-amd64")
            build_windows_amd64
            ;;
        "windows-386")
            build_windows_386
            ;;
        "windows-arm64")
            build_windows_arm64
            ;;
        "darwin")
            build_darwin
            ;;
        "darwin-amd64")
            build_darwin_amd64
            ;;
        "darwin-arm64")
            build_darwin_arm64
            ;;
        "linux")
            build_linux
            ;;
        "linux-amd64")
            build_linux_amd64
            ;;
        "linux-386")
            build_linux_386
            ;;
        "linux-arm64")
            build_linux_arm64
            ;;
        "linux-arm")
            build_linux_arm
            ;;
        "all")
            clean
            build_all
            ;;
        "package")
            package
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            echo "Unknown target: $1"
            echo "Use './build.sh help' to see available targets."
            exit 1
            ;;
    esac
fi