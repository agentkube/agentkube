#-------------------------------------------------------------------------------------#
# Helm Tools - Complete set of Helm operations for Kubernetes package management.
# Includes repository management, chart lifecycle operations, and release monitoring with command tracking.
#-------------------------------------------------------------------------------------#

import subprocess
from agents import function_tool
from typing import Dict, Optional, List
from config import get_settings
import orchestrator.tools.kubectl as kubectl_module
import shutil 
    
def get_helm_command() -> str:
    """Get the helm command with automatic detection or configured path"""
    settings = get_settings()
    configured_path = settings.get("general", {}).get("helmPath")
    
    # If a path is explicitly configured, use it
    if configured_path and configured_path != "helm":
        return configured_path
    
    # Try to auto-detect helm in system PATH
    helm_path = shutil.which("helm")
    if helm_path:
        return helm_path
    
    # Common helm installation paths to check
    common_paths = [
        "/usr/local/bin/helm",
        "/opt/homebrew/bin/helm",
        "/usr/bin/helm",
        "/snap/bin/helm"
    ]
    
    for path in common_paths:
        try:
            result = subprocess.run([path, "version", "--short"], capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                return path
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            continue
    
    # Fallback to "helm" and let the system handle it
    return "helm"

def build_helm_command(base_command: str) -> str:
    """Build a helm command with the configured path, kubeconfig, and context"""
    helm_cmd = get_helm_command()
    command = base_command.replace("helm", helm_cmd, 1)
    
    # Access kubectl's global variables directly
    current_context = kubectl_module._current_kubecontext
    current_kubeconfig_path = kubectl_module._current_kubeconfig_path
    
    # Detect kubeconfig path if context is set but path is not
    kubeconfig_path = current_kubeconfig_path
    if current_context and not kubeconfig_path:
        kubeconfig_path = kubectl_module.detect_kubeconfig_path(current_context)
    
    # Add kubeconfig if using external kubeconfig
    if kubeconfig_path:
        command += f" --kubeconfig={kubeconfig_path}"
    
    # Add context
    if current_context:
        command += f" --kube-context {current_context}"
    
    return command
    
tool_call_history = []

def track_call(name, args=None, kwargs=None, output=None):
    """Record a tool call in the history with output"""
    if args is None:
        args = ()
    if kwargs is None:
        kwargs = {}
    
    tool_call_history.append({
        "tool": name,
        "args": args,
        "kwargs": kwargs,
        "output": output,
        "timestamp": __import__('datetime').datetime.now().isoformat()
    })
    print(f"tool_call: {name}")

@function_tool
def check_helm_installation() -> Dict[str, str]:
    """
    Checks if Helm is installed and shows version information.
    
    Returns:
        Dict containing the command and its output
    """
    command = build_helm_command("helm version")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("check_helm_installation", output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("check_helm_installation", output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def list_helm_repositories() -> Dict[str, str]:
    """
    Lists all configured Helm repositories.
    
    Returns:
        Dict containing the command and its output
    """
    command = build_helm_command("helm repo list")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("list_helm_repositories", output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("list_helm_repositories", output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def add_helm_repository(repo_name: str, repo_url: str) -> Dict[str, str]:
    """
    Adds a new Helm repository.
    
    Args:
        repo_name: Name for the repository
        repo_url: URL of the repository
    
    Returns:
        Dict containing the command and its output
    """
    command = build_helm_command(f"helm repo add {repo_name} {repo_url}")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("add_helm_repository", kwargs={"repo_name": repo_name, "repo_url": repo_url}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("add_helm_repository", kwargs={"repo_name": repo_name, "repo_url": repo_url}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def update_helm_repositories() -> Dict[str, str]:
    """
    Updates all configured Helm repositories to get the latest chart information.
    
    Returns:
        Dict containing the command and its output
    """
    command = build_helm_command("helm repo update")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("update_helm_repositories", output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("update_helm_repositories", output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def search_helm_charts(search_term: str, repo: Optional[str] = None) -> Dict[str, str]:
    """
    Searches for Helm charts in repositories.
    
    Args:
        search_term: Term to search for in chart names and descriptions
        repo: Specific repository to search in (optional)
    
    Returns:
        Dict containing the command and its output
    """
    command = build_helm_command(f"helm search repo {search_term}")
    
    if repo:
        command = build_helm_command(f"helm search repo {repo}/{search_term}")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("search_helm_charts", kwargs={"search_term": search_term, "repo": repo}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("search_helm_charts", kwargs={"search_term": search_term, "repo": repo}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def install_helm_chart(release_name: str, chart_name: str, namespace: Optional[str] = None, 
                      values_file: Optional[str] = None, set_values: Optional[str] = None,
                      create_namespace: Optional[bool] = None, dry_run: Optional[bool] = None) -> Dict[str, str]:
    """
    Installs a Helm chart.
    
    Args:
        release_name: Name for the Helm release
        chart_name: Name of the chart to install (e.g., "bitnami/nginx")
        namespace: Namespace to install into. If not specified, uses "default"
        values_file: Path to values file (optional)
        set_values: Set values on command line (e.g., "key1=val1,key2=val2")
        create_namespace: Whether to create namespace if it doesn't exist
        dry_run: Whether to simulate the install without actually installing
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_create_namespace = create_namespace if create_namespace is not None else False
    actual_dry_run = dry_run if dry_run is not None else False
    
    command = build_helm_command(f"helm install {release_name} {chart_name} -n {actual_namespace}")
    
    if actual_create_namespace:
        command += " --create-namespace"
    
    if values_file:
        command += f" -f {values_file}"
    
    if set_values:
        command += f" --set {set_values}"
    
    if actual_dry_run:
        command += " --dry-run --debug"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("install_helm_chart", kwargs={
            "release_name": release_name, "chart_name": chart_name, "namespace": actual_namespace,
            "values_file": values_file, "set_values": set_values, 
            "create_namespace": actual_create_namespace, "dry_run": actual_dry_run
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("install_helm_chart", kwargs={
            "release_name": release_name, "chart_name": chart_name, "namespace": actual_namespace,
            "values_file": values_file, "set_values": set_values,
            "create_namespace": actual_create_namespace, "dry_run": actual_dry_run
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def list_helm_releases(namespace: Optional[str] = None, all_namespaces: Optional[bool] = None) -> Dict[str, str]:
    """
    Lists Helm releases.
    
    Args:
        namespace: Specific namespace to list releases from. If not specified, uses "default"
        all_namespaces: Whether to list releases from all namespaces
    
    Returns:
        Dict containing the command and its output
    """
    actual_all_namespaces = all_namespaces if all_namespaces is not None else False
    
    if actual_all_namespaces:
        command = build_helm_command("helm list --all-namespaces")
    else:
        actual_namespace = namespace if namespace is not None else "default"
        command = build_helm_command(f"helm list -n {actual_namespace}")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("list_helm_releases", kwargs={"namespace": namespace, "all_namespaces": actual_all_namespaces}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("list_helm_releases", kwargs={"namespace": namespace, "all_namespaces": actual_all_namespaces}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def get_helm_release_status(release_name: str, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Gets the status of a specific Helm release.
    
    Args:
        release_name: Name of the release
        namespace: Namespace where the release is located. If not specified, uses "default"
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_helm_command(f"helm status {release_name} -n {actual_namespace}")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_helm_release_status", kwargs={"release_name": release_name, "namespace": actual_namespace}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("get_helm_release_status", kwargs={"release_name": release_name, "namespace": actual_namespace}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def uninstall_helm_release(release_name: str, namespace: Optional[str] = None, 
                          keep_history: Optional[bool] = None) -> Dict[str, str]:
    """
    Uninstalls a Helm release.
    
    Args:
        release_name: Name of the release to uninstall
        namespace: Namespace where the release is located. If not specified, uses "default"
        keep_history: Whether to keep the release history after uninstall
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_keep_history = keep_history if keep_history is not None else False
    
    command = build_helm_command(f"helm uninstall {release_name} -n {actual_namespace}")
    
    if actual_keep_history:
        command += " --keep-history"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("uninstall_helm_release", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "keep_history": actual_keep_history
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("uninstall_helm_release", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "keep_history": actual_keep_history
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def upgrade_helm_release(release_name: str, chart_name: str, namespace: Optional[str] = None,
                        values_file: Optional[str] = None, set_values: Optional[str] = None,
                        force: Optional[bool] = None, dry_run: Optional[bool] = None) -> Dict[str, str]:
    """
    Upgrades a Helm release.
    
    Args:
        release_name: Name of the release to upgrade
        chart_name: Name of the chart to upgrade to
        namespace: Namespace where the release is located. If not specified, uses "default"
        values_file: Path to values file (optional)
        set_values: Set values on command line (e.g., "key1=val1,key2=val2")
        force: Whether to force resource updates through replacement/recreation
        dry_run: Whether to simulate the upgrade without actually upgrading
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_force = force if force is not None else False
    actual_dry_run = dry_run if dry_run is not None else False
    
    command = build_helm_command(f"helm upgrade {release_name} {chart_name} -n {actual_namespace}")
    
    if values_file:
        command += f" -f {values_file}"
    
    if set_values:
        command += f" --set {set_values}"
    
    if actual_force:
        command += " --force"
    
    if actual_dry_run:
        command += " --dry-run --debug"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("upgrade_helm_release", kwargs={
            "release_name": release_name, "chart_name": chart_name, "namespace": actual_namespace,
            "values_file": values_file, "set_values": set_values, "force": actual_force, "dry_run": actual_dry_run
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("upgrade_helm_release", kwargs={
            "release_name": release_name, "chart_name": chart_name, "namespace": actual_namespace,
            "values_file": values_file, "set_values": set_values, "force": actual_force, "dry_run": actual_dry_run
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def rollback_helm_release(release_name: str, revision: Optional[int] = None, 
                         namespace: Optional[str] = None, dry_run: Optional[bool] = None) -> Dict[str, str]:
    """
    Rolls back a Helm release to a previous revision.
    
    Args:
        release_name: Name of the release to rollback
        revision: Specific revision to rollback to (if not specified, rolls back to previous)
        namespace: Namespace where the release is located. If not specified, uses "default"
        dry_run: Whether to simulate the rollback without actually rolling back
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_dry_run = dry_run if dry_run is not None else False
    
    command = build_helm_command(f"helm rollback {release_name}")
    
    if revision is not None:
        command += f" {revision}"
    
    command += f" -n {actual_namespace}"
    
    if actual_dry_run:
        command += " --dry-run"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("rollback_helm_release", kwargs={
            "release_name": release_name, "revision": revision, "namespace": actual_namespace, "dry_run": actual_dry_run
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("rollback_helm_release", kwargs={
            "release_name": release_name, "revision": revision, "namespace": actual_namespace, "dry_run": actual_dry_run
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def get_helm_release_history(release_name: str, namespace: Optional[str] = None, max_revisions: Optional[int] = None) -> Dict[str, str]:
    """
    Gets the revision history of a Helm release.
    
    Args:
        release_name: Name of the release
        namespace: Namespace where the release is located. If not specified, uses "default"
        max_revisions: Maximum number of revisions to return
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_helm_command(f"helm history {release_name} -n {actual_namespace}")
    
    if max_revisions is not None:
        command += f" --max {max_revisions}"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_helm_release_history", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "max_revisions": max_revisions
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("get_helm_release_history", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "max_revisions": max_revisions
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def get_helm_release_values(release_name: str, namespace: Optional[str] = None, 
                           all_values: Optional[bool] = None, revision: Optional[int] = None) -> Dict[str, str]:
    """
    Gets the values of a Helm release.
    
    Args:
        release_name: Name of the release
        namespace: Namespace where the release is located. If not specified, uses "default"
        all_values: Whether to get all values (including defaults)
        revision: Specific revision to get values from
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_all_values = all_values if all_values is not None else False
    
    command = build_helm_command(f"helm get values {release_name} -n {actual_namespace}")
    
    if actual_all_values:
        command += " --all"
    
    if revision is not None:
        command += f" --revision {revision}"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_helm_release_values", kwargs={
            "release_name": release_name, "namespace": actual_namespace, 
            "all_values": actual_all_values, "revision": revision
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("get_helm_release_values", kwargs={
            "release_name": release_name, "namespace": actual_namespace,
            "all_values": actual_all_values, "revision": revision
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def get_helm_release_manifest(release_name: str, namespace: Optional[str] = None, revision: Optional[int] = None) -> Dict[str, str]:
    """
    Gets the manifest of a Helm release.
    
    Args:
        release_name: Name of the release
        namespace: Namespace where the release is located. If not specified, uses "default"
        revision: Specific revision to get manifest from
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_helm_command(f"helm get manifest {release_name} -n {actual_namespace}")
    
    if revision is not None:
        command += f" --revision {revision}"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_helm_release_manifest", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "revision": revision
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("get_helm_release_manifest", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "revision": revision
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def test_helm_release(release_name: str, namespace: Optional[str] = None, cleanup: Optional[bool] = None) -> Dict[str, str]:
    """
    Runs tests for a Helm release.
    
    Args:
        release_name: Name of the release to test
        namespace: Namespace where the release is located. If not specified, uses "default"
        cleanup: Whether to automatically delete test resources after completion
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_cleanup = cleanup if cleanup is not None else False
    
    command = build_helm_command(f"helm test {release_name} -n {actual_namespace}")
    
    if actual_cleanup:
        command += " --cleanup"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("test_helm_release", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "cleanup": actual_cleanup
        }, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("test_helm_release", kwargs={
            "release_name": release_name, "namespace": actual_namespace, "cleanup": actual_cleanup
        }, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def remove_helm_repository(repo_name: str) -> Dict[str, str]:
    """
    Removes a Helm repository.
    
    Args:
        repo_name: Name of the repository to remove
    
    Returns:
        Dict containing the command and its output
    """
    command = build_helm_command(f"helm repo remove {repo_name}")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("remove_helm_repository", kwargs={"repo_name": repo_name}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("remove_helm_repository", kwargs={"repo_name": repo_name}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

# Read-only operations - allowed in recon mode
helm_read_tools = [
    check_helm_installation,
    list_helm_repositories,
    search_helm_charts,
    list_helm_releases,
    get_helm_release_status,
    get_helm_release_history,
    get_helm_release_values,
    get_helm_release_manifest
]

# Action/modification operations - only allowed when recon mode is off
helm_action_tools = [
    add_helm_repository,
    update_helm_repositories,
    install_helm_chart,
    uninstall_helm_release,
    upgrade_helm_release,
    rollback_helm_release,
    test_helm_release,
    remove_helm_repository
]

# Combined tools based on recon mode
def get_helm_tools():
    from config.config import get_recon_mode
    if get_recon_mode():
        return helm_read_tools
    else:
        return helm_read_tools + helm_action_tools

# For backward compatibility
helm_tools = get_helm_tools()