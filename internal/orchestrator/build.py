import os
import platform
import subprocess
import argparse

# Platform configuration mapping
PLATFORM_CONFIG = {
    # Windows platforms
    "win64": {
        "name": "agentkube-orchestrator-x86_64-pc-windows-msvc.exe",
        "system": "Windows"
    },
    "win32": {
        "name": "agentkube-orchestrator-i686-pc-windows-msvc.exe",
        "system": "Windows"
    },
    "win-arm": {
        "name": "agentkube-orchestrator-aarch64-pc-windows-msvc.exe",
        "system": "Windows"
    },
    # macOS platforms
    "mac": {
        "name": "agentkube-orchestrator-x86_64-apple-darwin",
        "system": "Darwin"
    },
    "mac-arm": {
        "name": "agentkube-orchestrator-aarch64-apple-darwin",
        "system": "Darwin"
    },
    # Linux platforms
    "linux": {
        "name": "agentkube-orchestrator-x86_64-unknown-linux-gnu",
        "system": "Linux"
    },
    "linux-arm": {
        "name": "agentkube-orchestrator-aarch64-unknown-linux-gnu",
        "system": "Linux"
    }
}

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="Build executable for different platforms")
    parser.add_argument("--platform", type=str, choices=list(PLATFORM_CONFIG.keys()),
                        help="Target platform for the build (e.g., win64, win32, win-arm, mac, mac-arm, linux, linux-arm)")
    return parser.parse_args()

def get_platform_config(platform_arg):
    """Get platform configuration based on argument or current system"""
    if platform_arg:
        return PLATFORM_CONFIG.get(platform_arg)
    
    # Auto-detect current system and architecture
    system = platform.system()
    machine = platform.machine().lower()
    
    if system == "Windows":
        if "arm" in machine or "aarch" in machine:
            return PLATFORM_CONFIG["win-arm"]
        elif machine == "x86" or machine == "i686":
            return PLATFORM_CONFIG["win32"]
        else:
            return PLATFORM_CONFIG["win64"]
    elif system == "Darwin":  # macOS
        if "arm" in machine or "aarch" in machine:
            return PLATFORM_CONFIG["mac-arm"]
        else:
            return PLATFORM_CONFIG["mac"]
    elif system == "Linux":
        if "arm" in machine or "aarch" in machine:
            return PLATFORM_CONFIG["linux-arm"]
        else:
            return PLATFORM_CONFIG["linux"]
    
    # Default to win64 if detection fails
    return PLATFORM_CONFIG["win64"]

def build_executable(platform_config):
    """Build executable for the FastAPI server using PyInstaller"""
    exe_name = platform_config["name"]
    target_system = platform_config["system"]
    
    print(f"Starting build process for {exe_name}...")
    print(f"Target system: {target_system}")
    
    # PyInstaller command
    cmd = [
        "pyinstaller",
        "--onefile",  # Create a single executable file
        "--name", exe_name,  # Name of the executable
        "--add-data", "README.md:.",  # Include README
        # Add hidden imports for FastAPI and Uvicorn to ensure they're properly packaged
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",
        "--hidden-import", "uvicorn.lifespan.off",
        "--hidden-import", "fastapi",
        "main.py"
    ]
    
    # Windows-specific separator adjustment
    if os.name == 'nt':
        # Use semicolon instead of colon for Windows
        for i, item in enumerate(cmd):
            if item == "--add-data":
                cmd[i+1] = cmd[i+1].replace(":", ";")
    
    # Execute PyInstaller
    try:
        subprocess.run(cmd, check=True)
        print(f"Build completed successfully. Executable '{exe_name}' is in the 'dist' folder.")
    except subprocess.CalledProcessError as e:
        print(f"Build failed with error: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    # Parse command line arguments
    args = parse_arguments()
    
    # Get platform configuration
    platform_config = get_platform_config(args.platform)
    
    # Create a simple README file if it doesn't exist
    if not os.path.exists("README.md"):
        with open("README.md", "w") as f:
            f.write("# FastAPI Server\n\nA simple async REST API built with FastAPI.")
    
    # Build the executable
    build_executable(platform_config)