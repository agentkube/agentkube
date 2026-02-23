import os
import json
from pathlib import Path
import logging
import platform

# Setup logging
logger = logging.getLogger(__name__)

def setup_config_directory():
    """
    Set up the .agentkube directory and configuration files in the user's home directory.
    Creates the directory and default configuration files if they don't exist.
    
    Returns:
        tuple: (agentkube_dir, settings_path, mcp_path) - Path objects for the created directories and files
    """
    home_dir = Path.home()

    agentkube_dir = home_dir / '.agentkube'
    settings_path = agentkube_dir / 'settings.json'
    mcp_path = agentkube_dir / 'mcp.json'
    
    # Create .agentkube directory if it doesn't exist
    if not agentkube_dir.exists():
        logger.info(f"Creating .agentkube directory at {agentkube_dir}")
        agentkube_dir.mkdir(parents=True, exist_ok=True)
    
    # Create logs directory
    logs_dir = agentkube_dir / 'logs'
    if not logs_dir.exists():
        logger.info(f"Creating logs directory at {logs_dir}")
        logs_dir.mkdir(parents=True, exist_ok=True)
    
    # Create rules directory
    rules_dir = agentkube_dir / 'rules'
    if not rules_dir.exists():
        logger.info(f"Creating rules directory at {rules_dir}")
        rules_dir.mkdir(parents=True, exist_ok=True)
    
    # Get kubeconfig path based on OS
    kubeconfig_path = get_kubeconfig_path()
    
    # Create settings.json if it doesn't exist
    if not settings_path.exists():
        logger.info(f"Creating default settings.json at {settings_path}")
        default_settings = get_default_settings(home_dir, agentkube_dir, kubeconfig_path)
        
        with open(settings_path, 'w') as f:
            json.dump(default_settings, f, indent=2)
    else:
        logger.info(f"Settings file exists at {settings_path}")
        
        # If settings file exists, check and update kubeconfig path if needed
        try:
            with open(settings_path, 'r') as f:
                settings = json.load(f)
            
            # Update kubeconfig path if it's for a different user or system
            current_path = settings.get("kubeconfig", {}).get("path", "")
            if should_update_kubeconfig_path(current_path, kubeconfig_path):
                logger.info(f"Updating kubeconfig path to: {kubeconfig_path}")
                settings["kubeconfig"]["path"] = str(kubeconfig_path)
                
                with open(settings_path, 'w') as f:
                    json.dump(settings, f, indent=2)
        except Exception as e:
            logger.error(f"Error updating settings file: {e}")
    
    # Create mcp.json if it doesn't exist
    if not mcp_path.exists():
        logger.info(f"Creating empty mcp.json at {mcp_path}")
        with open(mcp_path, 'w') as f:
            json.dump({}, f, indent=2)
    else:
        logger.info(f"MCP file exists at {mcp_path}")
    
    # Create default rules files
    user_rules_path = rules_dir / 'user_rules.md'
    cluster_rules_path = rules_dir / 'cluster_rules.md'
    kubeignore_path = agentkube_dir / '.kubeignore'
    
    if not user_rules_path.exists():
        logger.info(f"Creating empty user_rules.md at {user_rules_path}")
        with open(user_rules_path, 'w') as f:
            f.write("")
    
    if not cluster_rules_path.exists():
        logger.info(f"Creating empty cluster_rules.md at {cluster_rules_path}")
        with open(cluster_rules_path, 'w') as f:
            f.write("")
    
    if not kubeignore_path.exists():
        logger.info(f"Creating empty .kubeignore at {kubeignore_path}")
        with open(kubeignore_path, 'w') as f:
            f.write("")
    
    # Create additionalConfig.yaml if it doesn't exist
    additional_config_path = agentkube_dir / 'additionalConfig.yaml'
    if not additional_config_path.exists():
        logger.info(f"Creating empty additionalConfig.yaml at {additional_config_path}")
        with open(additional_config_path, 'w') as f:
            f.write("")
    
    return agentkube_dir, settings_path, mcp_path, rules_dir, additional_config_path

def get_kubeconfig_path():
    """
    Get the path to kubeconfig based on the operating system.
    
    Returns:
        Path: Path to kubeconfig file
    """
    home_dir = Path.home()
    
    # Check for KUBECONFIG environment variable first
    kubeconfig_env = os.environ.get("KUBECONFIG")
    if kubeconfig_env:
        return Path(kubeconfig_env)
    
    # Default paths by OS
    system = platform.system()
    if system == "Windows":
        return home_dir / ".kube" / "config"
    elif system == "Darwin":  # macOS
        return home_dir / ".kube" / "config"
    else:  # Linux and others
        return home_dir / ".kube" / "config"

def should_update_kubeconfig_path(current_path, new_path):
    """
    Determine if kubeconfig path should be updated.
    
    Args:
        current_path: Current path in settings
        new_path: New path determined by system
        
    Returns:
        bool: True if path should be updated, False otherwise
    """
    # If paths are the same, no need to update
    if str(current_path) == str(new_path):
        return False
    
    # Check if current path exists - if it does, don't override
    if current_path and os.path.isfile(current_path):
        return False
        
    # Update if current path contains a different username
    # This handles cases like "/Users/old_user/.kube/config" vs "/Users/current_user/.kube/config"
    username = os.path.basename(str(Path.home()))
    
    # Different logic for different OS path formats
    system = platform.system()
    if system == "Windows":
        # Check for Windows-style paths
        if "\\Users\\" in current_path and f"\\Users\\{username}\\" not in current_path:
            return True
    else:
        # Check for Unix-style paths
        if "/Users/" in current_path and f"/Users/{username}/" not in current_path:
            return True
        if "/home/" in current_path and f"/home/{username}/" not in current_path:
            return True
    
    # If current path doesn't exist but new path does, update
    if not os.path.isfile(current_path) and os.path.isfile(new_path):
        return True
    
    return False

def get_default_settings(home_dir, agentkube_dir, kubeconfig_path):
    """
    Get default settings for the application.
    
    Args:
        home_dir: User's home directory
        agentkube_dir: Path to .agentkube directory
        kubeconfig_path: Path to kubeconfig file
        
    Returns:
        dict: Default settings
    """
    system = platform.system()
    
    # Adjust default shortcuts based on OS
    if system == "Darwin":  # macOS
        shortcut_prefix = "Cmd"
    else:
        shortcut_prefix = "Ctrl"
    
    return {
        "general": {
            "autoUpdate": True,
            "usageAnalytics": False,
            "excludeNamespaces": [],
            "startOnLogin": False,
            "language": "en",
            "kubectlPath": get_kubectl_path()
        },
        "agentkubeconfig": {
            "path": str(agentkube_dir)
        },
        "kubeconfig": {
            "path": str(kubeconfig_path),
            "externalPaths": None,
            "contextAutoRefresh": True,
            "contextRefreshInterval": 300,
            "contextRegionExtension": True
        },
        "appearance": {
            "colorMode": "dark",
            "themeOptions": ["light", "dark", "dark-emerald", "dark-violet"],
            "fontSize": 14,
            "fontFamily": "DM Sans, sans-serif",
            "themeConfig": {
                "baseMode": "dark",
                "allowCustomWallpaper": True,
                "customTheme": None,
                "wallpaperPath": None
            },
            "customThemes": []
        },
        "docs": {
            "links": [],
            "showHelpTips": True
        },
        "models": {
            "currentModel": "openai/gpt-4o-mini",
            "settings": {
                "streaming": True,
                "maxTokens": 4096,
                "temperature": 0.7,
                "contextSize": 8192
            }
        },
        "uploads": {
            "maxFileSize": 20971520,  # 20MB in bytes (increased from 5MB)
            "maxImageSize": 20971520,  # 20MB for images
            "allowedImageTypes": ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"],
            "allowedFileTypes": ["text/plain", "application/json", "text/yaml", "text/xml"]
        },
        "terminal": {
            "shell": "bash" if system != "Windows" else "powershell",
            "fontFamily": "Menlo, Monaco, 'Courier New', monospace",
            "fontSize": 12,
            "cursorStyle": "block",
            "cursorBlink": True,
            "scrollback": 10000
        },
        "editor": {
            "wordWrap": True,
            "autoIndent": True,
            "tabSize": 2,
            "insertSpaces": True,
            "formatOnSave": True,
            "minimap": {
                "enabled": True,
                "side": "right"
            }
        },
        "debugging": {
            "verbose": False,
            "logLevel": "info",
            "logPath": str(agentkube_dir / "logs")
        },
        "advanced": {
            "proxySettings": {
                "enabled": False,
                "httpProxy": "",
                "httpsProxy": "",
                "noProxy": "localhost,127.0.0.1"
            },
            "customCommands": [],
            "experimentalFeatures": False
        },
        "imageScans": {
            "enable": True,
            "exclusions": {
                "namespaces": [],
                "labels": {}
            }
        },
        "agents": {
            "denyList": [],
            "webSearch": False,
            "recon": False
        },
        "agentModelMapping": {
            "logAnalyzer": {
                "provider": "default",
                "model": ""
            },
            "eventAnalyzer": {
                "provider": "default",
                "model": ""
            },
            "securityRemediator": {
                "provider": "default",
                "model": ""
            },
            "investigationTask": {
                "provider": "default",
                "model": ""
            },
            "chat": {
                "provider": "default",
                "model": ""
            }
        }
    }
    
def get_kubectl_path():
    """
    Get the path to kubectl binary based on the operating system.
    
    Returns:
        str: Path to kubectl executable or default command
    """
    import shutil
    
    # Try to find kubectl in PATH
    kubectl_path = shutil.which("kubectl")
    if kubectl_path:
        return kubectl_path
    
    # Default fallback paths by OS
    system = platform.system()
    if system == "Windows":
        # Common Windows installation paths
        possible_paths = [
            "C:\\Program Files\\kubectl\\kubectl.exe",
            "C:\\kubectl\\kubectl.exe"
        ]
        for path in possible_paths:
            if os.path.isfile(path):
                return path
        return "kubectl.exe"  # Fallback to command
    else:
        # Unix-like systems (Linux, macOS)
        possible_paths = [
            "/usr/local/bin/kubectl",
            "/usr/bin/kubectl",
            "/opt/homebrew/bin/kubectl"  # macOS Homebrew
        ]
        for path in possible_paths:
            if os.path.isfile(path):
                return path
        return "kubectl"  # Fallback to command