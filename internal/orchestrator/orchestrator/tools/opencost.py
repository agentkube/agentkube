#-------------------------------------------------------------------------------------#
# OpenCost Tools - Complete set of OpenCost operations for cost data retrieval and analysis.
# Includes cost queries, allocation data, and resource cost monitoring with command tracking.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, Any
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
_opencost_config_cache = {}

def get_opencost_config(cluster_name: str) -> Dict[str, Any]:
    """Get OpenCost configuration for a specific cluster from cluster config"""
    if cluster_name in _opencost_config_cache:
        return _opencost_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        opencost_config = cluster_config.get('opencost', {})
        
        if not opencost_config:
            logger.warning(f"No OpenCost configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': opencost_config.get('enabled', False),
            'namespace': opencost_config.get('namespace', 'opencost'),
            'service_address': opencost_config.get('service_address', ''),
            'url': opencost_config.get('url', ''),  # External URL if available
            'token': opencost_config.get('token', ''),
        }
        
        # Priority: Use external URL if provided, otherwise build proxy URL
        if config['url']:
            # User provided external URL - use it directly
            config['effective_url'] = config['url']
            logger.info(f"Using external OpenCost URL for {cluster_name}: {config['url']}")
        elif config['service_address'] and config['namespace']:
            # Build proxy URL through operator server
            config['effective_url'] = f"{OPERATOR_SERVER_URL}/api/v1/clusters/{cluster_name}/api/v1/namespaces/{config['namespace']}/services/{config['service_address']}/proxy"
            logger.info(f"Using proxy OpenCost URL for {cluster_name}: {config['effective_url']}")
        else:
            logger.error(f"No valid OpenCost configuration for cluster {cluster_name}: missing both 'url' and 'service_address/namespace'")
            return {}
        
        # Cache the configuration
        _opencost_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load OpenCost config for cluster {cluster_name}: {e}")
        return {}

def clear_opencost_config_cache():
    """Clear the configuration cache to force reload"""
    global _opencost_config_cache
    _opencost_config_cache = {}

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

def get_opencost_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for OpenCost API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add Bearer token if configured
    if config.get('token'):
        headers["Authorization"] = f"Bearer {config['token']}"
    
    return headers

def make_opencost_request(endpoint: str, params: Optional[Dict] = None, method: str = "GET", 
                         data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to OpenCost API using kubecontext-specific configuration"""
    
    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()
    
    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}
    
    # Get kubecontext-specific OpenCost configuration
    config = get_opencost_config(kubecontext)
    if not config:
        return {"success": False, "error": f"No OpenCost configuration found for kubecontext {kubecontext}"}
    
    if not config.get('enabled', False):
        return {"success": False, "error": f"OpenCost is not enabled for kubecontext {kubecontext}"}
    
    effective_url = config.get('effective_url')
    if not effective_url:
        return {"success": False, "error": f"No valid OpenCost URL configured for kubecontext {kubecontext}"}
    
    url = urljoin(effective_url.rstrip('/') + '/', endpoint.lstrip('/'))
    headers = get_opencost_headers(config)
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, verify=False)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, params=params, json=data, verify=False)
        else:
            return {"success": False, "error": f"Unsupported HTTP method: {method}"}
        
        response.raise_for_status()
        
        if response.content:
            result_data = response.json()
            return {"success": True, "data": result_data, "status_code": response.status_code}
        else:
            return {"success": True, "data": None, "status_code": response.status_code}
            
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": str(e), "status_code": getattr(e.response, 'status_code', None)}
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"JSON decode error: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {str(e)}"}

#-------------------------------------------------------------------------------------#
# COST ALLOCATION TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_allocation_data(window: str, kubecontext: str, step: Optional[str] = None, resolution: Optional[str] = None, 
                       aggregate: Optional[str] = None, accumulate: Optional[bool] = None,
                       filter_namespaces: Optional[str] = None, filter_clusters: Optional[str] = None) -> Dict[str, Any]:
    """
    Get cost allocation data from OpenCost.
    
    Args:
        window: Time window for the query (e.g., '1d', '7d', '1h', '30m')
        kubecontext: Kubernetes context to query
        step: Step size for time series data (e.g., '1h', '1d')
        resolution: Resolution of the data (e.g., '1m', '5m', '1h')
        aggregate: Aggregation dimension (namespace, cluster, node, controller, service, etc.)
        accumulate: Whether to accumulate costs over time. Defaults to False
        filter_namespaces: Comma-separated list of namespaces to filter
        filter_clusters: Comma-separated list of clusters to filter
        
    Returns:
        Dict containing the allocation data and metadata
    """
    try:
        params = {"window": window}
        
        if step:
            params["step"] = step
        if resolution:
            params["resolution"] = resolution
        if aggregate:
            params["aggregate"] = aggregate
        if accumulate is not None:
            params["accumulate"] = str(accumulate).lower()
        if filter_namespaces:
            params["filterNamespaces"] = filter_namespaces
        if filter_clusters:
            params["filterClusters"] = filter_clusters
        
        result = make_opencost_request("/model/allocation", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            allocation_data = result["data"]
            
            track_call("get_allocation_data", kwargs=locals(), 
                      output=f"Allocation data retrieved successfully for window: {window}")
            response = {
                "success": True,
                "window": window,
                "data": allocation_data,
                "step": step,
                "resolution": resolution,
                "aggregate": aggregate,
                "accumulate": accumulate
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_allocation_data", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get allocation data: {str(e)}"
        track_call("get_allocation_data", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_assets_data(window: str, kubecontext: str, step: Optional[str] = None, resolution: Optional[str] = None,
                   aggregate: Optional[str] = None, accumulate: Optional[bool] = None,
                   filter_clusters: Optional[str] = None, filter_nodes: Optional[str] = None) -> Dict[str, Any]:
    """
    Get asset cost data from OpenCost.
    
    Args:
        window: Time window for the query (e.g., '1d', '7d', '1h', '30m')
        kubecontext: Kubernetes context to query
        step: Step size for time series data (e.g., '1h', '1d')
        resolution: Resolution of the data (e.g., '1m', '5m', '1h')
        aggregate: Aggregation dimension (cluster, node, disk, etc.)
        accumulate: Whether to accumulate costs over time. Defaults to False
        filter_clusters: Comma-separated list of clusters to filter
        filter_nodes: Comma-separated list of nodes to filter
        
    Returns:
        Dict containing the assets data and metadata
    """
    try:
        params = {"window": window}
        
        if step:
            params["step"] = step
        if resolution:
            params["resolution"] = resolution
        if aggregate:
            params["aggregate"] = aggregate
        if accumulate is not None:
            params["accumulate"] = str(accumulate).lower()
        if filter_clusters:
            params["filterClusters"] = filter_clusters
        if filter_nodes:
            params["filterNodes"] = filter_nodes
        
        result = make_opencost_request("/model/assets", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            assets_data = result["data"]
            
            track_call("get_assets_data", kwargs=locals(), 
                      output=f"Assets data retrieved successfully for window: {window}")
            response = {
                "success": True,
                "window": window,
                "data": assets_data,
                "step": step,
                "resolution": resolution,
                "aggregate": aggregate,
                "accumulate": accumulate
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_assets_data", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get assets data: {str(e)}"
        track_call("get_assets_data", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# COST ANALYSIS TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_cost_summary(window: str, kubecontext: str, aggregate: Optional[str] = None) -> Dict[str, Any]:
    """
    Get a summary of costs for the specified time window.
    
    Args:
        window: Time window for the summary (e.g., '1d', '7d', '30d')
        kubecontext: Kubernetes context to query
        aggregate: How to aggregate the data (namespace, cluster, node, etc.)
        
    Returns:
        Dict containing the cost summary
    """
    try:
        params = {"window": window, "accumulate": "true"}
        
        if aggregate:
            params["aggregate"] = aggregate
        
        result = make_opencost_request("/model/allocation", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            data = result["data"]
            
            # Process data to create summary
            summary = {
                "total_cost": 0,
                "breakdown": {},
                "window": window,
                "aggregate": aggregate or "default"
            }
            
            # Extract total costs and breakdown from allocation data
            if data and isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, dict) and 'totalCost' in value:
                        summary["total_cost"] += value.get('totalCost', 0)
                        summary["breakdown"][key] = {
                            "totalCost": value.get('totalCost', 0),
                            "cpuCost": value.get('cpuCost', 0),
                            "ramCost": value.get('ramCost', 0),
                            "pvCost": value.get('pvCost', 0),
                            "networkCost": value.get('networkCost', 0)
                        }
            
            track_call("get_cost_summary", kwargs=locals(), 
                      output=f"Cost summary retrieved for window: {window}, total cost: ${summary['total_cost']:.2f}")
            response = {
                "success": True,
                "summary": summary,
                "raw_data": data
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_cost_summary", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get cost summary: {str(e)}"
        track_call("get_cost_summary", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_namespace_costs(window: str, kubecontext: str, namespaces: Optional[str] = None) -> Dict[str, Any]:
    """
    Get cost breakdown by namespace.
    
    Args:
        window: Time window for the query (e.g., '1d', '7d', '30d')
        kubecontext: Kubernetes context to query
        namespaces: Comma-separated list of specific namespaces to query
        
    Returns:
        Dict containing namespace cost breakdown
    """
    try:
        params = {
            "window": window,
            "aggregate": "namespace",
            "accumulate": "true"
        }
        
        if namespaces:
            params["filterNamespaces"] = namespaces
        
        result = make_opencost_request("/model/allocation", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            data = result["data"]
            
            namespace_costs = {}
            total_cost = 0
            
            if data and isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, dict) and 'totalCost' in value:
                        cost = value.get('totalCost', 0)
                        total_cost += cost
                        namespace_costs[key] = {
                            "totalCost": cost,
                            "cpuCost": value.get('cpuCost', 0),
                            "ramCost": value.get('ramCost', 0),
                            "pvCost": value.get('pvCost', 0),
                            "networkCost": value.get('networkCost', 0),
                            "percentage": 0  # Will calculate after total is known
                        }
            
            # Calculate percentages
            for ns_data in namespace_costs.values():
                if total_cost > 0:
                    ns_data["percentage"] = (ns_data["totalCost"] / total_cost) * 100
            
            track_call("get_namespace_costs", kwargs=locals(), 
                      output=f"Namespace costs retrieved for window: {window}, {len(namespace_costs)} namespaces")
            response = {
                "success": True,
                "window": window,
                "total_cost": total_cost,
                "namespace_costs": namespace_costs,
                "namespace_count": len(namespace_costs)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_namespace_costs", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get namespace costs: {str(e)}"
        track_call("get_namespace_costs", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# CONFIGURATION AND UTILITY FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_opencost_config_tool(kubecontext: str) -> Dict[str, Any]:
    """
    Get OpenCost configuration for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
    
    Returns:
        Dict containing the kubecontext's OpenCost configuration
    """
    
    try:
        config = get_opencost_config(kubecontext)
        
        if not config:
            return {
                "success": False, 
                "error": f"No OpenCost configuration found for kubecontext {kubecontext}",
                "kubecontext": kubecontext,
                "output": json.dumps({"success": False, "error": f"No OpenCost configuration found for kubecontext {kubecontext}"}, indent=2)
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
        
        track_call("get_opencost_config_tool", kwargs={"kubecontext": kubecontext}, 
                  output=f"Retrieved config for kubecontext {kubecontext}")
        safe_config["output"] = json.dumps(safe_config, indent=2)
        return safe_config
        
    except Exception as e:
        error_msg = f"Failed to get OpenCost configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("get_opencost_config_tool", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "kubecontext": kubecontext, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def set_opencost_config(kubecontext: str, namespace: str = "opencost", 
                       service_address: Optional[str] = None, url: Optional[str] = None,
                       token: Optional[str] = None, enabled: bool = True) -> Dict[str, Any]:
    """
    Set OpenCost configuration for a specific kubecontext and save to additionalConfig.yaml.
    
    Args:
        kubecontext: Kubernetes context to configure OpenCost for
        namespace: Kubernetes namespace where OpenCost is running (default: opencost)
        service_address: Internal service address (e.g., 'opencost:9003')
        url: External OpenCost URL (takes priority over service_address)
        token: Bearer token for authentication
        enabled: Whether OpenCost is enabled for this kubecontext
        
    Returns:
        Dict containing configuration result
    """
    try:
        # Import here to avoid circular imports
        from config.config import update_cluster_config
        
        # Build the opencost configuration
        opencost_config = {
            "enabled": enabled,
            "namespace": namespace
        }
        
        # Add URL or service_address
        if url:
            opencost_config["url"] = url
        elif service_address:
            opencost_config["service_address"] = service_address
        else:
            return {
                "success": False, 
                "error": "Either 'url' or 'service_address' must be provided",
                "output": json.dumps({"success": False, "error": "Either 'url' or 'service_address' must be provided"}, indent=2)
            }
        
        # Add authentication if provided
        if token:
            opencost_config["token"] = token
        
        # Update cluster configuration
        cluster_config = {"opencost": opencost_config}
        success = update_cluster_config(kubecontext, cluster_config)
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to save OpenCost configuration for kubecontext {kubecontext}",
                "output": json.dumps({"success": False, "error": f"Failed to save OpenCost configuration for kubecontext {kubecontext}"}, indent=2)
            }
        
        # Clear cache to force reload
        clear_opencost_config_cache()
        
        # Test the connection
        test_result = test_opencost_connection(kubecontext)
        
        result = {
            "success": True,
            "message": f"OpenCost configuration saved for kubecontext {kubecontext}",
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
        
        track_call("set_opencost_config", kwargs={
            "kubecontext": kubecontext, 
            "namespace": namespace,
            "has_url": bool(url),
            "has_service_address": bool(service_address)
        }, output=f"Configuration saved for kubecontext {kubecontext}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to set OpenCost configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("set_opencost_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def test_opencost_connection(kubecontext: str) -> Dict[str, Any]:
    """
    Test OpenCost connection for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to test connection for
    
    Returns:
        Dict containing connection test results
    """
    
    try:
        # Test with a simple allocation query
        result = make_opencost_request("/model/allocation", params={"window": "1h"}, kubecontext=kubecontext)
        
        if result["success"]:
            allocation_data = result["data"]
            
            track_call("test_opencost_connection", kwargs={"kubecontext": kubecontext}, 
                      output=f"Connection successful for kubecontext {kubecontext}")
            
            response = {
                "success": True,
                "kubecontext": kubecontext,
                "message": "OpenCost connection successful",
                "data_available": bool(allocation_data)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("test_opencost_connection", kwargs={"kubecontext": kubecontext}, 
                      error=result.get("error"))
            response = {
                "success": False,
                "kubecontext": kubecontext,
                "error": f"OpenCost connection failed: {result.get('error')}",
                "connection_test": False
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to test OpenCost connection for kubecontext {kubecontext}: {str(e)}"
        track_call("test_opencost_connection", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "kubecontext": kubecontext, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

# Configuration tools
opencost_config_tools = [
    get_opencost_config_tool,
    set_opencost_config,
    test_opencost_connection
]

# Read-only operations - allowed in recon mode
opencost_read_tools = [
    get_allocation_data,
    get_assets_data,
    get_cost_summary,
    get_namespace_costs,
] + opencost_config_tools

# Combined tools based on recon mode
def get_opencost_tools():
    from config.config import get_recon_mode
    if get_recon_mode():
        return opencost_read_tools
    else:
        return opencost_read_tools  # OpenCost is typically read-only

# For backward compatibility
opencost_tools = get_opencost_tools()