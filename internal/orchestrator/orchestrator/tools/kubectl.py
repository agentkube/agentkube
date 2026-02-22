#-------------------------------------------------------------------------------------#
# Kubectl Tools - All kubectl operations for Kubernetes cluster management.
# Covers pods, deployments, services, nodes, scaling, debugging, and resource monitoring with context support.
#-------------------------------------------------------------------------------------#

import subprocess
from agents import function_tool
from typing import Dict, Optional
from config import get_settings
import random
import time
import threading
import webbrowser
import requests
import json
import os
from pathlib import Path

AK_OPERATOR_URL = "http://localhost:4688/api/v1"

_current_kubecontext: Optional[str] = None
_current_kubeconfig_path: Optional[str] = None

def set_kubecontext(context: Optional[str], kubeconfig_path: Optional[str] = None):
    """Set the global kubecontext for all kubectl operations"""
    global _current_kubecontext, _current_kubeconfig_path
    _current_kubecontext = context
    
    # Use provided kubeconfig path if available, otherwise detect it
    if kubeconfig_path:
        _current_kubeconfig_path = kubeconfig_path
    elif context:
        _current_kubeconfig_path = detect_kubeconfig_path(context)
    else:
        _current_kubeconfig_path = None

def detect_kubeconfig_path(context_name: str) -> Optional[str]:
    """
    Detect which kubeconfig file contains the given context.
    Checks both default kubeconfig and agentkube locations across different OS platforms.
    """
    # Cross-platform kubeconfig paths
    home_dir = Path.home()
    kubeconfig_paths = [
        home_dir / ".kube" / "config",  # Standard kubeconfig location (Linux/macOS/Windows)
        home_dir / ".agentkube" / "kubeconfig" / "config"  # AgentKube location
    ]
    
    # Convert to strings for compatibility
    kubeconfig_paths = [str(path) for path in kubeconfig_paths]
    
    for kubeconfig_path in kubeconfig_paths:
        if os.path.exists(kubeconfig_path):
            try:
                # Check if context exists in this kubeconfig
                kubectl_cmd = get_kubectl_command()
                check_cmd = f"{kubectl_cmd} --kubeconfig={kubeconfig_path} config get-contexts -o name"
                result = subprocess.run(check_cmd, shell=True, capture_output=True, text=True, timeout=5)
                
                if result.returncode == 0:
                    contexts = result.stdout.strip().split('\n')
                    if context_name in contexts:
                        # If it's the default kubeconfig, don't return a path (kubectl will use default)
                        default_kubeconfig = str(Path.home() / ".kube" / "config")
                        if kubeconfig_path == default_kubeconfig:
                            return None
                        return kubeconfig_path
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                continue
    
    return None
    
def get_kubectl_command() -> str:
    """Get the kubectl command with the configured path"""
    settings = get_settings()
    return settings.get("general", {}).get("kubectlPath", "kubectl")

def build_kubectl_command(base_command: str) -> str:
    """Build a kubectl command with the configured path, kubeconfig, and context"""
    kubectl_cmd = get_kubectl_command()
    command = base_command.replace("kubectl", kubectl_cmd, 1)
    
    # Add kubeconfig if using external kubeconfig
    if _current_kubeconfig_path:
        command += f" --kubeconfig={_current_kubeconfig_path}"
    
    # Add context
    if _current_kubecontext:
        command += f" --context {_current_kubecontext}"
    
    return command
    
tool_call_history = []

def track_call(name, args=None, kwargs=None, output=None, error=None):
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
        "error": error,
        "timestamp": __import__('datetime').datetime.now().isoformat()
    })
    print(f"tool_call: {name}")
    # if kwargs:
    #     print(f"arguments: {kwargs}")
    # if output:
    #     out_str = str(output)
    #     # Truncate if extremely long, but keep enough to be useful (e.g. 1000 chars)
    #     if len(out_str) > 1000:
    #         print(f"output: {out_str[:1000]}... [truncated]")
    #     else:
    #         print(f"output: {out_str}")
    # if error:
    #     print(f"error: {error}")
        

@function_tool
def list_pods(namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Lists all pods in the specified namespace.
    
    Args:
        namespace: The namespace to list pods from. If not provided, will use the "default" namespace.
    
    Returns:
        Dict containing the command and its output
    """
    # Use a local default instead of a parameter default
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl get pods -n {actual_namespace}")
        
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("list_pods", kwargs={"namespace": namespace}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("list_pods", kwargs={"namespace": namespace}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }
        
@function_tool
def list_pods_not_running(namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Lists all pods not in Running state in the specified namespace.

    Args:
        namespace: The namespace to list pods from. If not specified, uses the "default" namespace.

    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl get pods -n {actual_namespace} --field-selector=status.phase!=Running")

    try:
        result = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("list_pods_not_running", kwargs={"namespace": actual_namespace}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("list_pods_not_running", kwargs={"namespace": actual_namespace}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def list_resources(kind: str, namespace: Optional[str] = None, all_namespaces: Optional[bool] = None) -> Dict[str, str]:
    """
    Lists Kubernetes resources of a specific kind.

    Args:
        kind: Type of resource to list (deployment, service, node, configmap, secret, statefulset, pv, pvc, etc.)
        namespace: The namespace to list resources from. If not specified, uses "default" for namespaced resources. Ignored for cluster-scoped resources.
        all_namespaces: If True, lists resources from all namespaces (only for namespaced resources). Defaults to False.

    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_all_namespaces = all_namespaces if all_namespaces is not None else False
    kind_lower = kind.lower()

    # Common cluster-scoped resources (resources without namespace)
    cluster_scoped = ['node', 'nodes', 'persistentvolume', 'persistentvolumes', 'pv',
                      'namespace', 'namespaces', 'clusterrole', 'clusterrolebinding',
                      'storageclass', 'storageclasses']

    # Build command based on resource scope
    if kind_lower in cluster_scoped:
        command = build_kubectl_command(f"kubectl get {kind_lower}")
    elif actual_all_namespaces:
        command = build_kubectl_command(f"kubectl get {kind_lower} --all-namespaces")
    else:
        command = build_kubectl_command(f"kubectl get {kind_lower} -n {actual_namespace}")

    try:
        result = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True
        )
        # Use stdout if available, otherwise use stderr (for "No resources found" messages)
        output = result.stdout or result.stderr
        track_call("list_resources", kwargs={"kind": kind_lower, "namespace": actual_namespace if kind_lower not in cluster_scoped else None, "all_namespaces": actual_all_namespaces}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("list_resources", kwargs={"kind": kind_lower, "namespace": actual_namespace if kind_lower not in cluster_scoped else None, "all_namespaces": actual_all_namespaces}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def describe_resource(kind: str, resource_name: str, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Describes a specific Kubernetes resource in detail.

    Args:
        kind: Type of resource to describe (pod, deployment, node, service, statefulset, etc.)
        resource_name: Name of the resource to describe
        namespace: The namespace where the resource is located. If not specified, uses "default" for namespaced resources. Not used for cluster-scoped resources like nodes.

    Returns:
        Dict containing the command and its output
    """
    # Cluster-scoped resources that don't use namespaces
    cluster_scoped = ['node', 'persistentvolume', 'pv', 'namespace', 'clusterrole', 'clusterrolebinding', 'storageclass']

    actual_namespace = namespace if namespace is not None else "default"
    kind_lower = kind.lower()

    # Build command based on resource scope
    if kind_lower in cluster_scoped:
        command = build_kubectl_command(f"kubectl describe {kind_lower} {resource_name}")
    else:
        command = build_kubectl_command(f"kubectl describe {kind_lower} {resource_name} -n {actual_namespace}")

    try:
        result = subprocess.run(
            command,
            shell=True,
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("describe_resource", kwargs={"kind": kind_lower, "resource_name": resource_name, "namespace": actual_namespace}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("describe_resource", kwargs={"kind": kind_lower, "resource_name": resource_name, "namespace": actual_namespace}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def get_pod_logs(pod_name: str, namespace: Optional[str] = None, container: Optional[str] = None, 
                 previous: Optional[bool] = None) -> Dict[str, str]:
    """
    Retrieves logs for a specific pod.
    
    Args:
        pod_name: Name of the pod to get logs from
        namespace: The namespace where the pod is located. If not specified, uses the "default" namespace.
        container: Specific container to get logs from (if pod has multiple containers)
        previous: Whether to get logs from previous instance if pod has restarted. Defaults to False if not specified.
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_previous = previous if previous is not None else False
    
    # Use --tail=100 to limit logs at source and prevent context length errors
    command = build_kubectl_command(f"kubectl logs {pod_name} -n {actual_namespace} --tail=100")

    
    if container:
        command += f" -c {container}"
    
    if actual_previous:
        command += " -p"
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout or result.stderr
            
        track_call("get_pod_logs", kwargs={"pod_name": pod_name, "namespace": actual_namespace, 
                                      "container": container, "previous": actual_previous}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        
        # Check for specific error where pod is not running yet
        if "waiting to start" in error_output or "is waiting to start" in error_output:
             error_output = (
                f"No logs available for this pod yet as the container is waiting to start. "
                f"It is likely in a state like ImagePullBackOff, ErrImagePull, or ContainerCreating. "
                f"Original error: {e.stderr}"
             )

        track_call("get_pod_logs", kwargs={"pod_name": pod_name, "namespace": actual_namespace, 
                                      "container": container, "previous": actual_previous}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }


@function_tool
def delete_resource(resource_type: str, resource_name: str, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Deletes a Kubernetes resource.
    
    Args:
        resource_type: Type of resource to delete (pod, deployment, service, etc.)
        resource_name: Name of the resource to delete
        namespace: The namespace where the resource is located. If not specified, uses the "default" namespace.
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl delete {resource_type} {resource_name} -n {actual_namespace}")
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("delete_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, "namespace": actual_namespace}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("delete_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, "namespace": actual_namespace}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def get_events(namespace: Optional[str] = None, sort_by: Optional[str] = None) -> Dict[str, str]:
    """
    Gets Kubernetes events, sorted by timestamp.
    
    Args:
        namespace: The namespace to get events from. If not specified, uses the "default" namespace.
        sort_by: Field to sort by. If not specified, uses "lastTimestamp".
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_sort_by = sort_by if sort_by is not None else "lastTimestamp"
    
    command = build_kubectl_command(f"kubectl get events -n {actual_namespace} --sort-by='{actual_sort_by}'")
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_events", kwargs={"namespace": actual_namespace, "sort_by": actual_sort_by}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("get_events", kwargs={"namespace": actual_namespace, "sort_by": actual_sort_by}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def scale_deployment(deployment_name: str, replicas: int, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Scales a deployment to a specified number of replicas.
    
    Args:
        deployment_name: Name of the deployment to scale
        replicas: Desired number of replicas
        namespace: The namespace where the deployment is located. If not specified, uses the "default" namespace.
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl scale deployment {deployment_name} --replicas={replicas} -n {actual_namespace}")
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("scale_deployment", kwargs={"deployment_name": deployment_name, "replicas": replicas, "namespace": actual_namespace}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("scale_deployment", kwargs={"deployment_name": deployment_name, "replicas": replicas, "namespace": actual_namespace}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def exec_command(pod_name: str, command_to_run: str, namespace: Optional[str] = None, container: Optional[str] = None) -> Dict[str, str]:
    """
    Executes a command inside a pod container.
    
    Args:
        pod_name: Name of the pod to execute command in
        command_to_run: The command to run inside the pod
        namespace: The namespace where the pod is located. If not specified, uses the "default" namespace.
        container: Specific container to run command in (if pod has multiple containers)
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    
    # Validate command - prevent kubectl commands that should be run outside the pod
    invalid_commands = ['kubectl', 'helm', 'docker', 'systemctl', 'service']
    command_lower = command_to_run.lower().strip()
    
    for invalid_cmd in invalid_commands:
        if command_lower.startswith(invalid_cmd):
            error_msg = f"Cannot execute '{invalid_cmd}' command inside pod. This command should be run on the host system, not inside a container."
            track_call("exec_command", kwargs={"pod_name": pod_name, "command_to_run": command_to_run, 
                                          "namespace": actual_namespace, "container": container}, output=error_msg)
            return {
                "command": f"kubectl exec {pod_name} -n {actual_namespace} -- {command_to_run}",
                "output": error_msg
            }
    
    # Check if pod exists before attempting to exec
    check_command = build_kubectl_command(f"kubectl get pod {pod_name} -n {actual_namespace}")
    
    try:
        subprocess.run(check_command, shell=True, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError:
        error_msg = f"Pod '{pod_name}' not found in namespace '{actual_namespace}'. Cannot execute command inside non-existent pod."
        track_call("exec_command", kwargs={"pod_name": pod_name, "command_to_run": command_to_run, 
                                      "namespace": actual_namespace, "container": container}, output=error_msg)
        return {
            "command": f"kubectl exec {pod_name} -n {actual_namespace} -- {command_to_run}",
            "output": error_msg
        }
    
    command = build_kubectl_command(f"kubectl exec {pod_name} -n {actual_namespace}")

    if container:
        command += f" -c {container}"
    
    command += f" -- {command_to_run}"
    
        
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("exec_command", kwargs={"pod_name": pod_name, "command_to_run": command_to_run, 
                                      "namespace": actual_namespace, "container": container}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("exec_command", kwargs={"pod_name": pod_name, "command_to_run": command_to_run, 
                                      "namespace": actual_namespace, "container": container}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }
        
@function_tool
def get_cluster_info() -> Dict[str, str]:
    """
    Gets information about the Kubernetes cluster.
    
    Returns:
        Dict containing the command and its output
    """
    command = build_kubectl_command("kubectl cluster-info")
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_cluster_info", output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("get_cluster_info", output=error_output)
        return {
            "command": command,
            "output": error_output
        }

@function_tool
def get_resource_usage() -> Dict[str, str]:
    """
    Gets resource usage across the cluster (requires metrics-server).
    
    Returns:
        Dict containing the command and its output
    """
    command = build_kubectl_command("kubectl top nodes && echo '\n\nPod Resource Usage:\n' && kubectl top pods --all-namespaces")
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_resource_usage", output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"{e.stderr}"
        track_call("get_resource_usage", output=error_output)
        return {
            "command": command,
            "output": error_output
        }


@function_tool
def get_resource_yaml(resource_type: str, resource_name: str, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Retrieves the YAML configuration of a Kubernetes resource.
    
    Args:
        resource_type: Type of resource (pod, deployment, service, configmap, etc.)
        resource_name: Name of the resource
        namespace: The namespace where the resource is located. If not specified, uses "default"
    
    Returns:
        Dict containing the command and the YAML output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl get {resource_type} {resource_name} -n {actual_namespace} -o yaml")
    
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            check=True,
            capture_output=True,
            text=True
        )
        output = result.stdout
        track_call("get_resource_yaml", kwargs={"resource_type": resource_type, "resource_name": resource_name, "namespace": actual_namespace}, output=output)
        return {
            "command": command,
            "output": output
        }
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("get_resource_yaml", kwargs={"resource_type": resource_type, "resource_name": resource_name, "namespace": actual_namespace}, output=error_output)
        return {
            "command": command,
            "output": error_output
        }


@function_tool
def get_resource_dependency(
    resource_type: str,
    resource_name: str,
    namespace: Optional[str] = None
) -> Dict:
    """
    Gets the deep dependency graph for a Kubernetes workload resource.
    This provides an extreme deep analysis of all dependencies including:
    - Workloads: Pods, ReplicaSets, Deployments managed by the resource
    - Compute: Nodes where workloads are scheduled
    - Configuration: ConfigMaps and Secrets used by the workload
    - Storage: PVCs, PVs, and StorageClasses
    - Network: Services, Ingresses, EndpointSlices, NetworkPolicies
    - RBAC: ServiceAccounts, Roles, ClusterRoles, RoleBindings
    - Scheduling: PriorityClasses, ResourceQuotas, LimitRanges
    - Autoscaling: HorizontalPodAutoscalers
    - Custom: Any custom resources related to the workload

    Args:
        resource_type: Type of workload resource. Supported types:
                      pods, deployments, statefulsets, daemonsets,
                      replicasets, replicationcontrollers, jobs, cronjobs
        resource_name: Name of the resource to analyze
        namespace: The namespace where the resource is located. If not specified, uses "default"

    Returns:
        Dict containing the dependency graph with nodes, edges, categories and stats
    """
    actual_namespace = namespace if namespace is not None else "default"
    resource_type_lower = resource_type.lower()
    
    # Map resource types to their API group and version
    resource_mapping = {
        "pods": {"group": "", "version": "v1"},
        "deployments": {"group": "apps", "version": "v1"},
        "statefulsets": {"group": "apps", "version": "v1"},
        "daemonsets": {"group": "apps", "version": "v1"},
        "replicasets": {"group": "apps", "version": "v1"},
        "replicationcontrollers": {"group": "", "version": "v1"},
        "jobs": {"group": "batch", "version": "v1"},
        "cronjobs": {"group": "batch", "version": "v1"},
    }
    
    resource_info = resource_mapping.get(resource_type_lower, {"group": "", "version": "v1"})
    cluster_name = _current_kubecontext or "default"
    
    url = f"{AK_OPERATOR_URL}/cluster/{cluster_name}/dependency"
    
    payload = {
        "namespace": actual_namespace,
        "group": resource_info["group"],
        "version": resource_info["version"],
        "resource_type": resource_type_lower,
        "resource_name": resource_name
    }
    
    try:
        response = requests.post(url, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        track_call("get_resource_dependency", kwargs={
            "resource_type": resource_type,
            "resource_name": resource_name,
            "namespace": actual_namespace
        }, output=result)
        return result
    except Exception as e:
        error_result = {"error": str(e)}
        track_call("get_resource_dependency", kwargs={
            "resource_type": resource_type,
            "resource_name": resource_name,
            "namespace": actual_namespace
        }, output=error_result)
        return error_result


def generate_random_port(min_port: int = 8080, max_port: int = 65535) -> int:
    """Generate a random port number within the specified range"""
    return random.randint(min_port, max_port)

@function_tool
def port_forward_pod(pod_name: str, pod_port: int, namespace: Optional[str] = None,
                     local_port: Optional[int] = None, open_browser: Optional[bool] = None) -> Dict[str, str]:
    """
    Port forwards from a local port to a pod port and optionally opens browser.
    Runs the port-forward in the background as a non-blocking process (cross-platform).

    Args:
        pod_name: Name of the pod to port forward to
        pod_port: Port on the pod to forward to
        namespace: The namespace where the pod is located. If not specified, uses "default"
        local_port: Local port to use. If not specified, generates a random port
        open_browser: Whether to open browser after port forward starts. Defaults to True

    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_local_port = local_port if local_port is not None else generate_random_port()
    actual_open_browser = open_browser if open_browser is not None else True

    # Build base command
    base_command = build_kubectl_command(f"kubectl port-forward {pod_name} {actual_local_port}:{pod_port} -n {actual_namespace}")

    # Function to open browser after a delay
    def open_browser_delayed():
        time.sleep(2)  # Wait for port forward to establish
        url = f"http://localhost:{actual_local_port}"
        webbrowser.open(url)
        print(f"Opened browser to: {url}")

    try:
        # Start the port-forward in the background using Popen (cross-platform)
        # Use DEVNULL to suppress output on all platforms
        process = subprocess.Popen(
            base_command,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL
        )

        # Start browser opening in background if requested
        if actual_open_browser:
            browser_thread = threading.Thread(target=open_browser_delayed)
            browser_thread.daemon = True
            browser_thread.start()

        output = f"Port forward started in background (PID: {process.pid}): localhost:{actual_local_port} -> {pod_name}:{pod_port}"
        if actual_open_browser:
            output += f"\nBrowser will open to: http://localhost:{actual_local_port}"

        track_call("port_forward_pod", kwargs={
            "pod_name": pod_name, "pod_port": pod_port, "namespace": actual_namespace,
            "local_port": actual_local_port, "open_browser": actual_open_browser
        }, output=output)

        return {
            "command": base_command,
            "output": output,
            "local_port": actual_local_port,
            "url": f"http://localhost:{actual_local_port}",
            "pid": process.pid
        }

    except Exception as e:
        error_output = f"Error starting port-forward: {str(e)}"
        track_call("port_forward_pod", kwargs={
            "pod_name": pod_name, "pod_port": pod_port, "namespace": actual_namespace,
            "local_port": actual_local_port, "open_browser": actual_open_browser
        }, output=error_output)
        return {
            "command": base_command,
            "output": error_output
        }
    
@function_tool
def set_image(resource_type: str, resource_name: str, container_image_pairs: str, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Updates container image(s) in a deployment, replicaset, or other resource.
    
    Args:
        resource_type: Type of resource (deployment, replicaset, etc.)
        resource_name: Name of the resource
        container_image_pairs: Container=image pairs (e.g., "www=nginx:1.16" or "container1=image1:v2,container2=image2:v3")
        namespace: The namespace where the resource is located. If not specified, uses "default"
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl set image {resource_type}/{resource_name} {container_image_pairs} -n {actual_namespace}")
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("set_image", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                       "container_image_pairs": container_image_pairs, "namespace": actual_namespace}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("set_image", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                       "container_image_pairs": container_image_pairs, "namespace": actual_namespace}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def rollout_history(resource_type: str, resource_name: str, namespace: Optional[str] = None, revision: Optional[int] = None) -> Dict[str, str]:
    """
    Shows rollout history for a resource.
    
    Args:
        resource_type: Type of resource (deployment, daemonset, etc.)
        resource_name: Name of the resource
        namespace: The namespace where the resource is located. If not specified, uses "default"
        revision: Specific revision to show details for
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl rollout history {resource_type}/{resource_name} -n {actual_namespace}")
    
    if revision is not None:
        command += f" --revision={revision}"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("rollout_history", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                             "namespace": actual_namespace, "revision": revision}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("rollout_history", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                             "namespace": actual_namespace, "revision": revision}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def rollout_undo(resource_type: str, resource_name: str, namespace: Optional[str] = None, to_revision: Optional[int] = None) -> Dict[str, str]:
    """
    Rollback to a previous revision.
    
    Args:
        resource_type: Type of resource (deployment, daemonset, etc.)
        resource_name: Name of the resource
        namespace: The namespace where the resource is located. If not specified, uses "default"
        to_revision: Specific revision to rollback to
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl rollout undo {resource_type}/{resource_name} -n {actual_namespace}")
    
    if to_revision is not None:
        command += f" --to-revision={to_revision}"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("rollout_undo", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                          "namespace": actual_namespace, "to_revision": to_revision}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("rollout_undo", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                          "namespace": actual_namespace, "to_revision": to_revision}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def rollout_status(resource_type: str, resource_name: str, namespace: Optional[str] = None, watch: Optional[bool] = None) -> Dict[str, str]:
    """
    Shows rollout status of a resource.
    
    Args:
        resource_type: Type of resource (deployment, daemonset, etc.)
        resource_name: Name of the resource
        namespace: The namespace where the resource is located. If not specified, uses "default"
        watch: Whether to watch the rollout status until completion. Defaults to False
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_watch = watch if watch is not None else False
    
    command = build_kubectl_command(f"kubectl rollout status {resource_type}/{resource_name} -n {actual_namespace}")
    
    if actual_watch:
        command += " -w"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("rollout_status", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "namespace": actual_namespace, "watch": actual_watch}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("rollout_status", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "namespace": actual_namespace, "watch": actual_watch}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def rollout_restart(resource_type: str, resource_name: str, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Restart a resource rollout.
    
    Args:
        resource_type: Type of resource (deployment, daemonset, etc.)
        resource_name: Name of the resource
        namespace: The namespace where the resource is located. If not specified, uses "default"
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl rollout restart {resource_type}/{resource_name} -n {actual_namespace}")
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("rollout_restart", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                             "namespace": actual_namespace}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("rollout_restart", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                             "namespace": actual_namespace}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def expose_service(resource_type: str, resource_name: str, port: int, namespace: Optional[str] = None, 
                   target_port: Optional[int] = None, service_type: Optional[str] = None, name: Optional[str] = None) -> Dict[str, str]:
    """
    Expose a resource as a service.
    
    Args:
        resource_type: Type of resource to expose (deployment, pod, rc, etc.)
        resource_name: Name of the resource
        port: Port to expose on the service
        namespace: The namespace where the resource is located. If not specified, uses "default"
        target_port: Port on the container to forward to
        service_type: Type of service (ClusterIP, NodePort, LoadBalancer)
        name: Name for the created service
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    command = build_kubectl_command(f"kubectl expose {resource_type} {resource_name} --port={port} -n {actual_namespace}")
    
    if target_port is not None:
        command += f" --target-port={target_port}"
    
    if service_type is not None:
        command += f" --type={service_type}"
    
    if name is not None:
        command += f" --name={name}"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("expose_service", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "port": port, "namespace": actual_namespace, "target_port": target_port,
                                            "service_type": service_type, "name": name}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("expose_service", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "port": port, "namespace": actual_namespace, "target_port": target_port,
                                            "service_type": service_type, "name": name}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def label_resource(resource_type: str, resource_name: str, labels: str, namespace: Optional[str] = None, 
                   overwrite: Optional[bool] = None) -> Dict[str, str]:
    """
    Add or update labels on a resource.
    
    Args:
        resource_type: Type of resource (pod, deployment, etc.)
        resource_name: Name of the resource
        labels: Labels to add/update (e.g., "key1=value1,key2=value2" or "key1-" to remove)
        namespace: The namespace where the resource is located. If not specified, uses "default"
        overwrite: Whether to overwrite existing labels. Defaults to False
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_overwrite = overwrite if overwrite is not None else False
    
    command = build_kubectl_command(f"kubectl label {resource_type} {resource_name} {labels} -n {actual_namespace}")
    
    if actual_overwrite:
        command += " --overwrite"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("label_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "labels": labels, "namespace": actual_namespace, "overwrite": actual_overwrite}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("label_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "labels": labels, "namespace": actual_namespace, "overwrite": actual_overwrite}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def annotate_resource(resource_type: str, resource_name: str, annotations: str, namespace: Optional[str] = None, 
                      overwrite: Optional[bool] = None) -> Dict[str, str]:
    """
    Add or update annotations on a resource.
    
    Args:
        resource_type: Type of resource (pod, deployment, etc.)
        resource_name: Name of the resource
        annotations: Annotations to add/update (e.g., "key1=value1,key2=value2" or "key1-" to remove)
        namespace: The namespace where the resource is located. If not specified, uses "default"
        overwrite: Whether to overwrite existing annotations. Defaults to False
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_overwrite = overwrite if overwrite is not None else False
    
    command = build_kubectl_command(f"kubectl annotate {resource_type} {resource_name} {annotations} -n {actual_namespace}")
    
    if actual_overwrite:
        command += " --overwrite"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("annotate_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                               "annotations": annotations, "namespace": actual_namespace, "overwrite": actual_overwrite}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("annotate_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                               "annotations": annotations, "namespace": actual_namespace, "overwrite": actual_overwrite}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def autoscale_deployment(deployment_name: str, min_replicas: int, max_replicas: int, namespace: Optional[str] = None, 
                        cpu_percent: Optional[int] = None) -> Dict[str, str]:
    """
    Create an autoscaler for a deployment.
    
    Args:
        deployment_name: Name of the deployment to autoscale
        min_replicas: Minimum number of replicas
        max_replicas: Maximum number of replicas
        namespace: The namespace where the deployment is located. If not specified, uses "default"
        cpu_percent: Target CPU utilization percentage. Defaults to 80
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_cpu_percent = cpu_percent if cpu_percent is not None else 80
    
    command = build_kubectl_command(f"kubectl autoscale deployment {deployment_name} --min={min_replicas} --max={max_replicas} --cpu-percent={actual_cpu_percent} -n {actual_namespace}")
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("autoscale_deployment", kwargs={"deployment_name": deployment_name, "min_replicas": min_replicas, 
                                                  "max_replicas": max_replicas, "namespace": actual_namespace, 
                                                  "cpu_percent": actual_cpu_percent}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("autoscale_deployment", kwargs={"deployment_name": deployment_name, "min_replicas": min_replicas, 
                                                  "max_replicas": max_replicas, "namespace": actual_namespace, 
                                                  "cpu_percent": actual_cpu_percent}, output=error_output)
        return {"command": command, "output": error_output}
    
# HTTP API Proxy Functions - Using operator API at port 4688

@function_tool
def create_resource_via_proxy(resource_manifest: str, cluster_context: str, namespace: Optional[str] = None) -> Dict[str, str]:
    """
    Creates a Kubernetes resource via the operator API proxy endpoint.
    
    Args:
        resource_manifest: YAML or JSON manifest of the resource to create
        cluster_context: The cluster context name (e.g., 'kind-black-dinosaurs')
        namespace: The namespace to create the resource in. If not specified, uses the namespace from the manifest or 'default'
    
    Returns:
        Dict containing the request URL, response status, and output
    """
    actual_namespace = namespace if namespace is not None else "default"
    
    try:
        # Parse the manifest to determine resource type and API version
        import yaml
        manifest_data = yaml.safe_load(resource_manifest) if resource_manifest.strip().startswith('apiVersion') else json.loads(resource_manifest)
        
        api_version = manifest_data.get('apiVersion', 'v1')
        kind = manifest_data.get('kind', '').lower()
        resource_name = manifest_data.get('metadata', {}).get('name', '')
        manifest_namespace = manifest_data.get('metadata', {}).get('namespace', actual_namespace)
        
        # Construct the Kubernetes API path
        if '/' in api_version:
            api_group, version = api_version.split('/', 1)
            if kind in ['deployment', 'replicaset', 'daemonset']:
                api_path = f"apis/{api_version}/namespaces/{manifest_namespace}/{kind}s"
            else:
                api_path = f"apis/{api_version}/namespaces/{manifest_namespace}/{kind}s"
        else:
            # Core API resources
            if kind in ['pod', 'service', 'configmap', 'secret', 'persistentvolumeclaim']:
                api_path = f"api/{api_version}/namespaces/{manifest_namespace}/{kind}s"
            else:
                api_path = f"api/{api_version}/namespaces/{manifest_namespace}/{kind}s"
        
        # Construct the proxy URL
        proxy_url = f"http://localhost:4688/api/v1/clusters/{cluster_context}/{api_path}"
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        # Convert YAML to JSON if needed
        if isinstance(manifest_data, dict):
            data = json.dumps(manifest_data)
        else:
            data = resource_manifest
        
        response = requests.post(proxy_url, data=data, headers=headers, timeout=30)
        
        output = {
            "url": proxy_url,
            "status_code": response.status_code,
            "method": "POST",
            "resource_type": kind,
            "resource_name": resource_name,
            "namespace": manifest_namespace
        }
        
        if response.status_code in [200, 201]:
            output["output"] = f"Successfully created {kind} '{resource_name}' in namespace '{manifest_namespace}'"
            output["response_data"] = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
        else:
            output["output"] = f"Error creating resource: {response.status_code} - {response.text}"
        
        track_call("create_resource_via_proxy", kwargs={
            "cluster_context": cluster_context, 
            "namespace": manifest_namespace,
            "resource_type": kind,
            "resource_name": resource_name
        }, output=str(output))
        
        return output
        
    except Exception as e:
        error_output = f"Error creating resource via proxy: {str(e)}"
        track_call("create_resource_via_proxy", kwargs={
            "cluster_context": cluster_context, 
            "namespace": actual_namespace
        }, output=error_output)
        return {
            "output": error_output,
            "status_code": 0
        }

@function_tool
def patch_resource(resource_type: str, resource_name: str, patch: str, namespace: Optional[str] = None, 
                   patch_type: Optional[str] = None) -> Dict[str, str]:
    """
    Patch a resource using strategic merge patch, JSON merge patch, or JSON patch.
    
    Args:
        resource_type: Type of resource (pod, deployment, etc.)
        resource_name: Name of the resource
        patch: The patch to apply (JSON format)
        namespace: The namespace where the resource is located. If not specified, uses "default"
        patch_type: Type of patch (strategic, merge, json). Defaults to strategic
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_patch_type = patch_type if patch_type is not None else "strategic"
    
    command = build_kubectl_command(f"kubectl patch {resource_type} {resource_name} -n {actual_namespace}")
    
    if actual_patch_type != "strategic":
        command += f" --type={actual_patch_type}"
    
    command += f" -p '{patch}'"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("patch_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "patch": patch, "namespace": actual_namespace, "patch_type": actual_patch_type}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("patch_resource", kwargs={"resource_type": resource_type, "resource_name": resource_name, 
                                            "patch": patch, "namespace": actual_namespace, "patch_type": actual_patch_type}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def copy_files(source: str, destination: str, container: Optional[str] = None) -> Dict[str, str]:
    """
    Copy files and directories to and from containers.
    
    Args:
        source: Source path (local path or namespace/pod:path)
        destination: Destination path (local path or namespace/pod:path)
        container: Specific container name if pod has multiple containers
    
    Returns:
        Dict containing the command and its output
    """
    command = build_kubectl_command(f"kubectl cp {source} {destination}")
    
    if container:
        command += f" -c {container}"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("copy_files", kwargs={"source": source, "destination": destination, "container": container}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("copy_files", kwargs={"source": source, "destination": destination, "container": container}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def cordon_node(node_name: str) -> Dict[str, str]:
    """
    Mark a node as unschedulable.
    
    Args:
        node_name: Name of the node to cordon
    
    Returns:
        Dict containing the command and its output
    """
    command = build_kubectl_command(f"kubectl cordon {node_name}")
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("cordon_node", kwargs={"node_name": node_name}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("cordon_node", kwargs={"node_name": node_name}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def uncordon_node(node_name: str) -> Dict[str, str]:
    """
    Mark a node as schedulable.
    
    Args:
        node_name: Name of the node to uncordon
    
    Returns:
        Dict containing the command and its output
    """
    command = build_kubectl_command(f"kubectl uncordon {node_name}")
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("uncordon_node", kwargs={"node_name": node_name}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("uncordon_node", kwargs={"node_name": node_name}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def drain_node(node_name: str, ignore_daemonsets: Optional[bool] = None, delete_emptydir_data: Optional[bool] = None, 
               force: Optional[bool] = None, grace_period: Optional[int] = None) -> Dict[str, str]:
    """
    Drain a node in preparation for maintenance.
    
    Args:
        node_name: Name of the node to drain
        ignore_daemonsets: Ignore DaemonSet-managed pods. Defaults to True
        delete_emptydir_data: Delete pods with emptyDir volumes. Defaults to False
        force: Force deletion of pods not managed by a controller. Defaults to False
        grace_period: Grace period for pod termination in seconds
    
    Returns:
        Dict containing the command and its output
    """
    actual_ignore_daemonsets = ignore_daemonsets if ignore_daemonsets is not None else True
    actual_delete_emptydir = delete_emptydir_data if delete_emptydir_data is not None else False
    actual_force = force if force is not None else False
    
    command = build_kubectl_command(f"kubectl drain {node_name}")
    
    if actual_ignore_daemonsets:
        command += " --ignore-daemonsets"
    
    if actual_delete_emptydir:
        command += " --delete-emptydir-data"
    
    if actual_force:
        command += " --force"
    
    if grace_period is not None:
        command += f" --grace-period={grace_period}"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("drain_node", kwargs={"node_name": node_name, "ignore_daemonsets": actual_ignore_daemonsets,
                                        "delete_emptydir_data": actual_delete_emptydir, "force": actual_force,
                                        "grace_period": grace_period}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("drain_node", kwargs={"node_name": node_name, "ignore_daemonsets": actual_ignore_daemonsets,
                                        "delete_emptydir_data": actual_delete_emptydir, "force": actual_force,
                                        "grace_period": grace_period}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def top_pods(namespace: Optional[str] = None, all_namespaces: Optional[bool] = None, containers: Optional[bool] = None, 
             sort_by: Optional[str] = None) -> Dict[str, str]:
    """
    Show resource usage metrics for pods.
    
    Args:
        namespace: The namespace to show metrics for. If not specified, uses "default"
        all_namespaces: Show metrics for all namespaces. Defaults to False
        containers: Show metrics for containers within pods. Defaults to False
        sort_by: Sort by 'cpu' or 'memory'
    
    Returns:
        Dict containing the command and its output
    """
    actual_namespace = namespace if namespace is not None else "default"
    actual_all_namespaces = all_namespaces if all_namespaces is not None else False
    actual_containers = containers if containers is not None else False
    
    command = build_kubectl_command("kubectl top pods")
    
    if actual_all_namespaces:
        command += " --all-namespaces"
    elif not actual_all_namespaces:
        command += f" -n {actual_namespace}"
    
    if actual_containers:
        command += " --containers"
    
    if sort_by:
        command += f" --sort-by={sort_by}"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout or result.stderr
        track_call("top_pods", kwargs={"namespace": actual_namespace, "all_namespaces": actual_all_namespaces,
                                      "containers": actual_containers, "sort_by": sort_by}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("top_pods", kwargs={"namespace": actual_namespace, "all_namespaces": actual_all_namespaces,
                                      "containers": actual_containers, "sort_by": sort_by}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def top_nodes(node_name: Optional[str] = None, sort_by: Optional[str] = None) -> Dict[str, str]:
    """
    Show resource usage metrics for nodes.
    
    Args:
        node_name: Specific node to show metrics for
        sort_by: Sort by 'cpu' or 'memory'
    
    Returns:
        Dict containing the command and its output
    """
    command = build_kubectl_command("kubectl top nodes")
    
    if node_name:
        command += f" {node_name}"
    
    if sort_by:
        command += f" --sort-by={sort_by}"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("top_nodes", kwargs={"node_name": node_name, "sort_by": sort_by}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("top_nodes", kwargs={"node_name": node_name, "sort_by": sort_by}, output=error_output)
        return {"command": command, "output": error_output}

@function_tool
def debug_node(node_name: str, image: Optional[str] = None, interactive: Optional[bool] = None) -> Dict[str, str]:
    """
    Create a debugging session on a node.
    
    Args:
        node_name: Name of the node to debug
        image: Container image to use for debugging. Defaults to "busybox:1.28"
        interactive: Whether to create an interactive session. Defaults to True
    
    Returns:
        Dict containing the command and its output
    """
    actual_image = image if image is not None else "busybox:1.28"
    actual_interactive = interactive if interactive is not None else True
    
    command = build_kubectl_command(f"kubectl debug node/{node_name} --image={actual_image}")
    
    if actual_interactive:
        command += " -it"
    
    
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        output = result.stdout
        track_call("debug_node", kwargs={"node_name": node_name, "image": actual_image, "interactive": actual_interactive}, output=output)
        return {"command": command, "output": output}
    except subprocess.CalledProcessError as e:
        error_output = f"Error: {e.stderr}"
        track_call("debug_node", kwargs={"node_name": node_name, "image": actual_image, "interactive": actual_interactive}, output=error_output)
        return {"command": command, "output": error_output}
        
# Read-only operations - allowed in recon mode
kubectl_read_tools = [
    list_pods,
    list_pods_not_running,
    list_resources,
    describe_resource,
    get_pod_logs,
    get_events,
    get_cluster_info,
    get_resource_usage,
    rollout_history,
    rollout_status,
    top_pods,
    top_nodes
]

# Action/modification operations - only allowed when recon mode is off
kubectl_action_tools = [
    delete_resource,
    scale_deployment,
    exec_command,
    port_forward_pod,
    set_image,
    rollout_undo,
    rollout_restart,
    expose_service,
    label_resource,
    annotate_resource,
    autoscale_deployment,
    patch_resource,
    copy_files,
    cordon_node,
    uncordon_node,
    drain_node,
    debug_node
]

# Combined tools based on recon mode
def get_kubectl_tools():
    from config.config import get_recon_mode
    if get_recon_mode():
        return kubectl_read_tools
    else:
        return kubectl_read_tools + kubectl_action_tools

# For backward compatibility
kubectl_tools = get_kubectl_tools()