#-------------------------------------------------------------------------------------#
# ArgoCD Tools - Complete set of ArgoCD operations for GitOps application management.
# Includes application lifecycle management, resource monitoring, and sync operations with command tracking.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, List, Any
import datetime
from urllib.parse import urljoin
import os
import logging

# Import config manager to get cluster-specific configurations
try:
    from config.config import get_cluster_config
except ImportError:
    # Fallback if config module is not available
    def get_cluster_config(cluster_name: str) -> Dict[str, Any]:
        return {}

# Import kubecontext from kubectl tools
from orchestrator.tools.kubectl import _current_kubecontext

logger = logging.getLogger(__name__)
tool_call_history = []

# Operator server configuration
OPERATOR_SERVER_URL = 'http://localhost:4688'

# Global configuration cache
_argocd_config_cache = {}

def get_argocd_config(cluster_name: str) -> Dict[str, Any]:
    """Get ArgoCD configuration for a specific cluster from cluster config"""
    if cluster_name in _argocd_config_cache:
        return _argocd_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        argocd_config = cluster_config.get('argocd', {})
        
        if not argocd_config:
            logger.warning(f"No ArgoCD configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': argocd_config.get('enabled', False),
            'namespace': argocd_config.get('namespace', 'argocd'),
            'service_address': argocd_config.get('service_address', ''),
            'url': argocd_config.get('url', ''),  # External URL if available
            'token': argocd_config.get('token', ''),
        }
        
        # Priority: Use external URL if provided, otherwise build proxy URL
        if config['url']:
            # User provided external URL - use it directly
            config['effective_url'] = config['url']
            logger.info(f"Using external ArgoCD URL for {cluster_name}: {config['url']}")
        elif config['service_address'] and config['namespace']:
            # Build proxy URL through operator server
            config['effective_url'] = f"{OPERATOR_SERVER_URL}/api/v1/clusters/{cluster_name}/api/v1/namespaces/{config['namespace']}/services/{config['service_address']}/proxy"
            logger.info(f"Using proxy ArgoCD URL for {cluster_name}: {config['effective_url']}")
        else:
            logger.error(f"No valid ArgoCD configuration for cluster {cluster_name}: missing both 'url' and 'service_address/namespace'")
            return {}
        
        # Cache the configuration
        _argocd_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load ArgoCD config for cluster {cluster_name}: {e}")
        return {}

def clear_argocd_config_cache():
    """Clear the configuration cache to force reload"""
    global _argocd_config_cache
    _argocd_config_cache = {}

def get_current_kubecontext() -> str:
    """Get current kubecontext from global variable set by kubectl tools"""
    if _current_kubecontext:
        return _current_kubecontext
    
    # Try to get from environment variable as fallback
    kubecontext = os.getenv('CURRENT_CLUSTER_NAME', '')
    
    if not kubecontext:
        logger.warning("No current kubecontext found, tools may require kubecontext parameter")
    
    return kubecontext

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

def get_argocd_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for ArgoCD API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add Bearer token if configured
    if config.get('token'):
        headers["Authorization"] = f"Bearer {config['token']}"
    
    return headers

def make_k8s_argocd_request(method: str, k8s_api_path: str, params: Optional[Dict] = None, data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """
    Make a request to ArgoCD resources via Kubernetes API directly.
    Uses operator server proxy like the Tauri platform.
    Example: apis/argoproj.io/v1alpha1/applications
    """
    if not kubecontext:
        kubecontext = get_current_kubecontext()

    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided"}

    # Build URL through operator server proxy (matching Tauri approach)
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

def make_argocd_request(method: str, endpoint: str, params: Optional[Dict] = None, data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to ArgoCD API using kubecontext-specific configuration"""

    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()

    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}

    # Get kubecontext-specific ArgoCD configuration
    config = get_argocd_config(kubecontext)
    if not config:
        return {"success": False, "error": f"No ArgoCD configuration found for kubecontext {kubecontext}"}

    if not config.get('enabled', False):
        return {"success": False, "error": f"ArgoCD is not enabled for kubecontext {kubecontext}"}

    effective_url = config.get('effective_url')
    if not effective_url:
        return {"success": False, "error": f"No valid ArgoCD URL configured for kubecontext {kubecontext}"}

    url = urljoin(effective_url.rstrip('/') + '/', endpoint.lstrip('/'))
    headers = get_argocd_headers(config)

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

#-------------------------------------------------------------------------------------#
# APPLICATION MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_all_applications(kubecontext: str) -> Dict[str, Any]:
    """
    Lists all ArgoCD applications without any filters.
    Uses Kubernetes API directly (apis/argoproj.io/v1alpha1/applications)
    for faster access without ArgoCD server dependency.

    Returns:
        Dict containing the list of all applications and metadata
    """
    try:
        # Use Kubernetes API directly (matching Tauri platform approach)
        result = make_k8s_argocd_request(
            "GET",
            "apis/argoproj.io/v1alpha1/applications",
            kubecontext=kubecontext
        )

        if result["success"]:
            applications_data = result["data"]
            track_call("list_all_applications", kwargs=locals(), output=f"Found {len(applications_data.get('items', []))} applications")
            response = {
                "success": True,
                "applications": applications_data.get("items", []),
                "metadata": applications_data.get("metadata", {}),
                "total_count": len(applications_data.get("items", []))
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_all_applications", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result

    except Exception as e:
        error_msg = f"Failed to list all applications: {str(e)}"
        track_call("list_all_applications", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def list_applications(kubecontext: str, search: Optional[str] = None, projects: Optional[List[str]] = None, 
                     app_namespace: Optional[str] = None, clusters: Optional[List[str]] = None,
                     namespaces: Optional[List[str]] = None, repos: Optional[List[str]] = None,
                     sync_statuses: Optional[List[str]] = None, health_statuses: Optional[List[str]] = None,
                     auto_sync_enabled: Optional[bool] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Lists and filters all ArgoCD applications.
    
    Args:
        search: Search term for application names
        projects: List of project names to filter by
        app_namespace: Application namespace to filter by
        clusters: List of cluster names to filter by
        namespaces: List of namespaces to filter by
        repos: List of repository URLs to filter by
        sync_statuses: List of sync statuses to filter by (Synced, OutOfSync, Unknown)
        health_statuses: List of health statuses to filter by (Healthy, Progressing, Degraded, Unknown)
        auto_sync_enabled: Whether to filter by auto-sync enabled status
        limit: Maximum number of applications to return
        
    Returns:
        Dict containing the list of applications and metadata
    """
    try:
        params = {}
        
        if search:
            params["search"] = search
        if projects:
            params["projects"] = projects
        if app_namespace:
            params["appNamespace"] = app_namespace
        if clusters:
            params["clusters"] = clusters
        if namespaces:
            params["namespaces"] = namespaces
        if repos:
            params["repos"] = repos
        if sync_statuses:
            params["syncStatuses"] = sync_statuses
        if health_statuses:
            params["healthStatuses"] = health_statuses
        if auto_sync_enabled is not None:
            params["autoSyncEnabled"] = auto_sync_enabled
        if limit:
            params["limit"] = limit
        
        result = make_argocd_request("GET", "/api/v1/applications", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            applications_data = result["data"]
            track_call("list_applications", kwargs=locals(), output=f"Found {len(applications_data.get('items', []))} applications")
            response = {
                "success": True,
                "applications": applications_data.get("items", []),
                "metadata": applications_data.get("metadata", {}),
                "total_count": len(applications_data.get("items", []))
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_applications", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list applications: {str(e)}"
        track_call("list_applications", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
      
@function_tool
def get_application(application_name: str, kubecontext: str, namespace: Optional[str] = "argocd") -> Dict[str, Any]:
    """
    Gets detailed information about a specific ArgoCD application.
    Uses Kubernetes API directly (apis/argoproj.io/v1alpha1/namespaces/{namespace}/applications/{name})
    for faster access without ArgoCD server dependency.

    Args:
        application_name: Name of the application
        kubecontext: Kubernetes context name
        namespace: Namespace where ArgoCD application resource exists (default: argocd)

    Returns:
        Dict containing detailed application information
    """
    try:
        # Use Kubernetes API directly to get specific application
        # ArgoCD applications are K8s custom resources in the argocd namespace
        result = make_k8s_argocd_request(
            "GET",
            f"apis/argoproj.io/v1alpha1/namespaces/{namespace}/applications/{application_name}",
            kubecontext=kubecontext
        )

        if result["success"]:
            track_call("get_application", kwargs=locals(), output="Application details retrieved")
            response = {
                "success": True,
                "application": result["data"]
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_application", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result

    except Exception as e:
        error_msg = f"Failed to get application: {str(e)}"
        track_call("get_application", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def create_application(application_spec_json: str, kubecontext: str, upsert: Optional[bool] = None, 
                      validate_spec: Optional[bool] = None) -> Dict[str, Any]:
    """
    Creates a new ArgoCD application.
    
    Args:
        application_spec_json: JSON string of application specification (V1alpha1Application format)
        upsert: Whether to update if application already exists
        validate_spec: Whether to validate the application spec
        
    Returns:
        Dict containing the created application information
    """
    try:
        try:
            application_spec = json.loads(application_spec_json)
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Invalid JSON in application_spec: {str(e)}"}

        params = {}
        
        if upsert is not None:
            params["upsert"] = upsert
        if validate_spec is not None:
            params["validate"] = validate_spec
        
        result = make_argocd_request("POST", "/api/v1/applications", params=params, data=application_spec, kubecontext=kubecontext)
        
        if result["success"]:
            track_call("create_application", kwargs=locals(), output="Application created successfully")
            response = {
                "success": True,
                "application": result["data"]
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("create_application", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to create application: {str(e)}"
        track_call("create_application", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def update_application(application_name: str, application_spec_json: str, kubecontext: str,
                      validate_spec: Optional[bool] = None, project: Optional[str] = None) -> Dict[str, Any]:
    """
    Updates an existing ArgoCD application.
    
    Args:
        application_name: Name of the application to update
        application_spec_json: JSON string of updated application specification
        validate_spec: Whether to validate the application spec
        project: Project name
        
    Returns:
        Dict containing the updated application information
    """
    try:
        try:
            application_spec = json.loads(application_spec_json)
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Invalid JSON in application_spec: {str(e)}"}

        params = {}
        
        if validate_spec is not None:
            params["validate"] = validate_spec
        if project:
            params["project"] = project
        
        result = make_argocd_request("PUT", f"/api/v1/applications/{application_name}", params=params, data=application_spec, kubecontext=kubecontext)
        
        if result["success"]:
            track_call("update_application", kwargs=locals(), output="Application updated successfully")
            response = {
                "success": True,
                "application": result["data"]
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("update_application", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to update application: {str(e)}"
        track_call("update_application", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def delete_application(application_name: str, kubecontext: str, cascade: Optional[bool] = None, 
                      propagation_policy: Optional[str] = None, app_namespace: Optional[str] = None,
                      project: Optional[str] = None) -> Dict[str, Any]:
    """
    Deletes an ArgoCD application.
    
    Args:
        application_name: Name of the application to delete
        cascade: Whether to cascade delete resources
        propagation_policy: Resource deletion propagation policy
        app_namespace: Application namespace
        project: Project name
        
    Returns:
        Dict containing the deletion result
    """
    try:
        params = {}
        
        if cascade is not None:
            params["cascade"] = cascade
        if propagation_policy:
            params["propagationPolicy"] = propagation_policy
        if app_namespace:
            params["appNamespace"] = app_namespace
        if project:
            params["project"] = project
        
        result = make_argocd_request("DELETE", f"/api/v1/applications/{application_name}", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            track_call("delete_application", kwargs=locals(), output="Application deleted successfully")
            response = {
                "success": True,
                "message": f"Application {application_name} deleted successfully"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("delete_application", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to delete application: {str(e)}"
        track_call("delete_application", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def sync_application(application_name: str, kubecontext: str, dry_run: Optional[bool] = None, prune: Optional[bool] = None,
                    revision: Optional[str] = None, resources_json: Optional[str] = None,
                    strategy_json: Optional[str] = None, app_namespace: Optional[str] = None,
                    project: Optional[str] = None) -> Dict[str, Any]:
    """
    Triggers a sync operation on an ArgoCD application.
    
    Args:
        application_name: Name of the application to sync
        dry_run: Whether to perform a dry run
        prune: Whether to prune resources
        revision: Git revision to sync to
        resources_json: JSON string of specific resources to sync
        strategy_json: JSON string of sync strategy configuration
        app_namespace: Application namespace
        project: Project name
        
    Returns:
        Dict containing the sync operation result
    """
    try:
        sync_request = {}
        
        if dry_run is not None:
            sync_request["dryRun"] = dry_run
        if prune is not None:
            sync_request["prune"] = prune
        if revision:
            sync_request["revision"] = revision
            
        if resources_json:
            try:
                sync_request["resources"] = json.loads(resources_json)
            except json.JSONDecodeError as e:
                return {"success": False, "error": f"Invalid JSON in resources: {str(e)}"}
                
        if strategy_json:
            try:
                sync_request["strategy"] = json.loads(strategy_json)
            except json.JSONDecodeError as e:
                return {"success": False, "error": f"Invalid JSON in strategy: {str(e)}"}
                
        if app_namespace:
            sync_request["appNamespace"] = app_namespace
        if project:
            sync_request["project"] = project
        
        sync_request["name"] = application_name
        
        result = make_argocd_request("POST", f"/api/v1/applications/{application_name}/sync", data=sync_request, kubecontext=kubecontext)
        
        if result["success"]:
            track_call("sync_application", kwargs=locals(), output="Application sync initiated")
            response = {
                "success": True,
                "application": result["data"]
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("sync_application", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to sync application: {str(e)}"
        track_call("sync_application", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# CONFIGURATION AND UTILITY FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_argocd_config_tool(kubecontext: str) -> Dict[str, Any]:
    """
    Get ArgoCD configuration for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
    
    Returns:
        Dict containing the kubecontext's ArgoCD configuration
    """
    
    try:
        config = get_argocd_config(kubecontext)
        
        if not config:
            return {
                "success": False, 
                "error": f"No ArgoCD configuration found for kubecontext {kubecontext}",
                "kubecontext": kubecontext,
                "output": json.dumps({"success": False, "error": f"No ArgoCD configuration found for kubecontext {kubecontext}"}, indent=2)
            }
        
        # Return sanitized config (without sensitive data)
        safe_config = {
            "success": True,
            "kubecontext": config['cluster_name'],
            "enabled": config['enabled'],
            "namespace": config['namespace'],
            "service_address": config['service_address'],
            "url": config['url'],
            "effective_url": config['effective_url'],
            "has_token": bool(config.get('token'))
        }
        
        track_call("get_argocd_config_tool", kwargs={"kubecontext": kubecontext}, 
                  output=f"Retrieved config for kubecontext {kubecontext}")
        safe_config["output"] = json.dumps(safe_config, indent=2)
        return safe_config
        
    except Exception as e:
        error_msg = f"Failed to get ArgoCD configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("get_argocd_config_tool", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "kubecontext": kubecontext, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def set_argocd_config(kubecontext: str, namespace: str = "argocd", 
                      service_address: Optional[str] = None, url: Optional[str] = None,
                      token: Optional[str] = None, enabled: bool = True) -> Dict[str, Any]:
    """
    Set ArgoCD configuration for a specific kubecontext and save to additionalConfig.yaml.
    
    Args:
        kubecontext: Kubernetes context to configure ArgoCD for
        namespace: Kubernetes namespace where ArgoCD is running (default: argocd)
        service_address: Internal service address (e.g., 'argocd-server.argocd:443')
        url: External ArgoCD URL (takes priority over service_address)
        token: Bearer token for authentication
        enabled: Whether ArgoCD is enabled for this kubecontext
        
    Returns:
        Dict containing configuration result
    """
    try:
        # Import here to avoid circular imports
        from config.config import update_cluster_config
        
        # Build the argocd configuration
        argocd_config = {
            "enabled": enabled,
            "namespace": namespace
        }
        
        # Add URL or service_address
        if url:
            argocd_config["url"] = url
        elif service_address:
            argocd_config["service_address"] = service_address
        else:
            return {
                "success": False, 
                "error": "Either 'url' or 'service_address' must be provided",
                "output": json.dumps({"success": False, "error": "Either 'url' or 'service_address' must be provided"}, indent=2)
            }
        
        # Add authentication if provided
        if token:
            argocd_config["token"] = token
        
        # Update cluster configuration
        cluster_config = {"argocd": argocd_config}
        success = update_cluster_config(kubecontext, cluster_config)
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to save ArgoCD configuration for kubecontext {kubecontext}",
                "output": json.dumps({"success": False, "error": f"Failed to save ArgoCD configuration for kubecontext {kubecontext}"}, indent=2)
            }
        
        # Clear cache to force reload
        clear_argocd_config_cache()
        
        # Test the connection
        test_result = test_argocd_connection(kubecontext)
        
        result = {
            "success": True,
            "message": f"ArgoCD configuration saved for kubecontext {kubecontext}",
            "kubecontext": kubecontext,
            "configuration": {
                "enabled": enabled,
                "namespace": namespace,
                "url": url,
                "service_address": service_address,
                "has_token": bool(token)
            },
            "connection_test": test_result.get("success", False),
            "connection_error": test_result.get("error") if not test_result.get("success") else None
        }
        
        track_call("set_argocd_config", kwargs={
            "kubecontext": kubecontext, 
            "namespace": namespace,
            "has_url": bool(url),
            "has_service_address": bool(service_address)
        }, output=f"Configuration saved for kubecontext {kubecontext}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to set ArgoCD configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("set_argocd_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def test_argocd_connection(kubecontext: str) -> Dict[str, Any]:
    """
    Test ArgoCD connection for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to test connection for
    
    Returns:
        Dict containing connection test results
    """
    
    try:
        # Test with a simple applications list API call
        result = make_argocd_request("GET", "/api/v1/applications", kubecontext=kubecontext)
        
        if result["success"]:
            applications_data = result["data"]
            app_count = len(applications_data.get("items", []))
            
            track_call("test_argocd_connection", kwargs={"kubecontext": kubecontext}, 
                      output=f"Connection successful for kubecontext {kubecontext}")
            
            response = {
                "success": True,
                "kubecontext": kubecontext,
                "message": "ArgoCD connection successful",
                "applications_count": app_count
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("test_argocd_connection", kwargs={"kubecontext": kubecontext}, 
                      error=result.get("error"))
            response = {
                "success": False,
                "kubecontext": kubecontext,
                "error": f"ArgoCD connection failed: {result.get('error')}",
                "connection_test": False
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to test ArgoCD connection for kubecontext {kubecontext}: {str(e)}"
        track_call("test_argocd_connection", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "kubecontext": kubecontext, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# RESOURCE MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_application_resource_tree(application_name: str, kubecontext: str, app_namespace: Optional[str] = None,
                                 project: Optional[str] = None, namespace: Optional[str] = None,
                                 name: Optional[str] = None, version: Optional[str] = None,
                                 group: Optional[str] = None, kind: Optional[str] = None) -> Dict[str, Any]:
    """
    Gets the resource tree for a specific ArgoCD application.
    
    Args:
        application_name: Name of the application
        app_namespace: Application namespace
        project: Project name
        namespace: Resource namespace filter
        name: Resource name filter
        version: Resource version filter
        group: Resource group filter
        kind: Resource kind filter
        
    Returns:
        Dict containing the application resource tree
    """
    try:
        params = {}
        
        if app_namespace:
            params["appNamespace"] = app_namespace
        if project:
            params["project"] = project
        if namespace:
            params["namespace"] = namespace
        if name:
            params["name"] = name
        if version:
            params["version"] = version
        if group:
            params["group"] = group
        if kind:
            params["kind"] = kind
        
        result = make_argocd_request("GET", f"/api/v1/applications/{application_name}/resource-tree", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            tree_data = result["data"]
            track_call("get_application_resource_tree", kwargs=locals(), 
                      output=f"Retrieved resource tree with {len(tree_data.get('nodes', []))} nodes")
            return {
                "success": True,
                "resource_tree": tree_data
            }
        else:
            track_call("get_application_resource_tree", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get application resource tree: {str(e)}"
        track_call("get_application_resource_tree", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def get_application_managed_resources(application_name: str, kubecontext: str, app_namespace: Optional[str] = None,
                                     project: Optional[str] = None, namespace: Optional[str] = None,
                                     name: Optional[str] = None, version: Optional[str] = None,
                                     group: Optional[str] = None, kind: Optional[str] = None) -> Dict[str, Any]:
    """
    Gets managed resources for a specific ArgoCD application.
    
    Args:
        application_name: Name of the application
        app_namespace: Application namespace
        project: Project name
        namespace: Resource namespace filter
        name: Resource name filter
        version: Resource version filter
        group: Resource group filter
        kind: Resource kind filter
        
    Returns:
        Dict containing the managed resources
    """
    try:
        params = {}
        
        if app_namespace:
            params["appNamespace"] = app_namespace
        if project:
            params["project"] = project
        if namespace:
            params["namespace"] = namespace
        if name:
            params["name"] = name
        if version:
            params["version"] = version
        if group:
            params["group"] = group
        if kind:
            params["kind"] = kind
        
        result = make_argocd_request("GET", f"/api/v1/applications/{application_name}/managed-resources", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            resources_data = result["data"]
            track_call("get_application_managed_resources", kwargs=locals(), 
                      output=f"Retrieved {len(resources_data.get('items', []))} managed resources")
            return {
                "success": True,
                "managed_resources": resources_data.get("items", [])
            }
        else:
            track_call("get_application_managed_resources", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get application managed resources: {str(e)}"
        track_call("get_application_managed_resources", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}


@function_tool
def get_application_workload_logs(application_name: str, kubecontext: str, app_namespace: Optional[str] = None,
                                 project: Optional[str] = None, namespace: Optional[str] = None,
                                 resource_name: Optional[str] = None, version: Optional[str] = None,
                                 group: Optional[str] = None, kind: Optional[str] = None,
                                 container: Optional[str] = None, tail_lines: Optional[int] = None,
                                 follow: Optional[bool] = None, since_seconds: Optional[int] = None) -> Dict[str, Any]:
    """
    Gets logs for application workloads (Pods, Deployments, etc.).
    
    Args:
        application_name: Name of the application
        app_namespace: Application namespace
        project: Project name
        namespace: Resource namespace
        resource_name: Name of the resource
        version: Resource version
        group: Resource group
        kind: Resource kind
        container: Container name
        tail_lines: Number of lines to tail
        follow: Whether to follow logs
        since_seconds: Show logs since this many seconds ago
        
    Returns:
        Dict containing the workload logs
    """
    try:
        params = {}
        
        if app_namespace:
            params["appNamespace"] = app_namespace
        if project:
            params["project"] = project
        if namespace:
            params["namespace"] = namespace
        if resource_name:
            params["resourceName"] = resource_name
        if version:
            params["version"] = version
        if group:
            params["group"] = group
        if kind:
            params["kind"] = kind
        if container:
            params["container"] = container
        if tail_lines:
            params["tailLines"] = tail_lines
        if follow is not None:
            params["follow"] = follow
        if since_seconds:
            params["sinceSeconds"] = since_seconds
        
        result = make_argocd_request("GET", f"/api/v1/applications/{application_name}/logs", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            track_call("get_application_workload_logs", kwargs=locals(), output="Workload logs retrieved")
            return {
                "success": True,
                "logs": result["data"]
            }
        else:
            track_call("get_application_workload_logs", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get application workload logs: {str(e)}"
        track_call("get_application_workload_logs", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def get_resource_events(application_name: str, kubecontext: str, resource_namespace: Optional[str] = None,
                       resource_name: Optional[str] = None, resource_uid: Optional[str] = None,
                       app_namespace: Optional[str] = None, project: Optional[str] = None) -> Dict[str, Any]:
    """
    Gets events for resources managed by an ArgoCD application.
    
    Args:
        application_name: Name of the application
        resource_namespace: Namespace of the resource
        resource_name: Name of the resource
        resource_uid: UID of the resource
        app_namespace: Application namespace
        project: Project name
        
    Returns:
        Dict containing the resource events
    """
    try:
        params = {}
        
        if resource_namespace:
            params["resourceNamespace"] = resource_namespace
        if resource_name:
            params["resourceName"] = resource_name
        if resource_uid:
            params["resourceUID"] = resource_uid
        if app_namespace:
            params["appNamespace"] = app_namespace
        if project:
            params["project"] = project
        
        result = make_argocd_request("GET", f"/api/v1/applications/{application_name}/events", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            events_data = result["data"]
            track_call("get_resource_events", kwargs=locals(), 
                      output=f"Retrieved {len(events_data.get('items', []))} events")
            return {
                "success": True,
                "events": events_data.get("items", [])
            }
        else:
            track_call("get_resource_events", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get resource events: {str(e)}"
        track_call("get_resource_events", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def get_resource_actions(application_name: str, kubecontext: str, app_namespace: Optional[str] = None,
                        project: Optional[str] = None, namespace: Optional[str] = None,
                        resource_name: Optional[str] = None, version: Optional[str] = None,
                        group: Optional[str] = None, kind: Optional[str] = None) -> Dict[str, Any]:
    """
    Gets available actions for resources managed by an ArgoCD application.
    
    Args:
        application_name: Name of the application
        app_namespace: Application namespace
        project: Project name
        namespace: Resource namespace
        resource_name: Name of the resource
        version: Resource version
        group: Resource group
        kind: Resource kind
        
    Returns:
        Dict containing the available resource actions
    """
    try:
        params = {}
        
        if app_namespace:
            params["appNamespace"] = app_namespace
        if project:
            params["project"] = project
        if namespace:
            params["namespace"] = namespace
        if resource_name:
            params["resourceName"] = resource_name
        if version:
            params["version"] = version
        if group:
            params["group"] = group
        if kind:
            params["kind"] = kind
        
        result = make_argocd_request("GET", f"/api/v1/applications/{application_name}/resource/actions", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            actions_data = result["data"]
            track_call("get_resource_actions", kwargs=locals(), 
                      output=f"Retrieved {len(actions_data.get('actions', []))} actions")
            return {
                "success": True,
                "actions": actions_data.get("actions", [])
            }
        else:
            track_call("get_resource_actions", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get resource actions: {str(e)}"
        track_call("get_resource_actions", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def run_resource_action(application_name: str, action: str, kubecontext: str, app_namespace: Optional[str] = None,
                       project: Optional[str] = None, namespace: Optional[str] = None,
                       resource_name: Optional[str] = None, version: Optional[str] = None,
                       group: Optional[str] = None, kind: Optional[str] = None) -> Dict[str, Any]:
    """
    Runs an action on a resource managed by an ArgoCD application.
    
    Args:
        application_name: Name of the application
        action: Action to run
        app_namespace: Application namespace
        project: Project name
        namespace: Resource namespace
        resource_name: Name of the resource
        version: Resource version
        group: Resource group
        kind: Resource kind
        
    Returns:
        Dict containing the action execution result
    """
    try:
        params = {}
        
        if app_namespace:
            params["appNamespace"] = app_namespace
        if project:
            params["project"] = project
        if namespace:
            params["namespace"] = namespace
        if resource_name:
            params["resourceName"] = resource_name
        if version:
            params["version"] = version
        if group:
            params["group"] = group
        if kind:
            params["kind"] = kind
        
        result = make_argocd_request("POST", f"/api/v1/applications/{application_name}/resource/actions", 
                                   params=params, data=action, kubecontext=kubecontext)
        
        if result["success"]:
            track_call("run_resource_action", kwargs=locals(), output="Resource action executed successfully")
            return {
                "success": True,
                "result": result["data"]
            }
        else:
            track_call("run_resource_action", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to run resource action: {str(e)}"
        track_call("run_resource_action", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}


@function_tool
def get_argocd_navigation_url(kubecontext: str, resource_type: str, resource_name: Optional[str] = None, 
                             namespace: Optional[str] = None, project: Optional[str] = None) -> Dict[str, Any]:
    """
    Get navigation URLs for ArgoCD web UI to view specific resources.
    
    Args:
        resource_type: Type of resource ('home', 'applications', 'application', 'settings', 'clusters', 'repositories', 'projects')
        resource_name: Specific resource name (required for 'application' type)
        namespace: Application namespace (optional)
        project: Project name (optional)
        
    Returns:
        Dict containing the navigation URL
    """
    try:
        # Get kubecontext-specific ArgoCD configuration
        config = get_argocd_config(kubecontext)
        if not config:
            error_msg = f"No ArgoCD configuration found for kubecontext {kubecontext}"
            track_call("get_argocd_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        if not config.get('enabled', False):
            error_msg = f"ArgoCD is not enabled for kubecontext {kubecontext}"
            track_call("get_argocd_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        effective_url = config.get('effective_url')
        if not effective_url:
            error_msg = f"No valid ArgoCD URL configured for kubecontext {kubecontext}"
            track_call("get_argocd_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        base_url = effective_url.rstrip('/')
        
        url_mappings = {
            "home": "/",
            "applications": "/applications",
            "application": "/applications/{namespace}/{name}",
            "settings": "/settings",
            "clusters": "/settings/clusters", 
            "repositories": "/settings/repos",
            "projects": "/settings/projects"
        }
        
        if resource_type not in url_mappings:
            error_msg = f"Invalid resource_type. Valid options: {list(url_mappings.keys())}"
            track_call("get_argocd_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        if resource_type == "application":
            if not resource_name:
                error_msg = "resource_name is required for application resource_type"
                track_call("get_argocd_navigation_url", kwargs=locals(), error=error_msg)
                return {"success": False, "error": error_msg}
            
            # Use provided namespace or default to 'argocd'
            app_namespace = namespace or "argocd"
            path = url_mappings[resource_type].format(namespace=app_namespace, name=resource_name)
        else:
            path = url_mappings[resource_type]
        
        navigation_url = f"{base_url}{path}"
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "resource_type": resource_type,
            "argocd_base_url": base_url
        }
        
        if resource_name:
            result["resource_name"] = resource_name
        if namespace:
            result["namespace"] = namespace
        if project:
            result["project"] = project
        
        track_call("get_argocd_navigation_url", kwargs=locals(), 
                  output=f"Generated URL for {resource_type}")
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate navigation URL: {str(e)}"
        track_call("get_argocd_navigation_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

@function_tool
def get_argocd_application_url(application_name: str, kubecontext: Optional[str] = None,
                              namespace: Optional[str] = None, 
                              view: Optional[str] = None) -> Dict[str, Any]:
    """
    Get direct navigation URL for a specific ArgoCD application in the web UI.
    
    Args:
        application_name: Name of the application
        kubecontext: Kubernetes context/cluster name (optional, uses current context if not provided)
        namespace: Application namespace (defaults to 'argocd' if not specified)
        view: Specific view ('summary', 'tree', 'network', 'logs', 'events', 'manifest')
        
    Returns:
        Dict containing the navigation URL for the application
    """
    try:
        # Get kubecontext - from parameter or current context
        if not kubecontext:
            kubecontext = get_current_kubecontext()
        
        if not kubecontext:
            error_msg = "No kubecontext provided. Use kubecontext parameter or set current context"
            track_call("get_argocd_application_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        # Get kubecontext-specific ArgoCD configuration
        config = get_argocd_config(kubecontext)
        if not config:
            error_msg = f"No ArgoCD configuration found for kubecontext {kubecontext}"
            track_call("get_argocd_application_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        if not config.get('enabled', False):
            error_msg = f"ArgoCD is not enabled for kubecontext {kubecontext}"
            track_call("get_argocd_application_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        effective_url = config.get('effective_url')
        if not effective_url:
            error_msg = f"No valid ArgoCD URL configured for kubecontext {kubecontext}"
            track_call("get_argocd_application_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg}
        
        base_url = effective_url.rstrip('/')
        app_namespace = namespace or "argocd"
        
        # Base application URL
        navigation_url = f"{base_url}/applications/{app_namespace}/{application_name}"
        
        # Add view parameter if specified
        view_mappings = {
            "summary": "",  # Default view
            "tree": "?view=tree",
            "network": "?view=network", 
            "logs": "?view=logs",
            "events": "?view=events",
            "manifest": "?view=manifest"
        }
        
        if view:
            if view not in view_mappings:
                error_msg = f"Invalid view. Valid options: {list(view_mappings.keys())}"
                track_call("get_argocd_application_url", kwargs=locals(), error=error_msg)
                return {"success": False, "error": error_msg}
            
            navigation_url += view_mappings[view]
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "application_name": application_name,
            "namespace": app_namespace,
            "argocd_base_url": base_url
        }
        
        if view:
            result["view"] = view
        
        track_call("get_argocd_application_url", kwargs=locals(), 
                  output=f"Generated URL for application {application_name}")
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate application URL: {str(e)}"
        track_call("get_argocd_application_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg}

# Configuration tools
argocd_config_tools = [
    get_argocd_config_tool,
    set_argocd_config,
    test_argocd_connection
]

# Read-only operations - allowed in recon mode
argocd_read_tools = [
    list_all_applications,
    get_application,
    get_application_resource_tree,
    get_application_managed_resources,
    get_application_workload_logs,
    get_resource_events,
    get_resource_actions,
    get_argocd_navigation_url,
    get_argocd_application_url
] + argocd_config_tools

# Action/modification operations - only allowed when recon mode is off
argocd_action_tools = [
    # create_application,
    # update_application,
    delete_application,
    sync_application,
    run_resource_action
]

# Combined tools based on recon mode
def get_argocd_tools():
    from config.config import get_recon_mode
    if get_recon_mode():
        return argocd_read_tools
    else:
        return argocd_read_tools + argocd_action_tools

# For backward compatibility
argocd_tools = get_argocd_tools()