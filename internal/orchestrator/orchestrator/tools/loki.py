#-------------------------------------------------------------------------------------#
# Loki Tools - Log querying via Kubernetes proxy through operator server.
# Following the same approach as prometheus.py for consistency.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, Any, Union
import datetime
import os
import logging

# Import config manager to get cluster-specific configurations
try:
    from config.config import get_cluster_config, update_cluster_config
except ImportError:
    # Fallback if config module is not available
    def get_cluster_config(cluster_name: str) -> Dict[str, Any]:
        return {}
    def update_cluster_config(cluster_name: str, config: Dict[str, Any]) -> bool:
        return False

from orchestrator.tools.kubectl import _current_kubecontext

logger = logging.getLogger(__name__)
tool_call_history = []

# Operator server configuration (same as prometheus.py)
OPERATOR_SERVER_URL = 'http://localhost:4688'

# Global configuration cache
_loki_config_cache = {}


def get_loki_config_for_cluster(cluster_name: str) -> Dict[str, Any]:
    """Get Loki configuration for a specific cluster from cluster config"""
    if cluster_name in _loki_config_cache:
        return _loki_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        loki_config = cluster_config.get('loki', {})
        
        if not loki_config:
            logger.warning(f"No Loki configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': loki_config.get('enabled', False),
            'namespace': loki_config.get('namespace', 'monitoring'),
            'service_address': loki_config.get('service_address', ''),
            'url': loki_config.get('url', ''),  # External URL if available
            'token': loki_config.get('token', ''),
            'basic_auth': loki_config.get('basic_auth', {}),
            'tenant_id': loki_config.get('tenant_id', ''),
        }
        
        # Priority: Use external URL if provided, otherwise build proxy URL
        if config['url']:
            # User provided external URL - use it directly
            config['effective_url'] = config['url']
            logger.info(f"Using external Loki URL for {cluster_name}: {config['url']}")
        elif config['service_address'] and config['namespace']:
            # Build proxy URL through operator server
            config['effective_url'] = f"{OPERATOR_SERVER_URL}/api/v1/clusters/{cluster_name}/api/v1/namespaces/{config['namespace']}/services/{config['service_address']}/proxy"
            logger.info(f"Using proxy Loki URL for {cluster_name}: {config['effective_url']}")
        else:
            logger.error(f"No valid Loki configuration for cluster {cluster_name}: missing both 'url' and 'service_address/namespace'")
            return {}
        
        # Cache the configuration
        _loki_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load Loki config for cluster {cluster_name}: {e}")
        return {}


def clear_loki_config_cache():
    """Clear the configuration cache to force reload"""
    global _loki_config_cache
    _loki_config_cache = {}


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


def get_loki_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for Loki API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add Bearer token if configured
    if config.get('token'):
        headers["Authorization"] = f"Bearer {config['token']}"
    
    # Add tenant ID header for multi-tenant Loki
    if config.get('tenant_id'):
        headers["X-Scope-OrgID"] = config['tenant_id']
    
    return headers


def get_loki_auth(config: Dict[str, Any]) -> Optional[tuple]:
    """Get authentication tuple for Loki API requests (basic auth)"""
    basic_auth = config.get('basic_auth', {})
    
    if isinstance(basic_auth, dict) and basic_auth.get('username') and basic_auth.get('password'):
        return (basic_auth['username'], basic_auth['password'])
    
    return None


def make_loki_request(endpoint: str, params: Optional[Dict] = None, method: str = "GET", 
                      data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to Loki API using kubecontext-specific configuration"""
    
    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()
    
    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}
    
    # Get kubecontext-specific Loki configuration
    config = get_loki_config_for_cluster(kubecontext)
    if not config:
        return {"success": False, "error": f"No Loki configuration found for kubecontext {kubecontext}"}
    
    if not config.get('enabled', False):
        return {"success": False, "error": f"Loki is not enabled for kubecontext {kubecontext}"}
    
    effective_url = config.get('effective_url')
    if not effective_url:
        return {"success": False, "error": f"No valid Loki URL configured for kubecontext {kubecontext}"}
    
    # Build the full URL
    url = f"{effective_url.rstrip('/')}{endpoint}"
    headers = get_loki_headers(config)
    auth = get_loki_auth(config)
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, auth=auth)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, params=params, json=data, auth=auth)
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


def format_time_param(timestamp: Union[str, int, float, None]) -> Optional[str]:
    """Format timestamp for Loki API (expects nanoseconds)"""
    if timestamp is None:
        return None
    
    if isinstance(timestamp, str):
        # Assume it's already formatted or RFC3339
        return timestamp
    elif isinstance(timestamp, (int, float)):
        # Convert seconds to nanoseconds if needed
        if timestamp < 1e12:  # Likely seconds
            return str(int(timestamp * 1e9))
        else:  # Already nanoseconds
            return str(int(timestamp))
    
    return str(timestamp)


#-------------------------------------------------------------------------------------#
# LOG QUERY TOOL
#-------------------------------------------------------------------------------------#

@function_tool
def query_loki_logs(query: str, kubecontext: str, limit: int = 100) -> Dict[str, Any]:
    """
    Query and retrieve logs using LogQL via Kubernetes proxy.
    
    Args:
        query: LogQL query string (e.g., '{namespace="kube-system", container="kube-apiserver"} |= "error"')
        kubecontext: Kubernetes context to query (cluster name)
        limit: Maximum number of log entries to return (default: 100)
        
    Returns:
        Dict containing log query results with streams and log entries
    """
    try:
        params = {"query": query}
        
        # Default settings
        params["limit"] = limit
        params["direction"] = "backward"
        
        # Default time range: Last 6 hours
        now_ns = int(datetime.datetime.now().timestamp() * 1e9)
        six_hours_ns = 6 * 60 * 60 * 1000000000
        
        params["start"] = str(now_ns - six_hours_ns)
        params["end"] = str(now_ns)
        
        result = make_loki_request("/loki/api/v1/query_range", params=params, kubecontext=kubecontext)
        
        result = make_loki_request("/loki/api/v1/query_range", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            loki_data = result["data"]
            
            # Check if Loki returned an error
            if loki_data.get("status") != "success":
                error_msg = loki_data.get("error", "Unknown Loki error")
                track_call("query_loki_logs", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "loki_status": loki_data.get("status")
                }
            
            query_result = loki_data.get("data", {})
            result_type = query_result.get("resultType")
            result_data = query_result.get("result", [])
            
            # Count total log entries
            total_entries = 0
            for stream in result_data:
                if "values" in stream:
                    total_entries += len(stream["values"])
            
            track_call("query_loki_logs", kwargs=locals(), 
                      output=f"Query executed successfully, {len(result_data)} streams, {total_entries} log entries")
            
            response = {
                "success": True,
                "query": query,
                "kubecontext": kubecontext,
                "result_type": result_type,
                "result": result_data,
                "stream_count": len(result_data),
                "total_entries": total_entries,
                "time_range": {"start": params.get("start"), "end": params.get("end")},
                "loki_status": loki_data.get("status"),
                "stats": loki_data.get("stats", {})
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("query_loki_logs", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2)
            return result
            
    except Exception as e:
        error_msg = f"Failed to query Loki logs: {str(e)}"
        track_call("query_loki_logs", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response


#-------------------------------------------------------------------------------------#
# CONFIGURATION TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def set_loki_config(kubecontext: str, namespace: str = "monitoring", 
                   service_address: Optional[str] = None, url: Optional[str] = None,
                   token: Optional[str] = None, username: Optional[str] = None, 
                   password: Optional[str] = None, tenant_id: Optional[str] = None,
                   enabled: bool = True) -> Dict[str, Any]:
    """
    Set Loki configuration for a specific kubecontext and save to additionalConfig.yaml.
    
    Args:
        kubecontext: Kubernetes context to configure Loki for
        namespace: Kubernetes namespace where Loki is running (default: monitoring)
        service_address: Internal service address (e.g., 'loki:3100' or 'loki-gateway:80')
        url: External Loki URL (takes priority over service_address)
        token: Bearer token for authentication
        username: Username for basic authentication
        password: Password for basic authentication
        tenant_id: Tenant ID for multi-tenant Loki
        enabled: Whether Loki is enabled for this kubecontext
        
    Returns:
        Dict containing configuration result
    """
    try:
        # Build the loki configuration
        loki_config = {
            "enabled": enabled,
            "namespace": namespace
        }
        
        # Add URL or service_address
        if url:
            loki_config["url"] = url
        elif service_address:
            loki_config["service_address"] = service_address
        else:
            return {
                "success": False, 
                "error": "Either 'url' or 'service_address' must be provided"
            }
        
        # Add authentication if provided
        if token:
            loki_config["token"] = token
        elif username and password:
            loki_config["basic_auth"] = {
                "username": username,
                "password": password
            }
        
        # Add tenant ID if provided
        if tenant_id:
            loki_config["tenant_id"] = tenant_id
        
        # Update cluster configuration
        cluster_config = {"loki": loki_config}
        success = update_cluster_config(kubecontext, cluster_config)
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to save Loki configuration for kubecontext {kubecontext}"
            }
        
        # Clear cache to force reload
        clear_loki_config_cache()
        
        # Test the connection
        test_result = make_loki_request("/loki/api/v1/labels", kubecontext=kubecontext)
        
        result = {
            "success": True,
            "message": f"Loki configuration saved for kubecontext {kubecontext}",
            "kubecontext": kubecontext,
            "configuration": {
                "enabled": enabled,
                "namespace": namespace,
                "url": url,
                "service_address": service_address,
                "has_token": bool(token),
                "has_basic_auth": bool(username and password),
                "has_tenant_id": bool(tenant_id)
            },
            "connection_test": test_result.get("success", False),
            "connection_error": test_result.get("error") if not test_result.get("success") else None
        }
        
        track_call("set_loki_config", kwargs={
            "kubecontext": kubecontext, 
            "namespace": namespace,
            "has_url": bool(url),
            "has_service_address": bool(service_address)
        }, output=f"Configuration saved for kubecontext {kubecontext}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to set Loki configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("set_loki_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response


@function_tool
def get_loki_config(kubecontext: str) -> Dict[str, Any]:
    """
    Get Loki configuration for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
    
    Returns:
        Dict containing the kubecontext's Loki configuration
    """
    try:
        config = get_loki_config_for_cluster(kubecontext)
        
        if not config:
            response = {
                "success": False, 
                "error": f"No Loki configuration found for kubecontext {kubecontext}",
                "kubecontext": kubecontext
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        
        # Return sanitized config (without sensitive data)
        safe_config = {
            "success": True,
            "kubecontext": config['cluster_name'],
            "enabled": config['enabled'],
            "namespace": config['namespace'],
            "service_address": config['service_address'],
            "url": config['url'],
            "effective_url": config['effective_url'],
            "has_token": bool(config.get('token')),
            "has_basic_auth": bool(config.get('basic_auth')),
            "has_tenant_id": bool(config.get('tenant_id'))
        }
        
        track_call("get_loki_config", kwargs={"kubecontext": kubecontext}, 
                  output=f"Retrieved config for kubecontext {kubecontext}")
        safe_config["output"] = json.dumps(safe_config, indent=2)
        return safe_config
        
    except Exception as e:
        error_msg = f"Failed to get Loki configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("get_loki_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        response = {"success": False, "error": error_msg, "kubecontext": kubecontext}
        response["output"] = json.dumps(response, indent=2)
        return response


# Collection of all Loki tools - simplified to essential tools only
loki_tools = [
    # Log query tool
    query_loki_logs,
    
    # Configuration tools
    set_loki_config,
    get_loki_config,
]