#-------------------------------------------------------------------------------------#
# Drift Analysis Tools - Kubernetes resource drift detection and comparison
# Analyzes configuration drift between multiple Kubernetes resources across clusters
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, List, Any
from typing_extensions import TypedDict
import datetime
import logging

# Import kubecontext from kubectl tools
from orchestrator.tools.kubectl import _current_kubecontext

logger = logging.getLogger(__name__)
tool_call_history = []

# Define typed resource for strict schema
class ResourceIdentifier(TypedDict):
    namespace: str
    name: str

# Operator server configuration
OPERATOR_SERVER_URL = 'http://localhost:4688'

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
        "timestamp": datetime.datetime.now().isoformat()
    })
    print(f"tool_call: {name}")

def make_k8s_request(method: str, k8s_api_path: str, params: Optional[Dict] = None,
                     data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """
    Make a request to Kubernetes API via operator server proxy.
    Example path: api/v1/namespaces/default/pods/my-pod
    """
    if not kubecontext:
        kubecontext = _current_kubecontext

    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided"}

    # Build URL through operator server proxy
    url = f"{OPERATOR_SERVER_URL}/api/v1/clusters/{kubecontext}/{k8s_api_path}"
    headers = {"Content-Type": "application/json"}

    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, verify=False)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, params=params, json=data, verify=False)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, params=params, json=data, verify=False)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, params=params, verify=False)
        else:
            return {"success": False, "error": f"Unsupported HTTP method: {method}"}

        response.raise_for_status()

        if response.content:
            return {"success": True, "data": response.json(), "status_code": response.status_code}
        else:
            return {"success": True, "data": None, "status_code": response.status_code}

    except requests.exceptions.RequestException as e:
        return {"success": False, "error": str(e), "status_code": getattr(e.response, 'status_code', None)}
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON decode error: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {str(e)}"}

def get_k8s_resource(resource_type: str, name: str, namespace: str,
                     kubecontext: str, api_group: Optional[str] = None,
                     api_version: str = "v1") -> Dict[str, Any]:
    """
    Fetch a specific Kubernetes resource via the operator proxy.

    Note: The operator proxy returns all resources cluster-wide, so we need to
    fetch all resources and then filter by name and namespace.

    Args:
        resource_type: Type of resource (e.g., 'deployments', 'pods', 'services', 'configmaps')
        name: Resource name
        namespace: Resource namespace
        kubecontext: Kubernetes cluster context
        api_group: API group (e.g., 'apps', 'batch'). None for core API.
        api_version: API version (default: 'v1')

    Returns:
        Dict containing the resource data or error
    """
    # Map resource_type to Kubernetes kind (singular, capitalized)
    # e.g., 'deployments' -> 'Deployment', 'services' -> 'Service'
    kind_map = {
        'deployments': 'Deployment',
        'statefulsets': 'StatefulSet',
        'daemonsets': 'DaemonSet',
        'services': 'Service',
        'configmaps': 'ConfigMap',
        'secrets': 'Secret',
        'pods': 'Pod',
        'jobs': 'Job',
        'cronjobs': 'CronJob',
        'replicasets': 'ReplicaSet',
        'ingresses': 'Ingress',
        'persistentvolumeclaims': 'PersistentVolumeClaim',
        'persistentvolumes': 'PersistentVolume',
    }

    # Build API path to list all resources (cluster-wide)
    if api_group:
        # For resources in API groups (e.g., apis/apps/v1/deployments)
        api_path = f"apis/{api_group}/{api_version}/{resource_type}"
    else:
        # For core API resources (e.g., api/v1/pods)
        api_path = f"api/{api_version}/{resource_type}"

    result = make_k8s_request("GET", api_path, kubecontext=kubecontext)

    if not result["success"]:
        return {"success": False, "error": result.get("error", "Unknown error")}

    # Filter the items to find the specific resource
    items = result["data"].get("items", [])

    for item in items:
        item_name = item.get("metadata", {}).get("name")
        item_namespace = item.get("metadata", {}).get("namespace")

        if item_name == name and item_namespace == namespace:
            # Ensure the kind field is set (some API responses might not include it)
            if "kind" not in item and resource_type in kind_map:
                item["kind"] = kind_map[resource_type]

            return {"success": True, "resource": item}

    # Resource not found
    return {
        "success": False,
        "error": f"Resource '{name}' not found in namespace '{namespace}'"
    }

def extract_drift_summary(baseline: Dict[str, Any], compared: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract a concise drift summary instead of sending full YAML to LLM.
    This prevents tool crashes and provides actionable drift information.

    Args:
        baseline: The baseline Kubernetes resource
        compared: List of resources to compare against baseline

    Returns:
        A compact drift summary with key differences
    """
    summary = {
        "baseline": {
            "name": baseline.get("metadata", {}).get("name", "unknown"),
            "namespace": baseline.get("metadata", {}).get("namespace", "unknown"),
            "kind": baseline.get("kind", "unknown"),
            "resourceVersion": baseline.get("metadata", {}).get("resourceVersion", "unknown"),
        },
        "drifts": []
    }

    # Helper function to extract key fields based on resource type
    def extract_key_fields(resource: Dict[str, Any]) -> Dict[str, Any]:
        """Extract important fields that commonly drift"""
        kind = resource.get("kind", "")
        spec = resource.get("spec", {})

        fields = {
            "labels": resource.get("metadata", {}).get("labels", {}),
            "annotations": resource.get("metadata", {}).get("annotations", {}),
        }

        # Extract specific fields based on resource kind
        if kind in ["Deployment", "StatefulSet", "DaemonSet"]:
            fields["replicas"] = spec.get("replicas")
            fields["strategy"] = spec.get("strategy", {}).get("type")

            # Container specs (image, resources, env vars count)
            containers = spec.get("template", {}).get("spec", {}).get("containers", [])
            fields["containers"] = [
                {
                    "name": c.get("name"),
                    "image": c.get("image"),
                    "resources": c.get("resources", {}),
                    "env_count": len(c.get("env", [])),
                }
                for c in containers
            ]

        elif kind == "Service":
            fields["type"] = spec.get("type")
            fields["ports"] = spec.get("ports", [])
            fields["selector"] = spec.get("selector", {})

        elif kind == "ConfigMap":
            data = resource.get("data", {})
            fields["data_keys"] = list(data.keys())
            fields["data_sizes"] = {k: len(str(v)) for k, v in data.items()}

        elif kind == "Secret":
            data = resource.get("data", {})
            fields["data_keys"] = list(data.keys())
            # Don't include actual secret values, just keys and sizes

        elif kind in ["Job", "CronJob"]:
            if kind == "CronJob":
                fields["schedule"] = spec.get("schedule")
            fields["completions"] = spec.get("completions")
            fields["parallelism"] = spec.get("parallelism")

        return fields

    # Extract baseline key fields
    baseline_fields = extract_key_fields(baseline)

    # Compare each resource
    for comp_resource in compared:
        comp_fields = extract_key_fields(comp_resource)

        drift_entry = {
            "resource": {
                "name": comp_resource.get("metadata", {}).get("name", "unknown"),
                "namespace": comp_resource.get("metadata", {}).get("namespace", "unknown"),
                "kind": comp_resource.get("kind", "unknown"),
            },
            "differences": {}
        }

        # Find differences
        all_keys = set(baseline_fields.keys()) | set(comp_fields.keys())

        for key in all_keys:
            baseline_val = baseline_fields.get(key)
            compared_val = comp_fields.get(key)

            if baseline_val != compared_val:
                drift_entry["differences"][key] = {
                    "baseline": baseline_val,
                    "current": compared_val
                }

        # Only add if there are actual differences
        if drift_entry["differences"]:
            summary["drifts"].append(drift_entry)

    return summary

@function_tool
def analyze_drift(
    resources: List[ResourceIdentifier],
    resource_type: str,
    api_group: Optional[str],
    api_version: str,
    kubecontext: str
) -> Dict[str, Any]:
    """
    Analyze configuration drift between Kubernetes resources.
    Compares multiple resources of the SAME type across different namespaces.

    The tool provides a COMPACT drift summary (not full YAML) that's safe for LLM consumption.
    It highlights key differences in: replicas, images, resources, labels, annotations, and other critical fields.

    Args:
        resources: List of resource objects, each with:
                  - namespace: Kubernetes namespace (e.g., "production", "staging", "app-prod")
                  - name: Resource name (e.g., "nginx-app", "api-service")

                  Minimum 2 resources required. First resource is the baseline.
                  Resources can have different names and be in different namespaces.

        resource_type: Type of resource plural form (e.g., "deployments", "services", "configmaps")

        api_group: API group for the resource. Use "apps" for deployments/statefulsets/daemonsets,
                  "batch" for jobs/cronjobs, None for core resources like services/configmaps/secrets

        api_version: API version (typically "v1")

        kubecontext: Kubernetes cluster context name

    Returns:
        Dict containing drift analysis summary with key differences

    Examples:
        # Compare two nginx deployments in different namespaces
        analyze_drift(
            resources=[
                {"namespace": "production", "name": "nginx-app"},
                {"namespace": "staging", "name": "nginx-app"}
            ],
            resource_type="deployments",
            api_group="apps",
            api_version="v1",
            kubecontext="my-cluster"
        )

        # Compare different services across namespaces
        analyze_drift(
            resources=[
                {"namespace": "app-prod", "name": "api-service"},
                {"namespace": "app", "name": "web-service"}
            ],
            resource_type="services",
            api_group=None,
            api_version="v1",
            kubecontext="my-cluster"
        )
    """
    try:
        # Validate inputs
        if not resources or len(resources) < 2:
            error_msg = "Drift analysis requires at least 2 resources to compare. Each resource must have: namespace and name. Example: [{'namespace': 'production', 'name': 'nginx-app'}, {'namespace': 'staging', 'name': 'nginx-app'}]"
            track_call("analyze_drift", kwargs=locals(), error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "output": json.dumps({"success": False, "error": error_msg}, indent=2)
            }

        # Parse and validate all resource identifiers
        parsed_resources = []
        for idx, resource_dict in enumerate(resources):
            if not isinstance(resource_dict, dict):
                error_msg = f"Resource at index {idx} must be a dictionary with namespace and name"
                track_call("analyze_drift", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "output": json.dumps({"success": False, "error": error_msg}, indent=2)
                }

            namespace = resource_dict.get("namespace")
            name = resource_dict.get("name")

            if not all([namespace, name]):
                error_msg = f"Resource at index {idx} is missing required fields. Need: namespace and name. Got: {resource_dict}"
                track_call("analyze_drift", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "output": json.dumps({"success": False, "error": error_msg}, indent=2)
                }

            parsed_resources.append({
                "namespace": namespace,
                "name": name,
                "id": f"{namespace}/{name}"
            })

        # First resource is the baseline
        baseline_resource = parsed_resources[0]
        baseline_namespace = baseline_resource["namespace"]
        baseline_name = baseline_resource["name"]
        comparison_resources = parsed_resources[1:]

        # Fetch baseline resource
        baseline_result = get_k8s_resource(
            resource_type=resource_type,
            name=baseline_name,
            namespace=baseline_namespace,
            kubecontext=kubecontext,
            api_group=api_group,
            api_version=api_version
        )

        if not baseline_result["success"]:
            # Provide helpful error message with available resources
            error_msg = f"Failed to fetch baseline resource '{baseline_name}' in namespace '{baseline_namespace}': {baseline_result.get('error')}"

            # Try to list available resources to help user
            try:
                if api_group:
                    api_path = f"apis/{api_group}/{api_version}/{resource_type}"
                else:
                    api_path = f"api/{api_version}/{resource_type}"

                list_result = make_k8s_request("GET", api_path, kubecontext=kubecontext)
                if list_result["success"]:
                    items = list_result["data"].get("items", [])
                    # Group by namespace
                    by_namespace = {}
                    for item in items:
                        ns = item.get('metadata', {}).get('namespace')
                        name = item.get('metadata', {}).get('name')
                        if ns not in by_namespace:
                            by_namespace[ns] = []
                        by_namespace[ns].append(name)

                    error_msg += f"\n\nAvailable {resource_type} by namespace:"
                    for ns, names in sorted(by_namespace.items())[:10]:
                        error_msg += f"\n  {ns}: {', '.join(names[:5])}"
            except:
                pass  # Ignore if we can't list resources

            track_call("analyze_drift", kwargs=locals(), error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "output": json.dumps({"success": False, "error": error_msg}, indent=2)
            }

        baseline_resource_data = baseline_result["resource"]

        # Fetch resources from all comparison namespaces
        compared_resources_data = []
        failed_comparisons = []

        for comp_resource in comparison_resources:
            comp_result = get_k8s_resource(
                resource_type=resource_type,
                name=comp_resource["name"],
                namespace=comp_resource["namespace"],
                kubecontext=kubecontext,
                api_group=api_group,
                api_version=api_version
            )

            if comp_result["success"]:
                compared_resources_data.append(comp_result["resource"])
            else:
                # Add more context to the error
                error_detail = f"Resource '{comp_resource['id']}' not found: {comp_result.get('error', 'Unknown error')}"
                failed_comparisons.append({
                    "namespace": comp_resource["namespace"],
                    "resource_name": comp_resource["name"],
                    "resource_id": comp_resource["id"],
                    "error": error_detail
                })

        # If no resources were successfully fetched for comparison
        if not compared_resources_data and failed_comparisons:
            error_msg = f"Failed to fetch any comparison resources for {resource_type}"

            # Add available namespaces to help user
            try:
                if api_group:
                    api_path = f"apis/{api_group}/{api_version}/{resource_type}"
                else:
                    api_path = f"api/{api_version}/{resource_type}"

                list_result = make_k8s_request("GET", api_path, kubecontext=kubecontext)
                if list_result["success"]:
                    items = list_result["data"].get("items", [])
                    # Group available resources by namespace
                    by_namespace = {}
                    for item in items:
                        ns = item.get('metadata', {}).get('namespace')
                        name = item.get('metadata', {}).get('name')
                        if ns not in by_namespace:
                            by_namespace[ns] = []
                        by_namespace[ns].append(name)

                    error_msg += f"\n\nAvailable {resource_type} by namespace:"
                    for ns, names in sorted(by_namespace.items())[:10]:
                        error_msg += f"\n  {ns}: {', '.join(names[:5])}"
            except:
                pass  # Ignore if we can't list resources

            track_call("analyze_drift", kwargs=locals(), error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "failed_comparisons": failed_comparisons,
                "output": json.dumps({
                    "success": False,
                    "error": error_msg,
                    "failed_comparisons": failed_comparisons
                }, indent=2)
            }

        # Extract drift summary (compact, LLM-friendly format)
        drift_summary = extract_drift_summary(baseline_resource_data, compared_resources_data)

        # Add failed comparisons to summary if any
        if failed_comparisons:
            drift_summary["failed_comparisons"] = failed_comparisons

        # Add metadata about the comparison
        drift_summary["resource_type"] = resource_type
        drift_summary["baseline_namespace"] = baseline_namespace
        drift_summary["compared_namespaces"] = [r["namespace"] for r in comparison_resources]

        # Prepare response
        response = {
            "success": True,
            "drift_summary": drift_summary,
            "resource_type": resource_type,
            "total_compared": len(compared_resources_data),
            "total_failed": len(failed_comparisons),
            "has_drift": len(drift_summary["drifts"]) > 0,
            "namespaces_analyzed": [baseline_namespace] + [r.get('metadata', {}).get('namespace')
                                                            for r in compared_resources_data]
        }

        track_call("analyze_drift", kwargs=locals(),
                  output=f"Analyzed drift for {resource_type} across {len(resources)} resources")

        response["output"] = json.dumps(response, indent=2)
        return response

    except Exception as e:
        error_msg = f"Failed to analyze drift: {str(e)}"
        track_call("analyze_drift", kwargs=locals(), error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "output": json.dumps({"success": False, "error": error_msg}, indent=2)
        }

# Drift tools list
drift_tools = [
    analyze_drift
]
