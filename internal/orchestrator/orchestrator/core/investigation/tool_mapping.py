"""
Tool Title Mapping Module
Human-readable titles and details for tool calls.
"""
import json
from typing import Dict, Union, Any, Optional

TOOL_TITLE_MAPPING = {
    # Discovery Agent Tools
    "get_pods": lambda args: f"Analyzing pods in {args.get('namespace', 'default')}",
    "list_pods": lambda args: f"Listing pods in {args.get('namespace', 'default')}",
    "describe_pod": lambda args: f"Inspecting pod/{args.get('pod_name', args.get('name', 'unknown'))}",
    "describe_deployment": lambda args: f"Analyzing deployment/{args.get('name', 'unknown')}",
    "describe_resource": lambda args: f"Describing {args.get('kind', args.get('resource_type', 'resource'))}/{args.get('resource_name', args.get('name', 'unknown'))}",
    "get_deployments": lambda args: f"Fetching deployments in {args.get('namespace', 'default')}",
    "list_resources": lambda args: f"Listing {args.get('resource_type', 'resources')} in {args.get('namespace', 'default')}",
    "list_pods_not_running": lambda args: f"Finding non-running pods in {args.get('namespace', 'default')}",
    "get_events": lambda args: f"Checking recent events in {args.get('namespace', 'default')}",
    "get_configmaps": lambda args: "Reviewing ConfigMaps",
    "get_secrets": lambda args: "Analyzing Secrets (metadata only)",
    "get_nodes": lambda args: "Checking cluster nodes",
    "get_services": lambda args: f"Analyzing services in {args.get('namespace', 'default')}",
    "get_namespaces": lambda args: "Listing namespaces",
    "get_replicasets": lambda args: f"Checking ReplicaSets in {args.get('namespace', 'default')}",
    "get_statefulsets": lambda args: f"Checking StatefulSets in {args.get('namespace', 'default')}",
    "get_daemonsets": lambda args: f"Checking DaemonSets in {args.get('namespace', 'default')}",
    "get_jobs": lambda args: f"Checking Jobs in {args.get('namespace', 'default')}",
    "get_cronjobs": lambda args: f"Checking CronJobs in {args.get('namespace', 'default')}",
    "get_ingresses": lambda args: f"Checking Ingresses in {args.get('namespace', 'default')}",
    "get_pvcs": lambda args: f"Checking PVCs in {args.get('namespace', 'default')}",
    "get_pvs": lambda args: "Checking Persistent Volumes",
    
    # Resource YAML and Dependency Analysis
    "get_resource_yaml": lambda args: f"Analyzing {args.get('resource_type', 'resource').title()}/{args.get('resource_name', 'unknown')}",
    "get_resource_dependency": lambda args: f"Mapping dependencies for {args.get('resource_type', 'resource')}/{args.get('resource_name', 'unknown')}",
    
    # Monitoring Agent Tools
    "query_prometheus": lambda args: f"Querying metrics: {str(args.get('query', 'unknown'))[:40]}...",
    "get_alerts": lambda args: "Fetching active alerts",
    "analyze_resource_usage": lambda args: "Analyzing resource usage patterns",
    "get_metrics": lambda args: f"Fetching metrics for {args.get('resource', 'unknown')}",
    
    # Logging Agent Tools
    "get_pod_logs": lambda args: f"Parsing logs for {str(args.get('pod_name', args.get('name', 'unknown')))[:30]}",
    "search_logs": lambda args: f"Searching logs for: {str(args.get('pattern', 'unknown'))[:30]}",
    "get_container_logs": lambda args: f"Getting logs from container {args.get('container', 'unknown')}",
    
    # Todo Board Tools
    "create_todo": lambda args: f"Creating todo: {str(args.get('content', 'task'))[:40]}...",
    "update_todo": lambda args: f"Updating todo {args.get('id', 'unknown')} to {args.get('status', 'updated')}",
    "get_todos": lambda args: f"Retrieving todos for investigation",
    "list_todos": lambda args: "Listing all investigation todos",
    
    # Supervisor Tools (sub-agents) - Investigation phases
    "log_analysis": lambda args: "Investigating Logs",
    "resource_discovery": lambda args: "Discovering Resources & Events",
    "metrics_analysis": lambda args: "Analyzing Metrics & Performance",
    
    # Legacy mappings
    "kubernetes_discovery": lambda args: "Discovering Resources & Events",
    "metrics_and_monitoring": lambda args: "Analyzing Metrics & Performance",
    "external_integrations": lambda args: "Checking External Integrations",
}


def get_tool_title(tool_name: str, arguments: Union[Dict, str]) -> str:
    """Convert tool call to human-readable title."""
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except:
            arguments = {}
    
    if not isinstance(arguments, dict):
        arguments = {}
    
    if tool_name in TOOL_TITLE_MAPPING:
        try:
            return TOOL_TITLE_MAPPING[tool_name](arguments)
        except Exception:
            pass
    
    # Fallback: convert snake_case to Title Case
    return tool_name.replace("_", " ").title()


def get_tool_detail(
    tool_name: str, 
    arguments: Union[Dict, str], 
    output: Any = None
) -> str:
    """Generate detail string based on tool output."""
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except:
            arguments = {}
    
    if not isinstance(arguments, dict):
        arguments = {}
    
    if output:
        if isinstance(output, str) and len(output) > 100:
            if "error" in output.lower():
                return "Errors detected in output"
            if "warning" in output.lower():
                return "Warnings found"
            return output[:80] + "..."
        elif isinstance(output, str):
            return output[:100] if output else "Executed successfully"
    
    # Default: show key argument
    for key in ["namespace", "pod_name", "deployment_name", "query", "name"]:
        if key in arguments:
            return f"{key}: {arguments[key]}"
    
    return "Executed successfully"
