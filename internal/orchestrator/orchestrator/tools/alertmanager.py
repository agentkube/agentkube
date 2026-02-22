#-------------------------------------------------------------------------------------#
# Alertmanager Tools - Complete set of Alertmanager operations for alert management and silencing.
# Includes alert retrieval, silencing, grouping, and detailed alert information with command tracking.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, List, Any
import datetime
from urllib.parse import urlencode, urljoin
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
_alertmanager_config_cache = {}

def get_alertmanager_config(cluster_name: str) -> Dict[str, Any]:
    """Get Alertmanager configuration for a specific cluster from cluster config"""
    if cluster_name in _alertmanager_config_cache:
        return _alertmanager_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        alertmanager_config = cluster_config.get('alertmanager', {})
        
        if not alertmanager_config:
            logger.warning(f"No Alertmanager configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': alertmanager_config.get('enabled', False),
            'namespace': alertmanager_config.get('namespace', 'monitoring'),
            'service_address': alertmanager_config.get('service_address', ''),
            'url': alertmanager_config.get('url', ''),  # External URL if available
            'username': alertmanager_config.get('username', ''),
            'password': alertmanager_config.get('password', ''),
            'api_token': alertmanager_config.get('api_token', ''),
        }
        
        # Priority: Use external URL if provided, otherwise build proxy URL
        if config['url']:
            # User provided external URL - use it directly
            config['effective_url'] = config['url']
            logger.info(f"Using external Alertmanager URL for {cluster_name}: {config['url']}")
        elif config['service_address'] and config['namespace']:
            # Build proxy URL through operator server
            config['effective_url'] = f"{OPERATOR_SERVER_URL}/api/v1/clusters/{cluster_name}/api/v1/namespaces/{config['namespace']}/services/{config['service_address']}/proxy"
            logger.info(f"Using proxy Alertmanager URL for {cluster_name}: {config['effective_url']}")
        else:
            logger.error(f"No valid Alertmanager configuration for cluster {cluster_name}: missing both 'url' and 'service_address/namespace'")
            return {}
        
        # Cache the configuration
        _alertmanager_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load Alertmanager config for cluster {cluster_name}: {e}")
        return {}

def clear_alertmanager_config_cache():
    """Clear the configuration cache to force reload"""
    global _alertmanager_config_cache
    _alertmanager_config_cache = {}

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

def get_alertmanager_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for Alertmanager API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add Bearer token if configured
    if config.get('api_token'):
        headers["Authorization"] = f"Bearer {config['api_token']}"
    
    return headers

def get_alertmanager_auth(config: Dict[str, Any]) -> Optional[tuple]:
    """Get authentication tuple for Alertmanager API requests (basic auth)"""
    username = config.get('username')
    password = config.get('password')
    
    if username and password:
        return (username, password)
    
    return None

def make_alertmanager_request(method: str, endpoint: str, params: Optional[Dict] = None, 
                             data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to Alertmanager API using kubecontext-specific configuration"""
    
    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()
    
    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}
    
    # Get kubecontext-specific Alertmanager configuration
    config = get_alertmanager_config(kubecontext)
    if not config:
        return {"success": False, "error": f"No Alertmanager configuration found for kubecontext {kubecontext}"}
    
    if not config.get('enabled', False):
        return {"success": False, "error": f"Alertmanager is not enabled for kubecontext {kubecontext}"}
    
    effective_url = config.get('effective_url')
    if not effective_url:
        return {"success": False, "error": f"No valid Alertmanager URL configured for kubecontext {kubecontext}"}
    
    url = urljoin(effective_url.rstrip('/') + '/', endpoint.lstrip('/'))
    headers = get_alertmanager_headers(config)
    auth = get_alertmanager_auth(config)
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, params=params, auth=auth)
        elif method.upper() == "POST":
            response = requests.post(url, headers=headers, params=params, json=data, auth=auth)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=headers, params=params, json=data, auth=auth)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, params=params, auth=auth)
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
# ALERT MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_alerts(kubecontext: str, filter: Optional[str] = None, silenced: Optional[bool] = None,
               inhibited: Optional[bool] = None, active: Optional[bool] = None) -> Dict[str, Any]:
    """
    Retrieves a list of alerts with optional filtering.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        filter: Filtering query (e.g., alertname=~'.*CPU.*')
        silenced: Include silenced alerts
        inhibited: Include inhibited alerts
        active: Include active alerts (default: true)
        
    Returns:
        Dict containing array of alerts
    """
    try:
        params = {}
        
        if filter:
            # Parse filter string and add as individual parameters
            # Alertmanager expects filters as query parameters
            params["filter"] = filter
        
        if silenced is not None:
            params["silenced"] = str(silenced).lower()
        if inhibited is not None:
            params["inhibited"] = str(inhibited).lower()
        if active is not None:
            params["active"] = str(active).lower()
        elif active is None:
            # Default to active alerts
            params["active"] = "true"
        
        result = make_alertmanager_request("GET", "/api/v2/alerts", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            alerts = result["data"]
            
            # Count alerts by status
            status_counts = {"active": 0, "silenced": 0, "inhibited": 0}
            for alert in alerts:
                status = alert.get("status", {})
                if status.get("silencedBy"):
                    status_counts["silenced"] += 1
                elif status.get("inhibitedBy"):
                    status_counts["inhibited"] += 1
                else:
                    status_counts["active"] += 1
            
            track_call("get_alerts", kwargs=locals(), 
                      output=f"Retrieved {len(alerts)} alerts")
            response = {
                "success": True,
                "alerts": alerts,
                "total_count": len(alerts),
                "status_counts": status_counts,
                "filters_applied": {
                    "filter": filter,
                    "silenced": silenced,
                    "inhibited": inhibited,
                    "active": active
                }
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_alerts", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get alerts: {str(e)}"
        track_call("get_alerts", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_alert_details(kubecontext: str, fingerprint: str) -> Dict[str, Any]:
    """
    Gets detailed information about a specific alert.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        fingerprint: Alert fingerprint
        
    Returns:
        Dict containing detailed alert information
    """
    try:
        # First get all alerts and find the one with matching fingerprint
        result = make_alertmanager_request("GET", "/api/v2/alerts", kubecontext=kubecontext)
        
        if result["success"]:
            alerts = result["data"]
            
            # Find alert with matching fingerprint
            matching_alert = None
            for alert in alerts:
                if alert.get("fingerprint") == fingerprint:
                    matching_alert = alert
                    break
            
            if matching_alert:
                track_call("get_alert_details", kwargs=locals(), output="Alert details retrieved")
                response = {
                    "success": True,
                    "alert": matching_alert,
                    "fingerprint": fingerprint
                }
                response["output"] = json.dumps(response, indent=2)
                return response
            else:
                error_msg = f"Alert with fingerprint {fingerprint} not found"
                track_call("get_alert_details", kwargs=locals(), error=error_msg)
                return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        else:
            track_call("get_alert_details", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get alert details: {str(e)}"
        track_call("get_alert_details", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_alert_groups(kubecontext: str, active: Optional[bool] = None, silenced: Optional[bool] = None,
                    inhibited: Optional[bool] = None) -> Dict[str, Any]:
    """
    Gets alert groups with optional filtering.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        active: Include active alerts (default: true)
        silenced: Include silenced alerts
        inhibited: Include inhibited alerts
        
    Returns:
        Dict containing alert groups
    """
    try:
        params = {}
        
        if active is not None:
            params["active"] = str(active).lower()
        elif active is None:
            # Default to active alerts
            params["active"] = "true"
        
        if silenced is not None:
            params["silenced"] = str(silenced).lower()
        if inhibited is not None:
            params["inhibited"] = str(inhibited).lower()
        
        result = make_alertmanager_request("GET", "/api/v2/alerts/groups", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            alert_groups = result["data"]
            
            # Count total alerts across all groups
            total_alerts = 0
            group_count = len(alert_groups)
            
            for group in alert_groups:
                total_alerts += len(group.get("alerts", []))
            
            track_call("get_alert_groups", kwargs=locals(), 
                      output=f"Retrieved {group_count} alert groups with {total_alerts} total alerts")
            response = {
                "success": True,
                "alert_groups": alert_groups,
                "total_groups": group_count,
                "total_alerts": total_alerts,
                "filters_applied": {
                    "active": active,
                    "silenced": silenced,
                    "inhibited": inhibited
                }
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_alert_groups", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get alert groups: {str(e)}"
        track_call("get_alert_groups", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# SILENCE MANAGEMENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def create_silence(kubecontext: str, matchers_json: str, endsAt: str, createdBy: str, 
                  comment: str, startsAt: Optional[str] = None) -> Dict[str, Any]:
    """
    Creates a silence for alerts matching specified criteria.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        matchers_json: JSON string of matchers for alerts (e.g., '[{"name": "alertname", "value": "HighCPU", "isRegex": false}]')
        endsAt: Silence end time (ISO8601 format)
        createdBy: Username who created the silence
        comment: Reason or explanation for the silence
        startsAt: Silence start time (ISO8601 format, default is current time)
        
    Returns:
        Dict containing created silence information
    """
    try:
        # Parse matchers from JSON string
        try:
            matchers = json.loads(matchers_json)
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Invalid JSON in matchers: {str(e)}"}

        # Default start time to now if not provided
        if startsAt is None:
            startsAt = datetime.datetime.utcnow().isoformat() + "Z"
        
        silence_data = {
            "matchers": matchers,
            "startsAt": startsAt,
            "endsAt": endsAt,
            "createdBy": createdBy,
            "comment": comment
        }
        
        result = make_alertmanager_request("POST", "/api/v2/silences", data=silence_data, kubecontext=kubecontext)
        
        if result["success"]:
            silence_response = result["data"]
            
            track_call("create_silence", kwargs=locals(), 
                      output=f"Created silence with ID: {silence_response.get('silenceID', 'unknown')}")
            response = {
                "success": True,
                "silence": silence_response,
                "silence_id": silence_response.get("silenceID"),
                "created_by": createdBy,
                "comment": comment
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("create_silence", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to create silence: {str(e)}"
        track_call("create_silence", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_silences(kubecontext: str, filter: Optional[str] = None) -> Dict[str, Any]:
    """
    Retrieves a list of silences with optional filtering.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        filter: Filtering query (e.g., createdBy=~'.*admin.*')
        
    Returns:
        Dict containing array of silences
    """
    try:
        params = {}
        
        if filter:
            params["filter"] = filter
        
        result = make_alertmanager_request("GET", "/api/v2/silences", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            silences = result["data"]
            
            # Categorize silences by status
            silence_stats = {"active": 0, "pending": 0, "expired": 0}
            current_time = datetime.datetime.utcnow()
            
            for silence in silences:
                starts_at = datetime.datetime.fromisoformat(silence.get("startsAt", "").replace("Z", "+00:00"))
                ends_at = datetime.datetime.fromisoformat(silence.get("endsAt", "").replace("Z", "+00:00"))
                
                if current_time < starts_at:
                    silence_stats["pending"] += 1
                elif current_time > ends_at:
                    silence_stats["expired"] += 1
                else:
                    silence_stats["active"] += 1
            
            track_call("get_silences", kwargs=locals(), 
                      output=f"Retrieved {len(silences)} silences")
            response = {
                "success": True,
                "silences": silences,
                "total_count": len(silences),
                "silence_stats": silence_stats,
                "filter_applied": filter
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_silences", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get silences: {str(e)}"
        track_call("get_silences", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def delete_silence(kubecontext: str, silenceId: str) -> Dict[str, Any]:
    """
    Deletes a silence by ID.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        silenceId: ID of the silence to delete
        
    Returns:
        Dict containing deletion result
    """
    try:
        result = make_alertmanager_request("DELETE", f"/api/v2/silence/{silenceId}", kubecontext=kubecontext)
        
        if result["success"]:
            track_call("delete_silence", kwargs=locals(), 
                      output=f"Silence {silenceId} deleted successfully")
            response = {
                "success": True,
                "message": f"Silence {silenceId} deleted successfully",
                "silence_id": silenceId,
                "action": "deleted"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("delete_silence", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to delete silence: {str(e)}"
        track_call("delete_silence", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# NAVIGATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_alertmanager_navigation_url(kubecontext: str, resource_type: str, resource_id: Optional[str] = None,
                                   filter: Optional[str] = None) -> Dict[str, Any]:
    """
    Get navigation URLs for Alertmanager web UI to view specific resources.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        resource_type: Type of resource ('alerts', 'silences', 'status')
        resource_id: Specific resource ID (for individual silence)
        filter: Filter string for alerts view
        
    Returns:
        Dict containing the navigation URL
    """
    try:
        # Get cluster-specific configuration
        config = get_alertmanager_config(kubecontext)
        if not config:
            error_msg = f"No Alertmanager configuration found for kubecontext {kubecontext}"
            track_call("get_alertmanager_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        effective_url = config.get('effective_url')
        if not effective_url:
            error_msg = f"No valid Alertmanager URL configured for kubecontext {kubecontext}"
            track_call("get_alertmanager_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        base_url = effective_url.rstrip('/')
        
        url_mappings = {
            "home": "/",
            "alerts": "/#/alerts",
            "silences": "/#/silences",
            "status": "/#/status"
        }
        
        if resource_type not in url_mappings:
            error_msg = f"Invalid resource_type. Valid options: {list(url_mappings.keys())}"
            track_call("get_alertmanager_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        path = url_mappings[resource_type]
        navigation_url = f"{base_url}{path}"
        
        # Add query parameters for alerts view
        if resource_type == "alerts" and filter:
            navigation_url += f"?filter={urlencode({'': filter})[1:]}"
        
        # Add specific silence ID for silences
        if resource_type == "silences" and resource_id:
            navigation_url += f"/{resource_id}"
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "resource_type": resource_type,
            "alertmanager_base_url": base_url,
            "kubecontext": kubecontext
        }
        
        if resource_id:
            result["resource_id"] = resource_id
        if filter:
            result["filter"] = filter
        
        result["output"] = json.dumps(result, indent=2)
        track_call("get_alertmanager_navigation_url", kwargs=locals(), 
                  output=f"Generated URL for {resource_type}")
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate navigation URL: {str(e)}"
        track_call("get_alertmanager_navigation_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_alertmanager_alert_url(kubecontext: str, fingerprint: str) -> Dict[str, Any]:
    """
    Get direct navigation URL for a specific alert in Alertmanager web UI.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
        fingerprint: Alert fingerprint
        
    Returns:
        Dict containing the navigation URL for the alert
    """
    try:
        # Get cluster-specific configuration
        config = get_alertmanager_config(kubecontext)
        if not config:
            error_msg = f"No Alertmanager configuration found for kubecontext {kubecontext}"
            track_call("get_alertmanager_alert_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        effective_url = config.get('effective_url')
        if not effective_url:
            error_msg = f"No valid Alertmanager URL configured for kubecontext {kubecontext}"
            track_call("get_alertmanager_alert_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        base_url = effective_url.rstrip('/')
        # Navigate to alerts page with filter for specific fingerprint
        navigation_url = f"{base_url}/#/alerts?filter=fingerprint%3D%22{fingerprint}%22"
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "fingerprint": fingerprint,
            "alertmanager_base_url": base_url,
            "kubecontext": kubecontext
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("get_alertmanager_alert_url", kwargs=locals(), 
                  output=f"Generated URL for alert {fingerprint}")
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate alert URL: {str(e)}"
        track_call("get_alertmanager_alert_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# CONFIGURATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def set_alertmanager_config(kubecontext: str, namespace: str = "monitoring",
                           service_address: Optional[str] = None, url: Optional[str] = None,
                           api_token: Optional[str] = None, username: Optional[str] = None, 
                           password: Optional[str] = None, enabled: bool = True) -> Dict[str, Any]:
    """
    Set Alertmanager configuration for a specific kubecontext and save to cluster config.
    
    Args:
        kubecontext: Kubernetes context to configure Alertmanager for
        namespace: Kubernetes namespace where Alertmanager is running (default: monitoring)
        service_address: Internal service address (e.g., 'alertmanager-kube-prometheus-stack:9093')
        url: External Alertmanager URL (takes priority over service_address)
        api_token: Bearer token for authentication
        username: Username for basic authentication
        password: Password for basic authentication
        enabled: Whether Alertmanager is enabled for this kubecontext
        
    Returns:
        Dict containing configuration result
    """
    try:
        # Import here to avoid circular imports
        from config.config import update_cluster_config
        
        # Build the alertmanager configuration
        alertmanager_config = {
            "enabled": enabled,
            "namespace": namespace
        }
        
        # Add URL or service_address
        if url:
            # Validate URL format
            if not url.startswith(('http://', 'https://')):
                error_msg = "Alertmanager URL must start with http:// or https://"
                track_call("set_alertmanager_config", kwargs=locals(), error=error_msg)
                return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
            alertmanager_config["url"] = url
        elif service_address:
            alertmanager_config["service_address"] = service_address
        else:
            return {
                "success": False, 
                "error": "Either 'url' or 'service_address' must be provided",
                "output": json.dumps({"success": False, "error": "Either 'url' or 'service_address' must be provided"}, indent=2)
            }
        
        # Add authentication if provided
        if api_token:
            alertmanager_config["api_token"] = api_token
        elif username and password:
            alertmanager_config["username"] = username
            alertmanager_config["password"] = password
        
        # Update cluster configuration
        cluster_config = {"alertmanager": alertmanager_config}
        success = update_cluster_config(kubecontext, cluster_config)
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to save Alertmanager configuration for kubecontext {kubecontext}",
                "output": json.dumps({"success": False, "error": f"Failed to save Alertmanager configuration for kubecontext {kubecontext}"}, indent=2)
            }
        
        # Clear cache to force reload
        clear_alertmanager_config_cache()
        
        # Test the connection
        test_result = test_alertmanager_connection(kubecontext)
        
        auth_method = "none"
        if api_token:
            auth_method = "bearer_token"
        elif username and password:
            auth_method = "basic_auth"
        
        result = {
            "success": True,
            "message": f"Alertmanager configuration saved for kubecontext {kubecontext}",
            "kubecontext": kubecontext,
            "configuration": {
                "enabled": enabled,
                "namespace": namespace,
                "url": url,
                "service_address": service_address,
                "authentication_method": auth_method,
                "has_api_token": bool(api_token),
                "has_basic_auth": bool(username and password)
            },
            "connection_test": test_result.get("success", False),
            "connection_error": test_result.get("error") if not test_result.get("success") else None
        }
        
        track_call("set_alertmanager_config", kwargs={
            "kubecontext": kubecontext, 
            "namespace": namespace,
            "has_url": bool(url),
            "has_service_address": bool(service_address),
            "auth_method": auth_method
        }, output=f"Configuration saved for kubecontext {kubecontext}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to set Alertmanager configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("set_alertmanager_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_alertmanager_config_tool(kubecontext: str) -> Dict[str, Any]:
    """
    Get Alertmanager configuration for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
    
    Returns:
        Dict containing the kubecontext's Alertmanager configuration
    """
    try:
        config = get_alertmanager_config(kubecontext)
        
        if not config:
            return {
                "success": False, 
                "error": f"No Alertmanager configuration found for kubecontext {kubecontext}",
                "kubecontext": kubecontext,
                "output": json.dumps({"success": False, "error": f"No Alertmanager configuration found for kubecontext {kubecontext}"}, indent=2)
            }
        
        # Determine authentication method
        auth_method = "none"
        if config.get('api_token'):
            auth_method = "bearer_token"
        elif config.get('username') and config.get('password'):
            auth_method = "basic_auth"
        
        # Return sanitized config (without sensitive data)
        safe_config = {
            "success": True,
            "kubecontext": config['cluster_name'],
            "enabled": config['enabled'],
            "namespace": config['namespace'],
            "service_address": config['service_address'],
            "url": config['url'],
            "effective_url": config['effective_url'],
            "authentication_method": auth_method,
            "has_api_token": bool(config.get('api_token')),
            "has_basic_auth": bool(config.get('username') and config.get('password'))
        }
        
        track_call("get_alertmanager_config_tool", kwargs={"kubecontext": kubecontext}, 
                  output=f"Retrieved config for kubecontext {kubecontext}")
        safe_config["output"] = json.dumps(safe_config, indent=2)
        return safe_config
        
    except Exception as e:
        error_msg = f"Failed to get Alertmanager configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("get_alertmanager_config_tool", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "kubecontext": kubecontext, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# UTILITY FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_alertmanager_status(kubecontext: str) -> Dict[str, Any]:
    """
    Get Alertmanager status and configuration information.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
    
    Returns:
        Dict containing Alertmanager status
    """
    try:
        result = make_alertmanager_request("GET", "/api/v2/status", kubecontext=kubecontext)
        
        if result["success"]:
            status_data = result["data"]
            
            track_call("get_alertmanager_status", kwargs=locals(), output="Alertmanager status retrieved")
            response = {
                "success": True,
                "status": status_data,
                "cluster": status_data.get("cluster", {}),
                "version_info": status_data.get("versionInfo", {}),
                "config": status_data.get("config", {}),
                "uptime": status_data.get("uptime")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_alertmanager_status", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get Alertmanager status: {str(e)}"
        track_call("get_alertmanager_status", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def test_alertmanager_receivers(kubecontext: str) -> Dict[str, Any]:
    """
    Test Alertmanager receivers configuration.
    
    Args:
        kubecontext: Kubernetes context to use for Alertmanager configuration
    
    Returns:
        Dict containing receiver test results
    """
    try:
        # Get current configuration to extract receivers
        status_result = make_alertmanager_request("GET", "/api/v2/status", kubecontext=kubecontext)
        
        if status_result["success"]:
            config = status_result["data"].get("config", {})
            receivers = config.get("receivers", [])
            
            track_call("test_alertmanager_receivers", kwargs=locals(), output=f"Found {len(receivers)} receivers")
            response = {
                "success": True,
                "receivers": receivers,
                "total_receivers": len(receivers),
                "config_hash": config.get("hash", "")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("test_alertmanager_receivers", kwargs=locals(), error=status_result["error"])
            status_result["output"] = json.dumps(status_result, indent=2) if "output" not in status_result else status_result["output"]
            return status_result
            
    except Exception as e:
        error_msg = f"Failed to test Alertmanager receivers: {str(e)}"
        track_call("test_alertmanager_receivers", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def test_alertmanager_connection(kubecontext: str) -> Dict[str, Any]:
    """
    Test Alertmanager connection for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to test connection for
    
    Returns:
        Dict containing connection test results
    """
    try:
        config = get_alertmanager_config(kubecontext)
        
        if not config.get('enabled', False):
            return {
                "success": False, 
                "error": f"Alertmanager not enabled for kubecontext: {kubecontext}",
                "output": json.dumps({"success": False, "error": f"Alertmanager not enabled for kubecontext: {kubecontext}"}, indent=2)
            }
        
        if not config.get('effective_url'):
            return {
                "success": False, 
                "error": f"No valid Alertmanager URL configured for kubecontext: {kubecontext}",
                "output": json.dumps({"success": False, "error": f"No valid Alertmanager URL configured for kubecontext: {kubecontext}"}, indent=2)
            }
        
        # Test connection by getting status
        result = make_alertmanager_request("GET", "/api/v2/status", kubecontext=kubecontext)
        
        if result["success"]:
            response = {
                "success": True,
                "message": f"Successfully connected to Alertmanager for kubecontext: {kubecontext}",
                "kubecontext": kubecontext,
                "effective_url": config.get('effective_url'),
                "status_data": result["data"]
            }
            response["output"] = json.dumps(response, indent=2)
            track_call("test_alertmanager_connection", kwargs=locals(), output="Connection test successful")
            return response
        else:
            error_response = {
                "success": False,
                "error": f"Failed to connect to Alertmanager for kubecontext {kubecontext}: {result.get('error', 'Unknown error')}",
                "kubecontext": kubecontext
            }
            error_response["output"] = json.dumps(error_response, indent=2)
            track_call("test_alertmanager_connection", kwargs=locals(), error=error_response["error"])
            return error_response
            
    except Exception as e:
        error_msg = f"Failed to test Alertmanager connection: {str(e)}"
        track_call("test_alertmanager_connection", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

# Configuration tools
alertmanager_config_tools = [
    get_alertmanager_config_tool,
    set_alertmanager_config,
    test_alertmanager_connection
]

# Read-only operations - allowed in recon mode
alertmanager_read_tools = [
    get_alerts,
    get_alert_details,
    get_alert_groups,
    get_silences,
    get_alertmanager_navigation_url,
    get_alertmanager_alert_url,
    get_alertmanager_status
] + alertmanager_config_tools

# Action/modification operations - only allowed when recon mode is off
alertmanager_action_tools = [
    create_silence,
    delete_silence,
    test_alertmanager_receivers
]

# Combined tools based on recon mode
def get_alertmanager_tools():
    from config.config import get_recon_mode
    if get_recon_mode():
        return alertmanager_read_tools
    else:
        return alertmanager_read_tools + alertmanager_action_tools

# For backward compatibility
alertmanager_tools = get_alertmanager_tools()