#-------------------------------------------------------------------------------------#
# Prometheus Tools - Complete set of Prometheus operations for metrics querying and discovery.
# Includes PromQL query execution, metric discovery, and target monitoring with command tracking.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, List, Any
import datetime
from urllib.parse import urljoin, urlencode
import os
import logging

# Import config manager to get cluster-specific configurations
try:
    from config.config import get_cluster_config
except ImportError:
    # Fallback if config module is not available
    def get_cluster_config(cluster_name: str) -> Dict[str, Any]:
        return {}

from orchestrator.tools.kubectl import _current_kubecontext

logger = logging.getLogger(__name__)
tool_call_history = []

# Operator server configuration
OPERATOR_SERVER_URL = 'http://localhost:4688'

# Global configuration cache
_prometheus_config_cache = {}

def get_prometheus_config(cluster_name: str) -> Dict[str, Any]:
    """Get Prometheus configuration for a specific cluster from cluster config"""
    if cluster_name in _prometheus_config_cache:
        return _prometheus_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        prometheus_config = cluster_config.get('prometheus', {})
        
        if not prometheus_config:
            logger.warning(f"No Prometheus configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': prometheus_config.get('enabled', False),
            'namespace': prometheus_config.get('namespace', 'monitoring'),
            'service_address': prometheus_config.get('service_address', ''),
            'url': prometheus_config.get('url', ''),  # External URL if available
            'token': prometheus_config.get('token', ''),
            'basic_auth': prometheus_config.get('basic_auth', {}),
        }
        
        # Priority: Use external URL if provided, otherwise build proxy URL
        if config['url']:
            # User provided external URL - use it directly
            config['effective_url'] = config['url']
            logger.info(f"Using external Prometheus URL for {cluster_name}: {config['url']}")
        elif config['service_address'] and config['namespace']:
            # Build proxy URL through operator server
            config['effective_url'] = f"{OPERATOR_SERVER_URL}/api/v1/clusters/{cluster_name}/api/v1/namespaces/{config['namespace']}/services/{config['service_address']}/proxy"
            logger.info(f"Using proxy Prometheus URL for {cluster_name}: {config['effective_url']}")
        else:
            logger.error(f"No valid Prometheus configuration for cluster {cluster_name}: missing both 'url' and 'service_address/namespace'")
            return {}
        
        # Cache the configuration
        _prometheus_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load Prometheus config for cluster {cluster_name}: {e}")
        return {}

def clear_prometheus_config_cache():
    """Clear the configuration cache to force reload"""
    global _prometheus_config_cache
    _prometheus_config_cache = {}

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

def get_prometheus_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for Prometheus API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add Bearer token if configured
    if config.get('token'):
        headers["Authorization"] = f"Bearer {config['token']}"
    
    return headers

def get_prometheus_auth(config: Dict[str, Any]) -> Optional[tuple]:
    """Get authentication tuple for Prometheus API requests (basic auth)"""
    basic_auth = config.get('basic_auth', {})
    
    if isinstance(basic_auth, dict) and basic_auth.get('username') and basic_auth.get('password'):
        return (basic_auth['username'], basic_auth['password'])
    
    return None

def make_prometheus_request(endpoint: str, params: Optional[Dict] = None, method: str = "GET", 
                          data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to Prometheus API using kubecontext-specific configuration"""
    
    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()
    
    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}
    
    # Get kubecontext-specific Prometheus configuration
    config = get_prometheus_config(kubecontext)
    if not config:
        return {"success": False, "error": f"No Prometheus configuration found for kubecontext {kubecontext}"}
    
    if not config.get('enabled', False):
        return {"success": False, "error": f"Prometheus is not enabled for kubecontext {kubecontext}"}
    
    effective_url = config.get('effective_url')
    if not effective_url:
        return {"success": False, "error": f"No valid Prometheus URL configured for kubecontext {kubecontext}"}
    
    url = urljoin(effective_url.rstrip('/') + '/', endpoint.lstrip('/'))
    headers = get_prometheus_headers(config)
    auth = get_prometheus_auth(config)
    
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

def format_prometheus_time(timestamp) -> str:
    """Format timestamp for Prometheus API"""
    if timestamp is None:
        return None
    
    if isinstance(timestamp, (int, float)):
        return str(timestamp)
    elif isinstance(timestamp, str):
        return timestamp
    elif hasattr(timestamp, 'timestamp'):
        return str(timestamp.timestamp())
    else:
        return str(timestamp)

def convert_glob_to_regex(pattern: str) -> str:
    """
    Convert common glob patterns to proper regex patterns for Prometheus.
    
    Examples:
    - node_* -> node_.*
    - cpu* -> cpu.*
    - *memory* -> .*memory.*
    """
    if not pattern:
        return pattern
    
    # If it already looks like a regex (contains . or other regex chars), don't modify
    if any(char in pattern for char in ['.', '+', '?', '\\', '^', '$', '(', ')', '[', ']', '{', '}']):
        return pattern
    
    # Convert shell-style glob patterns to regex
    # Replace * with .* for glob-style patterns
    regex_pattern = pattern.replace('*', '.*')
    
    return regex_pattern

#-------------------------------------------------------------------------------------#
# QUERY TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def execute_query(query: str, kubecontext: str, time: Optional[str] = None, timeout: Optional[str] = None) -> Dict[str, Any]:
    """
    Execute a PromQL instant query against Prometheus.
    
    Args:
        query: PromQL query string
        kubecontext: Kubernetes context to query
        time: Evaluation timestamp (RFC3339 or Unix timestamp). Uses current time if not specified
        timeout: Evaluation timeout (e.g., '30s', '1m'). Uses server default if not specified
        
    Returns:
        Dict containing the query result and metadata
    """
    
    try:
        params = {"query": query}
        
        if time:
            params["time"] = format_prometheus_time(time)
        if timeout:
            params["timeout"] = timeout
        
        result = make_prometheus_request("/api/v1/query", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            prometheus_data = result["data"]
            
            # Check if Prometheus returned an error
            if prometheus_data.get("status") != "success":
                error_msg = prometheus_data.get("error", "Unknown Prometheus error")
                track_call("execute_query", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "prometheus_status": prometheus_data.get("status"),
                    "error_type": prometheus_data.get("errorType")
                }
            
            query_result = prometheus_data.get("data", {})
            result_type = query_result.get("resultType")
            result_data = query_result.get("result", [])
            
            track_call("execute_query", kwargs=locals(), 
                      output=f"Query executed successfully, result type: {result_type}, {len(result_data)} results")
            response = {
                "success": True,
                "query": query,
                "result_type": result_type,
                "result": result_data,
                "result_count": len(result_data),
                "execution_time": time,
                "prometheus_status": prometheus_data.get("status")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("execute_query", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e: 
        error_msg = f"Failed to execute query: {str(e)}"
        track_call("execute_query", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def execute_range_query(query: str, kubecontext: str, start: str, end: str, step: str, 
                       timeout: Optional[str] = None) -> Dict[str, Any]:
    """
    Execute a PromQL range query with start time, end time, and step interval.
    
    Args:
        query: PromQL query string
        kubecontext: Kubernetes context to query
        start: Start timestamp (RFC3339 or Unix timestamp)
        end: End timestamp (RFC3339 or Unix timestamp)
        step: Query resolution step width (e.g., '15s', '1m', '1h')
        timeout: Evaluation timeout (e.g., '30s', '1m'). Uses server default if not specified
        
    Returns:
        Dict containing the range query result and metadata
    """
    
    try:
        params = {
            "query": query,
            "start": format_prometheus_time(start),
            "end": format_prometheus_time(end),
            "step": step
        }
        
        if timeout:
            params["timeout"] = timeout
        
        result = make_prometheus_request("/api/v1/query_range", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            prometheus_data = result["data"]
            
            # Check if Prometheus returned an error
            if prometheus_data.get("status") != "success":
                error_msg = prometheus_data.get("error", "Unknown Prometheus error")
                track_call("execute_range_query", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "prometheus_status": prometheus_data.get("status"),
                    "error_type": prometheus_data.get("errorType")
                }
            
            query_result = prometheus_data.get("data", {})
            result_type = query_result.get("resultType")
            result_data = query_result.get("result", [])
            
            # Calculate total data points
            total_points = sum(len(series.get("values", [])) for series in result_data)
            
            track_call("execute_range_query", kwargs=locals(), 
                      output=f"Range query executed successfully, result type: {result_type}, {len(result_data)} series, {total_points} total points")
            response = {
                "success": True,
                "query": query,
                "result_type": result_type,
                "result": result_data,
                "series_count": len(result_data),
                "total_data_points": total_points,
                "start_time": start,
                "end_time": end,
                "step": step,
                "prometheus_status": prometheus_data.get("status")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("execute_range_query", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2)
            return result
            
    except Exception as e:
        error_msg = f"Failed to execute range query: {str(e)}"
        track_call("execute_range_query", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

#-------------------------------------------------------------------------------------#
# DISCOVERY TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_metrics(kubecontext: str, match: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    List all available metrics in Prometheus.
    
    Args:
        kubecontext: Kubernetes context to query
        match: Optional pattern to filter metric names. Supports both regex and glob patterns.
               Examples: 'node_.*', 'node_*', 'cpu*', '*memory*'
        limit: Maximum number of metrics to return
        
    Returns:
        Dict containing the list of available metrics
    """
    
    try:
        params = {}
        regex_pattern = None
        
        if match:
            # Convert glob patterns to proper regex if needed
            regex_pattern = convert_glob_to_regex(match)
            # The match[] parameter expects a full metric selector like {__name__=~"pattern"}
            metric_selector = f'{{__name__=~"{regex_pattern}"}}'
            params["match[]"] = metric_selector
            logger.debug(f"Converted pattern '{match}' to metric selector '{metric_selector}'")
        
        result = make_prometheus_request("/api/v1/label/__name__/values", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            prometheus_data = result["data"]
            
            # Check if Prometheus returned an error
            if prometheus_data.get("status") != "success":
                error_msg = prometheus_data.get("error", "Unknown Prometheus error")
                track_call("list_metrics", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "prometheus_status": prometheus_data.get("status"),
                    "error_type": prometheus_data.get("errorType")
                }
            
            metrics = prometheus_data.get("data", [])
            
            # Apply limit if specified
            if limit and len(metrics) > limit:
                metrics = metrics[:limit]
                truncated = True
            else:
                truncated = False
            
            track_call("list_metrics", kwargs=locals(), 
                      output=f"Retrieved {len(metrics)} metrics")
            response = {
                "success": True,
                "metrics": metrics,
                "total_metrics": len(metrics),
                "truncated": truncated,
                "match_pattern": match,
                "regex_pattern": regex_pattern if match else None,
                "metric_selector": params.get("match[]") if match else None,
                "prometheus_status": prometheus_data.get("status")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_metrics", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2)
            return result
            
    except Exception as e:
        error_msg = f"Failed to list metrics: {str(e)}"
        track_call("list_metrics", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def get_metric_metadata(kubecontext: str, metric: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Get metadata for a specific metric or all metrics.
    
    Args:
        kubecontext: Kubernetes context to query
        metric: Specific metric name to get metadata for. If not specified, gets metadata for all metrics
        limit: Maximum number of metric metadata entries to return
        
    Returns:
        Dict containing metric metadata information
    """
    
    try:
        params = {}
        
        if metric:
            params["metric"] = metric
        if limit:
            params["limit"] = limit
        
        result = make_prometheus_request("/api/v1/metadata", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            prometheus_data = result["data"]
            
            # Check if Prometheus returned an error
            if prometheus_data.get("status") != "success":
                error_msg = prometheus_data.get("error", "Unknown Prometheus error")
                track_call("get_metric_metadata", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "prometheus_status": prometheus_data.get("status"),
                    "error_type": prometheus_data.get("errorType")
                }
            
            metadata = prometheus_data.get("data", {})
            
            # Process metadata to make it more readable
            processed_metadata = {}
            for metric_name, metric_info_list in metadata.items():
                if metric_info_list:
                    # Take the first metadata entry (usually there's only one)
                    metric_info = metric_info_list[0]
                    processed_metadata[metric_name] = {
                        "type": metric_info.get("type"),
                        "help": metric_info.get("help"),
                        "unit": metric_info.get("unit", "")
                    }
            
            track_call("get_metric_metadata", kwargs=locals(), 
                      output=f"Retrieved metadata for {len(processed_metadata)} metrics")
            response = {
                "success": True,
                "metadata": processed_metadata,
                "metric_count": len(processed_metadata),
                "specific_metric": metric,
                "prometheus_status": prometheus_data.get("status")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_metric_metadata", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2)
            return result
            
    except Exception as e:
        error_msg = f"Failed to get metric metadata: {str(e)}"
        track_call("get_metric_metadata", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def get_targets(kubecontext: str, state: Optional[str] = None) -> Dict[str, Any]:
    """
    Get information about all scrape targets.
    
    Args:
        kubecontext: Kubernetes context to query
        state: Filter targets by state ('active', 'dropped', 'any'). If not specified, returns active targets
        
    Returns:
        Dict containing information about scrape targets
    """
    
    try:
        params = {}
        
        if state:
            params["state"] = state
        
        result = make_prometheus_request("/api/v1/targets", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            prometheus_data = result["data"]
            
            # Check if Prometheus returned an error
            if prometheus_data.get("status") != "success":
                error_msg = prometheus_data.get("error", "Unknown Prometheus error")
                track_call("get_targets", kwargs=locals(), error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "prometheus_status": prometheus_data.get("status"),
                    "error_type": prometheus_data.get("errorType")
                }
            
            targets_data = prometheus_data.get("data", {})
            active_targets = targets_data.get("activeTargets", [])
            dropped_targets = targets_data.get("droppedTargets", [])
            
            # Process targets to extract useful information
            def process_target(target):
                return {
                    "discoveredLabels": target.get("discoveredLabels", {}),
                    "labels": target.get("labels", {}),
                    "scrapePool": target.get("scrapePool"),
                    "scrapeUrl": target.get("scrapeUrl"),
                    "globalUrl": target.get("globalUrl"),
                    "lastError": target.get("lastError", ""),
                    "lastScrape": target.get("lastScrape"),
                    "lastScrapeDuration": target.get("lastScrapeDuration"),
                    "health": target.get("health")
                }
            
            processed_active = [process_target(target) for target in active_targets]
            processed_dropped = [process_target(target) for target in dropped_targets]
            
            # Calculate health statistics for active targets
            health_stats = {}
            for target in active_targets:
                health = target.get("health", "unknown")
                health_stats[health] = health_stats.get(health, 0) + 1
            
            track_call("get_targets", kwargs=locals(), 
                      output=f"Retrieved {len(active_targets)} active targets, {len(dropped_targets)} dropped targets")
            response = {
                "success": True,
                "active_targets": processed_active,
                "dropped_targets": processed_dropped,
                "active_count": len(active_targets),
                "dropped_count": len(dropped_targets),
                "total_count": len(active_targets) + len(dropped_targets),
                "health_statistics": health_stats,
                "state_filter": state,
                "prometheus_status": prometheus_data.get("status")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_targets", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get targets: {str(e)}"
        track_call("get_targets", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# CONFIGURATION AND UTILITY FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_prometheus_config_tool(kubecontext: str) -> Dict[str, Any]:
    """
    Get Prometheus configuration for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
    
    Returns:
        Dict containing the kubecontext's Prometheus configuration
    """
    
    try:
        config = get_prometheus_config(kubecontext)
        
        if not config:
            response = {
                "success": False, 
                "error": f"No Prometheus configuration found for kubecontext {kubecontext}",
                "kubecontext": kubecontext
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        
        # Return sanitized config (without sensitive data)
        safe_config = {
            "success": True,
            "kubecontext": config['cluster_name'],  # Keep using cluster_name internally for now
            "enabled": config['enabled'],
            "namespace": config['namespace'],
            "service_address": config['service_address'],
            "url": config['url'],
            "effective_url": config['effective_url'],
            "has_token": bool(config.get('token')),
            "has_basic_auth": bool(config.get('basic_auth'))
        }
        
        track_call("get_prometheus_cluster_config", kwargs={"kubecontext": kubecontext}, 
                  output=f"Retrieved config for kubecontext {kubecontext}")
        safe_config["output"] = json.dumps(safe_config, indent=2)
        return safe_config
        
    except Exception as e:
        error_msg = f"Failed to get Prometheus configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("get_prometheus_cluster_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        response = {"success": False, "error": error_msg, "kubecontext": kubecontext}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def set_prometheus_config(kubecontext: str, namespace: str = "monitoring", 
                         service_address: Optional[str] = None, url: Optional[str] = None,
                         token: Optional[str] = None, username: Optional[str] = None, 
                         password: Optional[str] = None, enabled: bool = True) -> Dict[str, Any]:
    """
    Set Prometheus configuration for a specific kubecontext and save to additionalConfig.yaml.
    
    Args:
        kubecontext: Kubernetes context to configure Prometheus for
        namespace: Kubernetes namespace where Prometheus is running (default: monitoring)
        service_address: Internal service address (e.g., 'prometheus-kube-prometheus-stack:9090')
        url: External Prometheus URL (takes priority over service_address)
        token: Bearer token for authentication
        username: Username for basic authentication
        password: Password for basic authentication
        enabled: Whether Prometheus is enabled for this kubecontext
        
    Returns:
        Dict containing configuration result
    """
    try:
        # Import here to avoid circular imports
        from config.config import update_cluster_config
        
        # Build the prometheus configuration
        prometheus_config = {
            "enabled": enabled,
            "namespace": namespace
        }
        
        # Add URL or service_address
        if url:
            prometheus_config["url"] = url
        elif service_address:
            prometheus_config["service_address"] = service_address
        else:
            return {
                "success": False, 
                "error": "Either 'url' or 'service_address' must be provided"
            }
        
        # Add authentication if provided
        if token:
            prometheus_config["token"] = token
        elif username and password:
            prometheus_config["basic_auth"] = {
                "username": username,
                "password": password
            }
        
        # Update cluster configuration
        cluster_config = {"prometheus": prometheus_config}
        success = update_cluster_config(kubecontext, cluster_config)
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to save Prometheus configuration for kubecontext {kubecontext}"
            }
        
        # Clear cache to force reload
        clear_prometheus_config_cache()
        
        # Test the connection
        test_result = test_prometheus_connection(kubecontext)
        
        result = {
            "success": True,
            "message": f"Prometheus configuration saved for kubecontext {kubecontext}",
            "kubecontext": kubecontext,
            "configuration": {
                "enabled": enabled,
                "namespace": namespace,
                "url": url,
                "service_address": service_address,
                "has_token": bool(token),
                "has_basic_auth": bool(username and password)
            },
            "connection_test": test_result.get("success", False),
            "connection_error": test_result.get("error") if not test_result.get("success") else None
        }
        
        track_call("set_prometheus_config", kwargs={
            "kubecontext": kubecontext, 
            "namespace": namespace,
            "has_url": bool(url),
            "has_service_address": bool(service_address)
        }, output=f"Configuration saved for kubecontext {kubecontext}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to set Prometheus configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("set_prometheus_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def test_prometheus_connection(kubecontext: str) -> Dict[str, Any]:
    """
    Test Prometheus connection for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to test connection for
    
    Returns:
        Dict containing connection test results
    """
    
    try:
        # Test with a simple 'up' query using direct API call
        params = {"query": "up"}
        result = make_prometheus_request("/api/v1/query", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            prometheus_data = result["data"]
            
            # Check if Prometheus returned an error
            if prometheus_data.get("status") != "success":
                error_msg = prometheus_data.get("error", "Unknown Prometheus error")
                track_call("test_prometheus_connection", kwargs={"kubecontext": kubecontext}, error=error_msg)
                response = {
                    "success": False,
                    "kubecontext": kubecontext,
                    "error": f"Prometheus connection failed: {error_msg}",
                    "connection_test": False
                }
                response["output"] = json.dumps(response, indent=2)
                return response
            
            query_result = prometheus_data.get("data", {})
            result_data = query_result.get("result", [])
            
            track_call("test_prometheus_connection", kwargs={"kubecontext": kubecontext}, 
                      output=f"Connection successful for kubecontext {kubecontext}")
            
            response = {
                "success": True,
                "kubecontext": kubecontext,
                "message": "Prometheus connection successful",
                "query_result_count": len(result_data)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("test_prometheus_connection", kwargs={"kubecontext": kubecontext}, 
                      error=result.get("error"))
            response = {
                "success": False,
                "kubecontext": kubecontext,
                "error": f"Prometheus connection failed: {result.get('error')}",
                "connection_test": False
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to test Prometheus connection for kubecontext {kubecontext}: {str(e)}"
        track_call("test_prometheus_connection", kwargs={"kubecontext": kubecontext}, error=error_msg)
        response = {"success": False, "error": error_msg, "kubecontext": kubecontext}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def get_prometheus_navigation_url(kubecontext: str, resource_type: str, resource_name: Optional[str] = None, 
                                 query: Optional[str] = None) -> Dict[str, Any]:
    """
    Get navigation URLs for Prometheus web UI to view specific resources.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
        resource_type: Type of resource ('home', 'graph', 'targets', 'rules', 'config', 'flags', 'status')
        resource_name: Specific resource name if applicable
        query: PromQL query for graph view
        
    Returns:
        Dict containing the navigation URL
    """
    try:
        # Get kubecontext-specific Prometheus configuration
        config = get_prometheus_config(kubecontext)
        if not config:
            error_msg = f"No Prometheus configuration found for kubecontext {kubecontext}"
            track_call("get_prometheus_navigation_url", kwargs=locals(), error=error_msg)
            response = {"success": False, "error": error_msg}
            response["output"] = json.dumps(response, indent=2)
            return response
        
        if not config.get('enabled', False):
            error_msg = f"Prometheus is not enabled for kubecontext {kubecontext}"
            track_call("get_prometheus_navigation_url", kwargs=locals(), error=error_msg)
            response = {"success": False, "error": error_msg}
            response["output"] = json.dumps(response, indent=2)
            return response
        
        # Use the external URL if available, otherwise the effective URL might not be accessible from browser
        base_url = config.get('url') or config.get('effective_url')
        if not base_url:
            error_msg = f"No accessible Prometheus URL configured for kubecontext {kubecontext}. Set external URL in configuration."
            track_call("get_prometheus_navigation_url", kwargs=locals(), error=error_msg)
            response = {"success": False, "error": error_msg}
            response["output"] = json.dumps(response, indent=2)
            return response
        
        base_url = base_url.rstrip('/')
        
        url_mappings = {
            "home": "/",
            "graph": "/graph",
            "targets": "/targets",
            "rules": "/rules", 
            "config": "/config",
            "flags": "/flags",
            "status": "/status"
        }
        
        if resource_type not in url_mappings:
            error_msg = f"Invalid resource_type. Valid options: {list(url_mappings.keys())}"
            track_call("get_prometheus_navigation_url", kwargs=locals(), error=error_msg)
            response = {"success": False, "error": error_msg}
            response["output"] = json.dumps(response, indent=2)
            return response
        
        path = url_mappings[resource_type]
        navigation_url = f"{base_url}{path}"
        
        # Add query parameter for graph view
        if resource_type == "graph" and query:
            navigation_url += f"?g0.expr={query}&g0.tab=0"
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "resource_type": resource_type,
            "prometheus_base_url": base_url,
            "kubecontext": kubecontext
        }
        
        if query:
            result["query"] = query
        
        track_call("get_prometheus_navigation_url", kwargs=locals(), 
                  output=f"Generated URL for {resource_type}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate navigation URL: {str(e)}"
        track_call("get_prometheus_navigation_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

# Collection of all Prometheus tools
prometheus_tools = [
    # Query tools
    execute_query,
    execute_range_query,
    
    # Discovery tools
    list_metrics,
    get_metric_metadata,
    get_targets,
    
    # Configuration tools
    set_prometheus_config,
    get_prometheus_config_tool,
    test_prometheus_connection,
    
    # Navigation
    get_prometheus_navigation_url
]