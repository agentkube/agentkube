#-------------------------------------------------------------------------------------#
# Datadog Tools - Complete set of Datadog operations for monitoring, alerting, and observability.
# Includes incidents, monitors, logs, dashboards, metrics, traces, hosts, downtimes, and RUM with command tracking.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, List, Any
import datetime
from urllib.parse import urlencode
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

# Global configuration cache
_datadog_config_cache = {}

def get_datadog_config(cluster_name: str) -> Dict[str, Any]:
    """Get Datadog configuration for a specific cluster from cluster config"""
    if cluster_name in _datadog_config_cache:
        return _datadog_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        datadog_config = cluster_config.get('datadog', {})
        
        if not datadog_config:
            logger.warning(f"No Datadog configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': datadog_config.get('enabled', False),
            'api_key': datadog_config.get('api_key', ''),
            'app_key': datadog_config.get('app_key', ''),
            'site': datadog_config.get('site', 'datadoghq.com'),  # Default to US1
        }
        
        # Datadog requires direct API access
        if not config['api_key']:
            logger.error(f"No Datadog API key configured for cluster {cluster_name}")
            return {}
        
        if not config['app_key']:
            logger.error(f"No Datadog App key configured for cluster {cluster_name}")
            return {}
        
        # Cache the configuration
        _datadog_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load Datadog config for cluster {cluster_name}: {e}")
        return {}

def clear_datadog_config_cache():
    """Clear the configuration cache to force reload"""
    global _datadog_config_cache
    _datadog_config_cache = {}

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

def get_datadog_base_url(config: Dict[str, Any]) -> str:
    """Get the base URL for Datadog API"""
    site = config.get('site', 'datadoghq.com')
    return f"https://api.{site}"

def get_datadog_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for Datadog API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add API key and App key if configured
    if config.get('api_key'):
        headers["DD-API-KEY"] = config['api_key']
    if config.get('app_key'):
        headers["DD-APPLICATION-KEY"] = config['app_key']
    
    return headers

def make_datadog_request(method: str, endpoint: str, params: Optional[Dict] = None, 
                        data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to Datadog API using kubecontext-specific configuration"""
    
    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()
    
    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}
    
    # Get kubecontext-specific Datadog configuration
    config = get_datadog_config(kubecontext)
    if not config:
        return {"success": False, "error": f"No Datadog configuration found for kubecontext {kubecontext}"}
    
    if not config.get('enabled', False):
        return {"success": False, "error": f"Datadog is not enabled for kubecontext {kubecontext}"}
    
    if not config.get('api_key'):
        return {"success": False, "error": f"No Datadog API key configured for kubecontext {kubecontext}"}
    
    if not config.get('app_key'):
        return {"success": False, "error": f"No Datadog App key configured for kubecontext {kubecontext}"}
    
    url = f"{get_datadog_base_url(config)}{endpoint}"
    headers = get_datadog_headers(config)
    
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
# INCIDENT MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_incidents(kubecontext: str, filter: Optional[str] = None, pagination_json: Optional[str] = None) -> Dict[str, Any]:
    """
    Retrieve a list of incidents from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        filter: Filter parameters for incidents (e.g., status, priority)
        pagination_json: JSON string of pagination details like page size/offset
        
    Returns:
        Dict containing array of Datadog incidents and associated metadata
    """
    try:
        params = {}
        
        if filter:
            params["filter"] = filter
        if pagination_json:
            try:
                pagination = json.loads(pagination_json)
                params.update(pagination)
            except json.JSONDecodeError:
                pass  # Ignore invalid JSON for now or log error
        
        result = make_datadog_request("GET", "/api/v2/incidents", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            incidents_data = result["data"]
            incidents = incidents_data.get("data", [])
            
            track_call("list_incidents", kwargs=locals(), 
                      output=f"Retrieved {len(incidents)} incidents")
            response = {
                "success": True,
                "incidents": incidents,
                "total_count": len(incidents),
                "meta": incidents_data.get("meta", {}),
                "filter_applied": filter
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_incidents", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list incidents: {str(e)}"
        track_call("list_incidents", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_incident(kubecontext: str, incident_id: str) -> Dict[str, Any]:
    """
    Retrieve detailed information about a specific Datadog incident.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        incident_id: Incident ID to fetch details for
        
    Returns:
        Dict containing detailed incident information (title, status, timestamps, etc.)
    """
    try:
        result = make_datadog_request("GET", f"/api/v2/incidents/{incident_id}", kubecontext=kubecontext)
        
        if result["success"]:
            incident_data = result["data"].get("data", {})
            
            track_call("get_incident", kwargs=locals(), output="Incident details retrieved")
            response = {
                "success": True,
                "incident": incident_data,
                "incident_id": incident_id
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_incident", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get incident: {str(e)}"
        track_call("get_incident", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# MONITOR MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_monitors(kubecontext: str, groupStates: Optional[List[str]] = None, name: Optional[str] = None, 
                tags: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Fetch the status of Datadog monitors.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        groupStates: States to filter (e.g., alert, warn, no data, ok)
        name: Filter by name
        tags: Filter by tags
        
    Returns:
        Dict containing monitors data and a summary of their statuses
    """
    try:
        params = {}
        
        if groupStates:
            params["group_states"] = ",".join(groupStates)
        if name:
            params["name"] = name
        if tags:
            params["tags"] = ",".join(tags)
        
        result = make_datadog_request("GET", "/api/v1/monitor", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            monitors = result["data"]
            
            # Create summary of monitor statuses
            status_summary = {}
            for monitor in monitors:
                overall_state = monitor.get("overall_state", "unknown")
                status_summary[overall_state] = status_summary.get(overall_state, 0) + 1
            
            track_call("get_monitors", kwargs=locals(), 
                      output=f"Retrieved {len(monitors)} monitors")
            response = {
                "success": True,
                "monitors": monitors,
                "total_count": len(monitors),
                "status_summary": status_summary,
                "filters_applied": {
                    "group_states": groupStates,
                    "name": name,
                    "tags": tags
                }
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_monitors", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to get monitors: {str(e)}"
        track_call("get_monitors", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# LOGS TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_logs(kubecontext: str, query: str, from_time: int, to_time: int, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Search and retrieve logs from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        query: Datadog logs query string
        from_time: Start time in epoch seconds
        to_time: End time in epoch seconds
        limit: Maximum number of logs to return (defaults to 100)
        
    Returns:
        Dict containing array of matching logs
    """
    try:
        actual_limit = limit if limit is not None else 100
        
        data = {
            "filter": {
                "query": query,
                "from": from_time,
                "to": to_time
            },
            "page": {
                "limit": actual_limit
            }
        }
        
        result = make_datadog_request("POST", "/api/v2/logs/events/search", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            logs_data = result["data"]
            logs = logs_data.get("data", [])
            
            track_call("get_logs", kwargs=locals(), 
                      output=f"Retrieved {len(logs)} logs")
            response = {
                "success": True,
                "logs": logs,
                "total_count": len(logs),
                "query": query,
                "time_range": {"from": from_time, "to": to_time},
                "meta": logs_data.get("meta", {})
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_logs", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get logs: {str(e)}"
        track_call("get_logs", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# DASHBOARD TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_dashboards(kubecontext: str, name: Optional[str] = None, tags: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Get a list of dashboards from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        name: Filter dashboards by name
        tags: Filter dashboards by tags
        
    Returns:
        Dict containing array of dashboards with URL references
    """
    try:
        params = {}
        
        if name:
            params["filter[shared]"] = "false"  # Include personal dashboards in search
        if tags:
            # Note: Datadog API doesn't support tag filtering directly in list endpoint
            pass
        
        result = make_datadog_request("GET", "/api/v1/dashboard", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            dashboards_data = result["data"]
            dashboards = dashboards_data.get("dashboards", [])
            
            # Filter by name if provided
            if name:
                dashboards = [d for d in dashboards if name.lower() in d.get("title", "").lower()]
            
            # Add navigation URLs (get site from config)
            config = get_datadog_config(kubecontext)
            site = config.get('site', 'datadoghq.com')
            for dashboard in dashboards:
                dashboard_id = dashboard.get("id")
                if dashboard_id:
                    dashboard["navigation_url"] = f"https://app.{site}/dashboard/{dashboard_id}"
            
            track_call("list_dashboards", kwargs=locals(), 
                      output=f"Retrieved {len(dashboards)} dashboards")
            response = {
                "success": True,
                "dashboards": dashboards,
                "total_count": len(dashboards),
                "filters_applied": {"name": name, "tags": tags}
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_dashboards", kwargs=locals(), error=result["error"])
            return result
            
    except Exception as e:
        error_msg = f"Failed to list dashboards: {str(e)}"
        track_call("list_dashboards", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_dashboard(kubecontext: str, dashboard_id: str) -> Dict[str, Any]:
    """
    Retrieve a specific dashboard from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        dashboard_id: ID of the dashboard to fetch
        
    Returns:
        Dict containing dashboard details including title, widgets, etc.
    """
    try:
        result = make_datadog_request("GET", f"/api/v1/dashboard/{dashboard_id}", kubecontext=kubecontext)
        
        if result["success"]:
            dashboard = result["data"]
            
            # Add navigation URL using cluster-specific site config
            config = get_datadog_config(kubecontext)
            site = config.get('site', 'datadoghq.com')
            dashboard["navigation_url"] = f"https://app.{site}/dashboard/{dashboard_id}"
            
            track_call("get_dashboard", kwargs=locals(), output="Dashboard details retrieved")
            response = {
                "success": True,
                "dashboard": dashboard,
                "dashboard_id": dashboard_id
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_dashboard", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get dashboard: {str(e)}"
        track_call("get_dashboard", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# METRICS TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def query_metrics(kubecontext: str, query: str, from_time: int, to_time: int) -> Dict[str, Any]:
    """
    Retrieve metrics data from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        query: Metrics query string
        from_time: Start time in epoch seconds
        to_time: End time in epoch seconds
        
    Returns:
        Dict containing metrics data for the queried timeframe
    """
    try:
        params = {
            "query": query,
            "from": from_time,
            "to": to_time
        }
        
        result = make_datadog_request("GET", "/api/v1/query", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            metrics_data = result["data"]
            
            track_call("query_metrics", kwargs=locals(), output="Metrics data retrieved")
            response = {
                "success": True,
                "metrics": metrics_data,
                "query": query,
                "time_range": {"from": from_time, "to": to_time}
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("query_metrics", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to query metrics: {str(e)}"
        track_call("query_metrics", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# APM TRACES TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_traces(kubecontext: str, query: str, from_time: int, to_time: int, limit: Optional[int] = None,
               sort: Optional[str] = None, service: Optional[str] = None, 
               operation: Optional[str] = None) -> Dict[str, Any]:
    """
    Retrieve a list of APM traces from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        query: Datadog APM trace query string
        from_time: Start time in epoch seconds
        to_time: End time in epoch seconds
        limit: Maximum number of traces to return (defaults to 100)
        sort: Sort order for traces (defaults to '-timestamp')
        service: Filter by service name
        operation: Filter by operation name
        
    Returns:
        Dict containing array of matching traces from Datadog APM
    """
    try:
        actual_limit = limit if limit is not None else 100
        actual_sort = sort if sort is not None else '-timestamp'
        
        data = {
            "filter": {
                "query": query,
                "from": from_time,
                "to": to_time
            },
            "page": {
                "limit": actual_limit
            },
            "sort": actual_sort
        }
        
        if service:
            data["filter"]["service"] = service
        if operation:
            data["filter"]["operation"] = operation
        
        result = make_datadog_request("POST", "/api/v2/apm/traces/search", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            traces_data = result["data"]
            traces = traces_data.get("data", [])
            
            track_call("list_traces", kwargs=locals(), 
                      output=f"Retrieved {len(traces)} traces")
            response = {
                "success": True,
                "traces": traces,
                "total_count": len(traces),
                "query": query,
                "time_range": {"from": from_time, "to": to_time},
                "filters_applied": {"service": service, "operation": operation},
                "meta": traces_data.get("meta", {})
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_traces", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list traces: {str(e)}"
        track_call("list_traces", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# HOST MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_hosts(kubecontext: str, filter: Optional[str] = None, sort_field: Optional[str] = None,
              sort_dir: Optional[str] = None, start: Optional[int] = None,
              count: Optional[int] = None, from_time: Optional[int] = None,
              include_muted_hosts_data: Optional[bool] = None,
              include_hosts_metadata: Optional[bool] = None) -> Dict[str, Any]:
    """
    Get list of hosts from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        filter: Filter string for search results
        sort_field: Field to sort hosts by
        sort_dir: Sort direction (asc/desc)
        start: Starting offset for pagination
        count: Max number of hosts to return (max: 1000)
        from_time: Search hosts from this UNIX timestamp
        include_muted_hosts_data: Include muted hosts status and expiry
        include_hosts_metadata: Include host metadata (version, platform, etc)
        
    Returns:
        Dict containing array of hosts with details
    """
    try:
        params = {}
        
        if filter:
            params["filter"] = filter
        if sort_field:
            params["sort_field"] = sort_field
        if sort_dir:
            params["sort_dir"] = sort_dir
        if start is not None:
            params["start"] = start
        if count is not None:
            params["count"] = min(count, 1000)  # Enforce max limit
        if from_time is not None:
            params["from"] = from_time
        if include_muted_hosts_data is not None:
            params["include_muted_hosts_data"] = include_muted_hosts_data
        if include_hosts_metadata is not None:
            params["include_hosts_metadata"] = include_hosts_metadata
        
        result = make_datadog_request("GET", "/api/v1/hosts", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            hosts_data = result["data"]
            hosts = hosts_data.get("host_list", [])
            
            track_call("list_hosts", kwargs=locals(), 
                      output=f"Retrieved {len(hosts)} hosts")
            response = {
                "success": True,
                "hosts": hosts,
                "total_count": len(hosts),
                "total_matching": hosts_data.get("total_matching", 0),
                "total_returned": hosts_data.get("total_returned", 0),
                "filters_applied": {
                    "filter": filter,
                    "sort_field": sort_field,
                    "sort_dir": sort_dir
                }
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_hosts", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list hosts: {str(e)}"
        track_call("list_hosts", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_active_hosts_count(kubecontext: str, from_time: Optional[int] = None) -> Dict[str, Any]:
    """
    Get the total number of active hosts in Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        from_time: Number of hours from which you want to get total number of active hosts (defaults to 2)
        
    Returns:
        Dict containing count of total active and up hosts
    """
    try:
        actual_from = from_time if from_time is not None else 2  # Default to 2 hours
        
        params = {"from": actual_from}
        
        result = make_datadog_request("GET", "/api/v1/hosts/totals", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            totals_data = result["data"]
            
            track_call("get_active_hosts_count", kwargs=locals(), 
                      output=f"Retrieved host counts")
            response = {
                "success": True,
                "totals": totals_data,
                "from_hours": actual_from
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_active_hosts_count", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get active hosts count: {str(e)}"
        track_call("get_active_hosts_count", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def mute_host(kubecontext: str, hostname: str, message: Optional[str] = None, end: Optional[int] = None,
             override: Optional[bool] = None) -> Dict[str, Any]:
    """
    Mute a host in Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        hostname: The name of the host to mute
        message: Message to associate with the muting of this host
        end: POSIX timestamp for when the mute should end
        override: If true and the host is already muted, replaces existing end time
        
    Returns:
        Dict containing success status and confirmation message
    """
    try:
        data = {}
        
        if message:
            data["message"] = message
        if end is not None:
            data["end"] = end
        if override is not None:
            data["override"] = override
        
        result = make_datadog_request("POST", f"/api/v1/host/{hostname}/mute", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            track_call("mute_host", kwargs=locals(), output=f"Host {hostname} muted successfully")
            response = {
                "success": True,
                "message": f"Host {hostname} muted successfully",
                "hostname": hostname,
                "action": "mute"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("mute_host", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to mute host: {str(e)}"
        track_call("mute_host", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def unmute_host(kubecontext: str, hostname: str) -> Dict[str, Any]:
    """
    Unmute a host in Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        hostname: The name of the host to unmute
        
    Returns:
        Dict containing success status and confirmation message
    """
    try:
        result = make_datadog_request("POST", f"/api/v1/host/{hostname}/unmute", kubecontext=kubecontext)
        
        if result["success"]:
            track_call("unmute_host", kwargs=locals(), output=f"Host {hostname} unmuted successfully")
            response = {
                "success": True,
                "message": f"Host {hostname} unmuted successfully",
                "hostname": hostname,
                "action": "unmute"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("unmute_host", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to unmute host: {str(e)}"
        track_call("unmute_host", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# DOWNTIME MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_downtimes(kubecontext: str, currentOnly: Optional[bool] = None, monitorId: Optional[int] = None) -> Dict[str, Any]:
    """
    List scheduled downtimes from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        currentOnly: Return only currently active downtimes when true
        monitorId: Filter by monitor ID
        
    Returns:
        Dict containing array of scheduled downtimes with details
    """
    try:
        params = {}
        
        if currentOnly is not None:
            params["current_only"] = currentOnly
        if monitorId is not None:
            params["monitor_id"] = monitorId
        
        result = make_datadog_request("GET", "/api/v1/downtime", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            downtimes = result["data"]
            
            track_call("list_downtimes", kwargs=locals(), 
                      output=f"Retrieved {len(downtimes)} downtimes")
            response = {
                "success": True,
                "downtimes": downtimes,
                "total_count": len(downtimes),
                "filters_applied": {
                    "current_only": currentOnly,
                    "monitor_id": monitorId
                }
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_downtimes", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list downtimes: {str(e)}"
        track_call("list_downtimes", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def schedule_downtime(kubecontext: str, scope: str, start: Optional[int] = None, end: Optional[int] = None,
                     message: Optional[str] = None, timezone: Optional[str] = None,
                     monitorId: Optional[int] = None, monitorTags: Optional[List[str]] = None,
                     recurrence_json: Optional[str] = None) -> Dict[str, Any]:
    """
    Schedule a downtime in Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        scope: Scope to apply downtime to (e.g. 'host:my-host')
        start: UNIX timestamp for the start of the downtime
        end: UNIX timestamp for the end of the downtime
        message: A message to include with the downtime
        timezone: The timezone for the downtime (e.g. 'UTC', 'America/New_York')
        monitorId: The ID of the monitor to mute
        monitorTags: A list of monitor tags for filtering
        recurrence_json: JSON string of recurrence settings for the downtime
        
    Returns:
        Dict containing scheduled downtime details including ID and active status
    """
    try:
        data = {"scope": scope}
        
        if start is not None:
            data["start"] = start
        if end is not None:
            data["end"] = end
        if message:
            data["message"] = message
        if timezone:
            data["timezone"] = timezone
        if monitorId is not None:
            data["monitor_id"] = monitorId
        if monitorTags:
            data["monitor_tags"] = monitorTags
        if recurrence_json:
            try:
                data["recurrence"] = json.loads(recurrence_json)
            except json.JSONDecodeError as e:
                return {"success": False, "error": f"Invalid JSON in recurrence: {str(e)}"}
        
        result = make_datadog_request("POST", "/api/v1/downtime", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            downtime_data = result["data"]
            
            track_call("schedule_downtime", kwargs=locals(), 
                      output=f"Downtime scheduled with ID: {downtime_data.get('id')}")
            response = {
                "success": True,
                "downtime": downtime_data,
                "downtime_id": downtime_data.get("id"),
                "scope": scope
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("schedule_downtime", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to schedule downtime: {str(e)}"
        track_call("schedule_downtime", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def cancel_downtime(kubecontext: str, downtimeId: int) -> Dict[str, Any]:
    """
    Cancel a scheduled downtime in Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        downtimeId: The ID of the downtime to cancel
        
    Returns:
        Dict containing confirmation of downtime cancellation
    """
    try:
        result = make_datadog_request("DELETE", f"/api/v1/downtime/{downtimeId}", kubecontext=kubecontext)
        
        if result["success"]:
            track_call("cancel_downtime", kwargs=locals(), 
                      output=f"Downtime {downtimeId} cancelled successfully")
            response = {
                "success": True,
                "message": f"Downtime {downtimeId} cancelled successfully",
                "downtime_id": downtimeId,
                "action": "cancelled"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("cancel_downtime", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to cancel downtime: {str(e)}"
        track_call("cancel_downtime", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# RUM (REAL USER MONITORING) TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_rum_applications(kubecontext: str) -> Dict[str, Any]:
    """
    Get all RUM applications in the organization.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
    
    Returns:
        Dict containing list of RUM applications
    """
    try:
        result = make_datadog_request("GET", "/api/v2/rum/applications", kubecontext=kubecontext)
        
        if result["success"]:
            apps_data = result["data"]
            applications = apps_data.get("data", [])
            
            track_call("get_rum_applications", kwargs=locals(), output=f"Retrieved {len(applications)} RUM applications")
            response = {
                "success": True,
                "applications": applications,
                "total_count": len(applications)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_rum_applications", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get RUM applications: {str(e)}"
        track_call("get_rum_applications", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_rum_events(kubecontext: str, query: str, from_time: int, to_time: int, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Search and retrieve RUM events from Datadog.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        query: Datadog RUM query string
        from_time: Start time in epoch seconds
        to_time: End time in epoch seconds
        limit: Maximum number of events to return (default: 100)
        
    Returns:
        Dict containing array of RUM events
    """
    try:
        actual_limit = limit if limit is not None else 100
        
        data = {
            "filter": {
                "query": query,
                "from": from_time,
                "to": to_time
            },
            "page": {
                "limit": actual_limit
            }
        }
        
        result = make_datadog_request("POST", "/api/v2/rum/events/search", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            events_data = result["data"]
            events = events_data.get("data", [])
            
            track_call("get_rum_events", kwargs=locals(), 
                      output=f"Retrieved {len(events)} RUM events")
            response = {
                "success": True,
                "events": events,
                "total_count": len(events),
                "query": query,
                "time_range": {"from": from_time, "to": to_time},
                "meta": events_data.get("meta", {})
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_rum_events", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get RUM events: {str(e)}"
        track_call("get_rum_events", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_rum_grouped_event_count(kubecontext: str, query: Optional[str] = None, from_time: int = None, 
                               to_time: int = None, groupBy: Optional[str] = None) -> Dict[str, Any]:
    """
    Search, group and count RUM events by a specified dimension.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        query: Additional query filter for RUM search (default: "*")
        from_time: Start time in epoch seconds
        to_time: End time in epoch seconds
        groupBy: Dimension to group results by (default: "application.name")
        
    Returns:
        Dict containing grouped event counts
    """
    try:
        actual_query = query if query is not None else "*"
        actual_group_by = groupBy if groupBy is not None else "application.name"
        
        data = {
            "filter": {
                "query": actual_query,
                "from": from_time,
                "to": to_time
            },
            "group_by": [actual_group_by],
            "compute": [{"aggregation": "count", "type": "total"}]
        }
        
        result = make_datadog_request("POST", "/api/v2/rum/analytics/aggregate", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            analytics_data = result["data"]
            buckets = analytics_data.get("buckets", [])
            
            track_call("get_rum_grouped_event_count", kwargs=locals(), 
                      output=f"Retrieved {len(buckets)} grouped results")
            response = {
                "success": True,
                "grouped_counts": buckets,
                "total_groups": len(buckets),
                "query": actual_query,
                "group_by": actual_group_by,
                "time_range": {"from": from_time, "to": to_time},
                "meta": analytics_data.get("meta", {})
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_rum_grouped_event_count", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get RUM grouped event count: {str(e)}"
        track_call("get_rum_grouped_event_count", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_rum_page_performance(kubecontext: str, query: Optional[str] = None, from_time: int = None, 
                            to_time: int = None, metricNames: List[str] = None) -> Dict[str, Any]:
    """
    Get page (view) performance metrics from RUM data.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        query: Additional query filter for RUM search (default: "*")
        from_time: Start time in epoch seconds
        to_time: End time in epoch seconds
        metricNames: Array of metric names to retrieve (e.g., 'view.load_time', 'view.first_contentful_paint')
        
    Returns:
        Dict containing performance metrics including average, min, max, and count for each metric
    """
    try:
        actual_query = query if query is not None else "*"
        actual_metrics = metricNames if metricNames is not None else ["view.load_time"]
        
        # Build compute array for each metric
        compute_metrics = []
        for metric in actual_metrics:
            compute_metrics.extend([
                {"aggregation": "avg", "metric": metric, "type": "total"},
                {"aggregation": "min", "metric": metric, "type": "total"},
                {"aggregation": "max", "metric": metric, "type": "total"},
                {"aggregation": "count", "type": "total"}
            ])
        
        data = {
            "filter": {
                "query": actual_query,
                "from": from_time,
                "to": to_time
            },
            "compute": compute_metrics
        }
        
        result = make_datadog_request("POST", "/api/v2/rum/analytics/aggregate", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            analytics_data = result["data"]
            
            track_call("get_rum_page_performance", kwargs=locals(), 
                      output=f"Retrieved performance metrics for {len(actual_metrics)} metrics")
            response = {
                "success": True,
                "performance_data": analytics_data,
                "metrics_requested": actual_metrics,
                "query": actual_query,
                "time_range": {"from": from_time, "to": to_time}
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_rum_page_performance", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get RUM page performance: {str(e)}"
        track_call("get_rum_page_performance", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_rum_page_waterfall(kubecontext: str, applicationName: str, sessionId: str) -> Dict[str, Any]:
    """
    Retrieve RUM page (view) waterfall data filtered by application name and session ID.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        applicationName: Application name to filter events
        sessionId: Session ID to filter events
        
    Returns:
        Dict containing waterfall data for the specified application and session
    """
    try:
        query = f"@application.name:{applicationName} @session.id:{sessionId} @type:resource"
        
        data = {
            "filter": {
                "query": query
            },
            "sort": "@start_time",
            "page": {
                "limit": 1000  # Get all resources for waterfall
            }
        }
        
        result = make_datadog_request("POST", "/api/v2/rum/events/search", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            events_data = result["data"]
            resources = events_data.get("data", [])
            
            # Process resources for waterfall visualization
            waterfall_data = []
            for resource in resources:
                attributes = resource.get("attributes", {})
                waterfall_data.append({
                    "name": attributes.get("resource", {}).get("url", ""),
                    "start_time": attributes.get("start_time", 0),
                    "duration": attributes.get("duration", 0),
                    "type": attributes.get("resource", {}).get("type", ""),
                    "size": attributes.get("resource", {}).get("size", 0),
                    "status_code": attributes.get("resource", {}).get("status_code", 0)
                })
            
            track_call("get_rum_page_waterfall", kwargs=locals(), 
                      output=f"Retrieved waterfall with {len(waterfall_data)} resources")
            response = {
                "success": True,
                "waterfall_data": waterfall_data,
                "total_resources": len(waterfall_data),
                "application_name": applicationName,
                "session_id": sessionId,
                "meta": events_data.get("meta", {})
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_rum_page_waterfall", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get RUM page waterfall: {str(e)}"
        track_call("get_rum_page_waterfall", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# NAVIGATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_datadog_navigation_url(kubecontext: str, resource_type: str, resource_id: Optional[str] = None,
                              query: Optional[str] = None, from_time: Optional[int] = None,
                              to_time: Optional[int] = None) -> Dict[str, Any]:
    """
    Get navigation URLs for Datadog web UI to view specific resources.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        resource_type: Type of resource ('dashboards', 'dashboard', 'monitors', 'logs', 'apm', 'infrastructure', 'rum')
        resource_id: Specific resource ID (required for 'dashboard' type)
        query: Query string for logs/apm/rum views
        from_time: Start time in epoch milliseconds for time-based views
        to_time: End time in epoch milliseconds for time-based views
        
    Returns:
        Dict containing the navigation URL
    """
    try:
        # Get cluster-specific site configuration
        config = get_datadog_config(kubecontext)
        site = config.get('site', 'datadoghq.com')
        
        if not site:
            error_msg = "Datadog site not configured for this cluster"
            track_call("get_datadog_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        base_url = f"https://app.{site}"
        
        url_mappings = {
            "home": "/",
            "dashboards": "/dashboard/lists",
            "dashboard": "/dashboard/{id}",
            "monitors": "/monitors/manage",
            "logs": "/logs",
            "apm": "/apm/traces", 
            "infrastructure": "/infrastructure",
            "rum": "/rum/explorer"
        }
        
        if resource_type not in url_mappings:
            error_msg = f"Invalid resource_type. Valid options: {list(url_mappings.keys())}"
            track_call("get_datadog_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        if resource_type == "dashboard":
            if not resource_id:
                error_msg = "resource_id is required for dashboard resource_type"
                track_call("get_datadog_navigation_url", kwargs=locals(), error=error_msg)
                return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
            path = url_mappings[resource_type].format(id=resource_id)
        else:
            path = url_mappings[resource_type]
        
        navigation_url = f"{base_url}{path}"
        
        # Add query parameters for time-based views
        params = []
        if query and resource_type in ["logs", "apm", "rum"]:
            params.append(f"query={urlencode({'': query})[1:]}")
        if from_time and to_time:
            params.append(f"from_ts={from_time}&to_ts={to_time}")
        
        if params:
            navigation_url += "?" + "&".join(params)
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "resource_type": resource_type,
            "datadog_base_url": base_url,
            "datadog_site": site
        }
        
        if resource_id:
            result["resource_id"] = resource_id
        if query:
            result["query"] = query
        if from_time and to_time:
            result["time_range"] = {"from": from_time, "to": to_time}
        
        result["output"] = json.dumps(result, indent=2)
        track_call("get_datadog_navigation_url", kwargs=locals(), 
                  output=f"Generated URL for {resource_type}")
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate navigation URL: {str(e)}"
        track_call("get_datadog_navigation_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_datadog_dashboard_url(kubecontext: str, dashboard_id: str, template_vars_json: Optional[str] = None) -> Dict[str, Any]:
    """
    Get direct navigation URL for a specific Datadog dashboard in the web UI.
    
    Args:
        kubecontext: Kubernetes context to use for Datadog configuration
        dashboard_id: ID of the dashboard
        template_vars_json: JSON string of template variables to apply to the dashboard
        
    Returns:
        Dict containing the navigation URL for the dashboard
    """
    try:
        # Get cluster-specific site configuration
        config = get_datadog_config(kubecontext)
        site = config.get('site', 'datadoghq.com')
        
        if not site:
            error_msg = "Datadog site not configured for this cluster"
            track_call("get_datadog_dashboard_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        base_url = f"https://app.{site}"
        navigation_url = f"{base_url}/dashboard/{dashboard_id}"
        
        template_vars = {}
        if template_vars_json:
            try:
                template_vars = json.loads(template_vars_json)
            except json.JSONDecodeError as e:
                return {"success": False, "error": f"Invalid JSON in template_vars: {str(e)}"}
        
        # Add template variables if provided
        if template_vars:
            params = []
            for key, value in template_vars.items():
                params.append(f"tpl_var_{key}={value}")
            if params:
                navigation_url += "?" + "&".join(params)
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "dashboard_id": dashboard_id,
            "datadog_base_url": base_url,
            "datadog_site": site
        }
        
        if template_vars:
            result["template_vars"] = template_vars
        
        result["output"] = json.dumps(result, indent=2)
        track_call("get_datadog_dashboard_url", kwargs=locals(), 
                  output=f"Generated URL for dashboard {dashboard_id}")
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate dashboard URL: {str(e)}"
        track_call("get_datadog_dashboard_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# CONFIGURATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def set_datadog_config(cluster_name: str, api_key: str, app_key: str, site: Optional[str] = None) -> Dict[str, Any]:
    """
    Set Datadog connection configuration for a specific cluster.
    
    Args:
        cluster_name: Name of the cluster to configure
        api_key: Your Datadog API key
        app_key: Your Datadog Application key
        site: The Datadog site (e.g. datadoghq.com, datadoghq.eu)
        
    Returns:
        Dict containing configuration result
    """
    try:
        from config.config import get_cluster_config, update_cluster_config
        
        # Get current cluster config
        cluster_config = get_cluster_config(cluster_name)
        
        # Update Datadog configuration
        datadog_config = {
            'enabled': True,
            'api_key': api_key,
            'app_key': app_key,
            'site': site if site is not None else 'datadoghq.com'
        }
        
        cluster_config['datadog'] = datadog_config
        update_cluster_config(cluster_name, cluster_config)
        
        # Clear cache for this cluster
        if cluster_name in _datadog_config_cache:
            del _datadog_config_cache[cluster_name]
        
        # Test connection
        test_result = test_datadog_connection(cluster_name)
        
        result = {
            "success": True,
            "message": f"Datadog configuration set successfully for cluster: {cluster_name}",
            "cluster_name": cluster_name,
            "datadog_site": datadog_config['site'],
            "connection_test": test_result["success"],
            "connection_error": test_result.get("error") if not test_result["success"] else None
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("set_datadog_config", kwargs={
            "cluster_name": cluster_name,
            "site": datadog_config['site']
        }, output="Configuration set successfully")
        return result
        
    except Exception as e:
        error_msg = f"Failed to set Datadog configuration: {str(e)}"
        track_call("set_datadog_config", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_datadog_config_tool(cluster_name: str) -> Dict[str, Any]:
    """
    Get current Datadog connection configuration for a specific cluster.
    
    Args:
        cluster_name: Name of the cluster to get configuration for
        
    Returns:
        Dict containing current configuration
    """
    try:
        config = get_datadog_config(cluster_name)
        
        result = {
            "success": True,
            "cluster_name": cluster_name,
            "enabled": config.get('enabled', False),
            "has_api_key": bool(config.get('api_key')),
            "has_app_key": bool(config.get('app_key')),
            "site": config.get('site', 'datadoghq.com'),
            "configured": bool(config.get('api_key') and config.get('app_key'))
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("get_datadog_config_tool", kwargs=locals(), output="Configuration retrieved")
        return result
        
    except Exception as e:
        error_msg = f"Failed to get Datadog configuration: {str(e)}"
        track_call("get_datadog_config_tool", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def test_datadog_connection(cluster_name: str) -> Dict[str, Any]:
    """
    Test Datadog connection for a specific cluster.
    
    Args:
        cluster_name: Name of the cluster to test connection for
        
    Returns:
        Dict containing connection test results
    """
    try:
        config = get_datadog_config(cluster_name)
        
        if not config.get('enabled', False):
            return {
                "success": False, 
                "error": f"Datadog not enabled for cluster: {cluster_name}",
                "output": json.dumps({"success": False, "error": f"Datadog not enabled for cluster: {cluster_name}"}, indent=2)
            }
        
        if not (config.get('api_key') and config.get('app_key')):
            return {
                "success": False, 
                "error": f"Datadog credentials not configured for cluster: {cluster_name}",
                "output": json.dumps({"success": False, "error": f"Datadog credentials not configured for cluster: {cluster_name}"}, indent=2)
            }
        
        # Test connection by validating API credentials
        result = make_datadog_request("GET", "/api/v1/validate", kubecontext=cluster_name)
        
        if result["success"]:
            response = {
                "success": True,
                "message": f"Successfully connected to Datadog for cluster: {cluster_name}",
                "cluster_name": cluster_name,
                "site": config.get('site', 'datadoghq.com')
            }
            response["output"] = json.dumps(response, indent=2)
            track_call("test_datadog_connection", kwargs=locals(), output="Connection test successful")
            return response
        else:
            error_response = {
                "success": False,
                "error": f"Failed to connect to Datadog for cluster {cluster_name}: {result.get('error', 'Unknown error')}",
                "cluster_name": cluster_name
            }
            error_response["output"] = json.dumps(error_response, indent=2)
            track_call("test_datadog_connection", kwargs=locals(), error=error_response["error"])
            return error_response
            
    except Exception as e:
        error_msg = f"Failed to test Datadog connection: {str(e)}"
        track_call("test_datadog_connection", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

# Configuration tools
datadog_config_tools = [
    get_datadog_config_tool,
    set_datadog_config,
    test_datadog_connection
]

# Read-only operations - allowed in recon mode
datadog_read_tools = [
    # Incident management tools
    list_incidents,
    get_incident,
    
    # Monitor management tools
    get_monitors,
    
    # Logs tools
    get_logs,
    
    # Dashboard tools
    list_dashboards,
    get_dashboard,
    
    # Metrics tools
    query_metrics,
    
    # APM traces tools
    list_traces,
    
    # Host management tools
    list_hosts,
    get_active_hosts_count,
    
    # Downtime management tools
    list_downtimes,
    
    # RUM tools
    get_rum_applications,
    get_rum_events,
    get_rum_grouped_event_count,
    get_rum_page_performance,
    get_rum_page_waterfall,
    
    # Navigation tools
    get_datadog_navigation_url,
    get_datadog_dashboard_url
] + datadog_config_tools

# Action/modification operations - only allowed when recon mode is off
datadog_action_tools = [
    # Host management actions
    # mute_host,
    # unmute_host,
    
    # # Downtime management actions
    # schedule_downtime,
    # cancel_downtime
]

# Combined tools based on recon mode
def get_datadog_tools():
    from config.config import get_recon_mode
    if get_recon_mode():
        return datadog_read_tools
    else:
        return datadog_read_tools + datadog_action_tools

# For backward compatibility
datadog_tools = get_datadog_tools()