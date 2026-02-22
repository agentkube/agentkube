#-------------------------------------------------------------------------------------#
# SignOz Tools - Alert rules and dashboard operations for SignOz.
# Only includes documented APIs: alert rules and dashboards with command tracking.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, List, Any, Union
import datetime
from urllib.parse import urlencode
import time
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

# Global configuration cache
_signoz_config_cache = {}

tool_call_history = []

def get_signoz_config(cluster_name: str) -> Dict[str, Any]:
    """Get SignOz configuration for a specific cluster from cluster config"""
    if cluster_name in _signoz_config_cache:
        return _signoz_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        signoz_config = cluster_config.get('signoz', {})
        
        if not signoz_config:
            logger.warning(f"No SignOz configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': signoz_config.get('enabled', False),
            'url': signoz_config.get('url', ''),  # Direct URL to SignOz
            'api_token': signoz_config.get('api_token', ''),  # API token
        }
        
        # SignOz requires direct URL access
        if not config['url']:
            logger.error(f"No SignOz URL configured for cluster {cluster_name}")
            return {}
        
        if not config['api_token']:
            logger.error(f"No SignOz API token configured for cluster {cluster_name}")
            return {}
        
        # Cache the configuration
        _signoz_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load SignOz config for cluster {cluster_name}: {e}")
        return {}

def clear_signoz_config_cache():
    """Clear the configuration cache to force reload"""
    global _signoz_config_cache
    _signoz_config_cache = {}

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

def get_signoz_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for SignOz API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add SignOz API key if configured
    if config.get('api_token'):
        headers["SIGNOZ-API-KEY"] = config['api_token']
    
    return headers

def make_signoz_request(method: str, endpoint: str, params: Optional[Dict] = None, 
                       data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to SignOz API using kubecontext-specific configuration"""
    
    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()
    
    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}
    
    # Get kubecontext-specific SignOz configuration
    config = get_signoz_config(kubecontext)
    if not config:
        return {"success": False, "error": f"No SignOz configuration found for kubecontext {kubecontext}"}
    
    if not config.get('enabled', False):
        return {"success": False, "error": f"SignOz is not enabled for kubecontext {kubecontext}"}
    
    signoz_url = config.get('url')
    if not signoz_url:
        return {"success": False, "error": f"No valid SignOz URL configured for kubecontext {kubecontext}"}
    
    if not config.get('api_token'):
        return {"success": False, "error": f"No SignOz API token configured for kubecontext {kubecontext}"}
    
    url = f"{signoz_url.rstrip('/')}{endpoint}"
    headers = get_signoz_headers(config)
    
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

def format_timestamp(timestamp: Union[str, int, float, None]) -> Optional[int]:
    """Format timestamp for SignOz API (expects milliseconds)"""
    if timestamp is None:
        return None
    
    if isinstance(timestamp, str):
        try:
            # Try parsing ISO format
            dt = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            return int(dt.timestamp() * 1000)
        except:
            return int(timestamp)
    elif isinstance(timestamp, (int, float)):
        # Convert seconds to milliseconds if needed
        if timestamp < 1e12:  # Likely seconds
            return int(timestamp * 1000)
        else:  # Already milliseconds
            return int(timestamp)
    
    return int(timestamp)

#-------------------------------------------------------------------------------------#
# ALERTS TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_alert_rules(kubecontext: str) -> Dict[str, Any]:
    """
    List all alert rules in SignOz.
    
    Args:
        kubecontext: Kubernetes context to use for SignOz configuration
        
    Returns:
        Dict containing list of alert rules
    """
    try:
        result = make_signoz_request("GET", "/api/v1/rules", kubecontext=kubecontext)
        
        if result["success"]:
            rules_data = result["data"]
            rules = rules_data if isinstance(rules_data, list) else []
            
            track_call("list_alert_rules", kwargs=locals(), output=f"Retrieved {len(rules)} alert rules")
            response = {
                "success": True,
                "alert_rules": rules,
                "total_count": len(rules)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_alert_rules", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list alert rules: {str(e)}"
        track_call("list_alert_rules", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_alert_rule(kubecontext: str, rule_id: str) -> Dict[str, Any]:
    """
    Get a specific alert rule by ID.
    
    Args:
        kubecontext: Kubernetes context to use for SignOz configuration
        rule_id: Alert rule ID
        
    Returns:
        Dict containing alert rule details
    """
    try:
        result = make_signoz_request("GET", f"/api/v1/rules/{rule_id}", kubecontext=kubecontext)
        
        if result["success"]:
            rule_data = result["data"]
            
            track_call("get_alert_rule", kwargs=locals(), output="Alert rule retrieved")
            response = {
                "success": True,
                "alert_rule": rule_data,
                "rule_id": rule_id
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_alert_rule", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get alert rule: {str(e)}"
        track_call("get_alert_rule", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# DASHBOARDS TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_dashboards(kubecontext: str) -> Dict[str, Any]:
    """
    List all dashboards in SignOz.
    
    Args:
        kubecontext: Kubernetes context to use for SignOz configuration
    
    Returns:
        Dict containing list of dashboards
    """
    try:
        result = make_signoz_request("GET", "/api/v1/dashboards", kubecontext=kubecontext)
        
        if result["success"]:
            dashboards_data = result["data"]
            dashboards = dashboards_data if isinstance(dashboards_data, list) else []
            
            track_call("list_dashboards", kwargs=locals(), output=f"Retrieved {len(dashboards)} dashboards")
            response = {
                "success": True,
                "dashboards": dashboards,
                "total_count": len(dashboards)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_dashboards", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list dashboards: {str(e)}"
        track_call("list_dashboards", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_dashboard(kubecontext: str, dashboard_uuid: str) -> Dict[str, Any]:
    """
    Get a specific dashboard by UUID.
    
    Args:
        kubecontext: Kubernetes context to use for SignOz configuration
        dashboard_uuid: Dashboard UUID
        
    Returns:
        Dict containing dashboard details
    """
    try:
        result = make_signoz_request("GET", f"/api/v1/dashboards/{dashboard_uuid}", kubecontext=kubecontext)
        
        if result["success"]:
            dashboard_data = result["data"]
            
            track_call("get_dashboard", kwargs=locals(), output="Dashboard retrieved")
            response = {
                "success": True,
                "dashboard": dashboard_data,
                "dashboard_uuid": dashboard_uuid
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
# NAVIGATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_signoz_navigation_url(kubecontext: str, resource_type: str, resource_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get navigation URLs for SignOz web UI to view specific resources.
    
    Args:
        kubecontext: Kubernetes context to use for SignOz configuration
        resource_type: Type of resource ('alerts', 'dashboards')
        resource_id: Specific resource ID
        
    Returns:
        Dict containing the navigation URL
    """
    try:
        config = get_signoz_config(kubecontext)
        if not config or not config.get('url'):
            error_msg = f"No SignOz URL configured for kubecontext {kubecontext}"
            track_call("get_signoz_navigation_url", kwargs=locals(), error=error_msg)
            response = {"success": False, "error": error_msg}
            response["output"] = json.dumps(response, indent=2)
            return response
        
        base_url = config['url'].rstrip('/')
        
        url_mappings = {
            "alerts": "/alerts",
            "dashboards": "/dashboard"
        }
        
        if resource_type not in url_mappings:
            error_msg = f"Invalid resource_type. Valid options: {list(url_mappings.keys())}"
            track_call("get_signoz_navigation_url", kwargs=locals(), error=error_msg)
            response = {"success": False, "error": error_msg}
            response["output"] = json.dumps(response, indent=2)
            return response
        
        path = url_mappings[resource_type]
        navigation_url = f"{base_url}{path}"
        
        # Add specific resource paths
        if resource_id:
            navigation_url += f"/{resource_id}"
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "resource_type": resource_type,
            "signoz_base_url": base_url
        }
        
        if resource_id:
            result["resource_id"] = resource_id
        
        track_call("get_signoz_navigation_url", kwargs=locals(), 
                  output=f"Generated URL for {resource_type}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate navigation URL: {str(e)}"
        track_call("get_signoz_navigation_url", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

#-------------------------------------------------------------------------------------#
# CONFIGURATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_signoz_config_tool(kubecontext: str) -> Dict[str, Any]:
    """
    Get SignOz configuration for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
    
    Returns:
        Dict containing the kubecontext's SignOz configuration
    """
    try:
        config = get_signoz_config(kubecontext)
        
        if not config:
            response = {
                "success": False, 
                "error": f"No SignOz configuration found for kubecontext {kubecontext}",
                "kubecontext": kubecontext
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        
        # Return sanitized config (without sensitive data)
        safe_config = {
            "success": True,
            "kubecontext": config['cluster_name'],
            "enabled": config['enabled'],
            "url": config['url'],
            "has_api_token": bool(config.get('api_token'))
        }
        
        track_call("get_signoz_config_tool", kwargs={"kubecontext": kubecontext}, 
                  output=f"Retrieved config for kubecontext {kubecontext}")
        safe_config["output"] = json.dumps(safe_config, indent=2)
        return safe_config
        
    except Exception as e:
        error_msg = f"Failed to get SignOz configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("get_signoz_config_tool", kwargs={"kubecontext": kubecontext}, error=error_msg)
        response = {"success": False, "error": error_msg, "kubecontext": kubecontext}
        response["output"] = json.dumps(response, indent=2)
        return response

# Collection of SignOz tools (only documented APIs)
signoz_tools = [
    # Alert tools
    list_alert_rules,
    get_alert_rule,
    
    # Dashboard tools  
    list_dashboards,
    get_dashboard,
    
    # Navigation tools
    get_signoz_navigation_url,
    
    # Configuration tools
    get_signoz_config_tool
]