#-------------------------------------------------------------------------------------#
# Grafana Tools - Core Grafana operations for admin, dashboards, and datasources management.
# Includes admin, dashboards, datasources, incidents, OnCall, Sift, Pyroscope, and Asserts with command tracking.
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
_grafana_config_cache = {}

def get_grafana_config(cluster_name: str) -> Dict[str, Any]:
    """Get Grafana configuration for a specific cluster from cluster config"""
    if cluster_name in _grafana_config_cache:
        return _grafana_config_cache[cluster_name]
    
    try:
        cluster_config = get_cluster_config(cluster_name)
        grafana_config = cluster_config.get('grafana', {})
        
        if not grafana_config:
            logger.warning(f"No Grafana configuration found for cluster {cluster_name}")
            return {}
            
        # Build the configuration object
        config = {
            'cluster_name': cluster_name,
            'enabled': grafana_config.get('enabled', False),
            'url': grafana_config.get('url', ''),  # Direct URL to Grafana
            'api_token': grafana_config.get('api_token', ''),  # Service account token
        }
        
        # Grafana requires direct URL access (no proxy)
        if not config['url']:
            logger.error(f"No Grafana URL configured for cluster {cluster_name}")
            return {}
        
        if not config['api_token']:
            logger.error(f"No Grafana API token configured for cluster {cluster_name}")
            return {}
        
        # Cache the configuration
        _grafana_config_cache[cluster_name] = config
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to load Grafana config for cluster {cluster_name}: {e}")
        return {}

def clear_grafana_config_cache():
    """Clear the configuration cache to force reload"""
    global _grafana_config_cache
    _grafana_config_cache = {}

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

def get_grafana_headers(config: Dict[str, Any]) -> Dict[str, str]:
    """Get headers for Grafana API requests based on cluster config"""
    headers = {"Content-Type": "application/json"}
    
    # Add Bearer token if configured
    if config.get('api_token'):
        headers["Authorization"] = f"Bearer {config['api_token']}"
    
    return headers

def make_grafana_request(method: str, endpoint: str, params: Optional[Dict] = None, 
                        data: Optional[Dict] = None, kubecontext: Optional[str] = None) -> Dict[str, Any]:
    """Make a request to Grafana API using kubecontext-specific configuration"""
    
    # Get kubecontext - from parameter or current context
    if not kubecontext:
        kubecontext = get_current_kubecontext()
    
    if not kubecontext:
        return {"success": False, "error": "No kubecontext provided. Use kubecontext parameter or set CURRENT_CLUSTER_NAME environment variable"}
    
    # Get kubecontext-specific Grafana configuration
    config = get_grafana_config(kubecontext)
    if not config:
        return {"success": False, "error": f"No Grafana configuration found for kubecontext {kubecontext}"}
    
    if not config.get('enabled', False):
        return {"success": False, "error": f"Grafana is not enabled for kubecontext {kubecontext}"}
    
    grafana_url = config.get('url')
    if not grafana_url:
        return {"success": False, "error": f"No valid Grafana URL configured for kubecontext {kubecontext}"}
    
    if not config.get('api_token'):
        return {"success": False, "error": f"No Grafana API token configured for kubecontext {kubecontext}"}
    
    url = f"{grafana_url.rstrip('/')}{endpoint}"
    headers = get_grafana_headers(config)
    
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
# ADMIN TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_teams(kubecontext: str) -> Dict[str, Any]:
    """
    List all teams in Grafana.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
    
    Returns:
        Dict containing array of teams
    """
    try:
        result = make_grafana_request("GET", "/api/teams", kubecontext=kubecontext)
        
        if result["success"]:
            teams = result["data"]
            
            track_call("list_teams", kwargs=locals(), output=f"Retrieved {len(teams)} teams")
            response = {
                "success": True,
                "teams": teams,
                "total_count": len(teams)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_teams", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list teams: {str(e)}"
        track_call("list_teams", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def list_users_by_org(kubecontext: str) -> Dict[str, Any]:
    """
    List all users in the organization.
    
    Returns:
        Dict containing array of users
    """
    try:
        result = make_grafana_request("GET", "/api/org/users", kubecontext=kubecontext)
        
        if result["success"]:
            users = result["data"]
            
            track_call("list_users_by_org", output=f"Retrieved {len(users)} users")
            
            response = {
                "success": True,
                "users": users,
                "total_count": len(users)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_users_by_org", error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list users: {str(e)}"
        track_call("list_users_by_org", error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# DASHBOARD TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def search_dashboards(kubecontext: str, query: Optional[str] = None, tags: Optional[List[str]] = None,
                     folder_ids: Optional[List[int]] = None, starred: Optional[bool] = None) -> Dict[str, Any]:
    """
    Search for dashboards in Grafana.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        query: Search query string
        tags: List of tags to filter by
        folder_ids: List of folder IDs to search in
        starred: Whether to filter starred dashboards
        
    Returns:
        Dict containing array of matching dashboards
    """
    try:
        params = {}
        
        if query:
            params["query"] = query
        if tags:
            params["tag"] = tags
        if folder_ids:
            params["folderIds"] = folder_ids
        if starred is not None:
            params["starred"] = starred
        
        result = make_grafana_request("GET", "/api/search", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            dashboards = result["data"]
            
            track_call("search_dashboards", kwargs=locals(), 
                      output=f"Found {len(dashboards)} dashboards")
            response = {
                "success": True,
                "dashboards": dashboards,
                "total_count": len(dashboards),
                "filters_applied": {
                    "query": query,
                    "tags": tags,
                    "folder_ids": folder_ids,
                    "starred": starred
                }
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("search_dashboards", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to search dashboards: {str(e)}"
        track_call("search_dashboards", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_dashboard_by_uid(uid: str, kubecontext: str) -> Dict[str, Any]:
    """
    Get a dashboard by UID.
    
    Args:
        uid: Dashboard UID
        kubecontext: Kubernetes context to use for Grafana configuration
        
    Returns:
        Dict containing dashboard details
    """
    try:
        result = make_grafana_request("GET", f"/api/dashboards/uid/{uid}", kubecontext=kubecontext)
        
        if result["success"]:
            dashboard_data = result["data"]
            
            track_call("get_dashboard_by_uid", kwargs=locals(), output="Dashboard retrieved")
            response = {
                "success": True,
                "dashboard": dashboard_data.get("dashboard", {}),
                "meta": dashboard_data.get("meta", {}),
                "uid": uid
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_dashboard_by_uid", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get dashboard: {str(e)}"
        track_call("get_dashboard_by_uid", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def update_dashboard(kubecontext: str, dashboard_json: str, folder_uid: Optional[str] = None,
                    overwrite: Optional[bool] = None, message: Optional[str] = None) -> Dict[str, Any]:
    """
    Update or create a new dashboard.
    
    Args:
    
        dashboard_json: Dashboard JSON object as string
        folder_uid: Folder UID where to save the dashboard
        overwrite: Whether to overwrite existing dashboard
        message: Commit message for the change
        
    Returns:
        Dict containing operation result
    """
    try:
        try:
            dashboard = json.loads(dashboard_json)
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Invalid JSON in dashboard_json: {str(e)}"}
            
        data = {"dashboard": dashboard}
        
        if folder_uid:
            data["folderUid"] = folder_uid
        if overwrite is not None:
            data["overwrite"] = overwrite
        if message:
            data["message"] = message
        
        result = make_grafana_request("POST", "/api/dashboards/db", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            response_data = result["data"]
            
            track_call("update_dashboard", kwargs=locals(), 
                      output=f"Dashboard {response_data.get('status', 'updated')}")
            response = {
                "success": True,
                "result": response_data,
                "dashboard_uid": response_data.get("uid"),
                "dashboard_id": response_data.get("id"),
                "status": response_data.get("status")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("update_dashboard", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to update dashboard: {str(e)}"
        track_call("update_dashboard", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_dashboard_panel_queries(kubecontext: str, uid: str) -> Dict[str, Any]:
    """
    Get panel title, queries, datasource UID and type from a dashboard.
    
    Args:
        uid: Dashboard UID
        
    Returns:
        Dict containing panel queries information
    """
    try:
        result = make_grafana_request("GET", f"/api/dashboards/uid/{uid}", kubecontext=kubecontext)
        
        if result["success"]:
            dashboard_data = result["data"]
            dashboard = dashboard_data.get("dashboard", {})
            panels = dashboard.get("panels", [])
            
            panel_queries = []
            
            def extract_queries_from_panel(panel, parent_title=""):
                panel_info = {
                    "id": panel.get("id"),
                    "title": panel.get("title", ""),
                    "type": panel.get("type", ""),
                    "queries": [],
                    "datasource": panel.get("datasource")
                }
                
                # Extract targets (queries)
                targets = panel.get("targets", [])
                for target in targets:
                    query_info = {
                        "expr": target.get("expr", ""),
                        "query": target.get("query", ""),
                        "datasource": target.get("datasource"),
                        "refId": target.get("refId", "")
                    }
                    panel_info["queries"].append(query_info)
                
                return panel_info
            
            # Process all panels including nested panels in rows
            for panel in panels:
                if panel.get("type") == "row" and "panels" in panel:
                    # Handle row panels with nested panels
                    for nested_panel in panel.get("panels", []):
                        panel_queries.append(extract_queries_from_panel(nested_panel, panel.get("title", "")))
                else:
                    panel_queries.append(extract_queries_from_panel(panel))
            
            track_call("get_dashboard_panel_queries", kwargs=locals(), 
                      output=f"Extracted queries from {len(panel_queries)} panels")
            response = {
                "success": True,
                "dashboard_uid": uid,
                "dashboard_title": dashboard.get("title", ""),
                "panel_queries": panel_queries,
                "total_panels": len(panel_queries)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_dashboard_panel_queries", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get dashboard panel queries: {str(e)}"
        track_call("get_dashboard_panel_queries", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# DATASOURCE TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_datasources(kubecontext: str) -> Dict[str, Any]:
    """
    List all datasources in Grafana.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
    
    Returns:
        Dict containing array of datasources
    """
    try:
        result = make_grafana_request("GET", "/api/datasources", kubecontext=kubecontext)
        
        if result["success"]:
            datasources = result["data"]
            
            track_call("list_datasources", kwargs=locals(), output=f"Retrieved {len(datasources)} datasources")
            response = {
                "success": True,
                "datasources": datasources,
                "total_count": len(datasources)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_datasources", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list datasources: {str(e)}"
        track_call("list_datasources", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_datasource_by_uid(kubecontext: str, uid: str) -> Dict[str, Any]:
    """
    Get a datasource by UID.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        uid: Datasource UID
        
    Returns:
        Dict containing datasource details
    """
    try:
        result = make_grafana_request("GET", f"/api/datasources/uid/{uid}", kubecontext=kubecontext)
        
        if result["success"]:
            datasource = result["data"]
            
            print(datasource)
            
            track_call("get_datasource_by_uid", kwargs=locals(), output="Datasource retrieved")
            response = {
                "success": True,
                "datasource": datasource,
                "uid": uid
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_datasource_by_uid", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get datasource: {str(e)}"
        track_call("get_datasource_by_uid", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}


#-------------------------------------------------------------------------------------#
# INCIDENT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_incidents(kubecontext: str) -> Dict[str, Any]:
    """
    List incidents in Grafana Incident.
    args:
        kubecontext: Kubernetes context to use for Grafana configuration
    Returns:
        Dict containing array of incidents
    """
    try:
        result = make_grafana_request("GET", "/api/plugins/grafana-incident-app/resources/api/v1/incidents", kubecontext=kubecontext)
        
        if result["success"]:
            incidents = result["data"]
            
            track_call("list_incidents", output=f"Retrieved {len(incidents)} incidents")
            response =  {
                "success": True,
                "incidents": incidents,
                "total_count": len(incidents)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_incidents", error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list incidents: {str(e)}"
        track_call("list_incidents", error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def create_incident(kubecontext: str, title: str, description: Optional[str] = None, 
                   severity: Optional[str] = None) -> Dict[str, Any]:
    """
    Create an incident in Grafana Incident.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        title: Incident title
        description: Incident description
        severity: Incident severity
        
    Returns:
        Dict containing created incident details
    """
    try:
        data = {"title": title}
        
        if description:
            data["description"] = description
        if severity:
            data["severity"] = severity
        
        result = make_grafana_request("POST", "/api/plugins/grafana-incident-app/resources/api/v1/incidents", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            incident = result["data"]
            
            track_call("create_incident", kwargs=locals(), 
                      output=f"Created incident: {incident.get('incidentID', 'unknown')}")
            response = {
                "success": True,
                "incident": incident,
                "incident_id": incident.get("incidentID"),
                "title": title
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("create_incident", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to create incident: {str(e)}"
        track_call("create_incident", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def add_activity_to_incident(kubecontext: str, incident_id: str, activity_type: str, 
                           body: str) -> Dict[str, Any]:
    """
    Add an activity item to an incident in Grafana Incident.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        incident_id: Incident ID
        activity_type: Type of activity
        body: Activity content
        
    Returns:
        Dict containing operation result
    """
    try:
        data = {
            "activityType": activity_type,
            "body": body
        }
        
        result = make_grafana_request("POST", 
                                    f"/api/plugins/grafana-incident-app/resources/api/v1/incidents/{incident_id}/activities", 
                                    data=data, kubecontext=kubecontext)
        
        if result["success"]:
            activity = result["data"]
            
            track_call("add_activity_to_incident", kwargs=locals(), 
                      output="Activity added to incident")
            response = {
                "success": True,
                "activity": activity,
                "incident_id": incident_id,
                "activity_type": activity_type
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("add_activity_to_incident", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to add activity to incident: {str(e)}"
        track_call("add_activity_to_incident", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_incident(kubecontext: str, incident_id: str) -> Dict[str, Any]:
    """
    Get a single incident by ID.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        incident_id: Incident ID
        
    Returns:
        Dict containing incident details
    """
    try:
        result = make_grafana_request("GET", f"/api/plugins/grafana-incident-app/resources/api/v1/incidents/{incident_id}", kubecontext=kubecontext)
        
        if result["success"]:
            incident = result["data"]
            
            track_call("get_incident", kwargs=locals(), output="Incident retrieved") 
            response = {
                "success": True,
                "incident": incident,
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
# ONCALL TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_oncall_schedules(kubecontext: str) -> Dict[str, Any]:
    """
    List schedules from Grafana OnCall.
    args:
        kubecontext: Kubernetes context to use for Grafana configuration
    Returns:
        Dict containing array of OnCall schedules
    """
    try:
        result = make_grafana_request("GET", "/api/plugins/grafana-oncall-app/resources/api/v1/schedules", kubecontext=kubecontext)
        
        if result["success"]:
            schedules = result["data"]
            
            track_call("list_oncall_schedules", output=f"Retrieved {len(schedules)} OnCall schedules") 
            response = {
                "success": True,
                "schedules": schedules,
                "total_count": len(schedules)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_oncall_schedules", error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list OnCall schedules: {str(e)}"
        track_call("list_oncall_schedules", error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_oncall_shift(kubecontext: str, schedule_id: str, shift_id: str) -> Dict[str, Any]:
    """
    Get details for a specific OnCall shift.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        schedule_id: Schedule ID
        shift_id: Shift ID
        
    Returns:
        Dict containing shift details
    """
    try:
        result = make_grafana_request("GET", 
                                    f"/api/plugins/grafana-oncall-app/resources/api/v1/schedules/{schedule_id}/shifts/{shift_id}", kubecontext=kubecontext)
        
        if result["success"]:
            shift = result["data"]
            
            track_call("get_oncall_shift", kwargs=locals(), output="OnCall shift retrieved") 
            response = {
                "success": True,
                "shift": shift,
                "schedule_id": schedule_id,
                "shift_id": shift_id
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_oncall_shift", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get OnCall shift: {str(e)}"
        track_call("get_oncall_shift", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_current_oncall_users(kubecontext: str, schedule_id: str) -> Dict[str, Any]:
    """
    Get users currently on-call for a specific schedule.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        schedule_id: Schedule ID
        
    Returns:
        Dict containing current on-call users
    """
    try:
        result = make_grafana_request("GET", 
                                    f"/api/plugins/grafana-oncall-app/resources/api/v1/schedules/{schedule_id}/oncall", kubecontext=kubecontext)
        
        if result["success"]:
            oncall_data = result["data"]
            
            track_call("get_current_oncall_users", kwargs=locals(), 
                      output="Current on-call users retrieved") 
            response = {
                "success": True,
                "oncall_users": oncall_data,
                "schedule_id": schedule_id
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_current_oncall_users", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get current on-call users: {str(e)}"
        track_call("get_current_oncall_users", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def list_oncall_teams(kubecontext: str) -> Dict[str, Any]:
    """
    List teams from Grafana OnCall.
    args:
        kubecontext: Kubernetes context to use for Grafana configuration
    Returns:
        Dict containing array of OnCall teams
    """
    try:
        result = make_grafana_request("GET", "/api/plugins/grafana-oncall-app/resources/api/v1/teams", kubecontext=kubecontext)
        
        if result["success"]:
            teams = result["data"]
            
            track_call("list_oncall_teams", output=f"Retrieved {len(teams)} OnCall teams")
            response =  {
                "success": True,
                "teams": teams,
                "total_count": len(teams)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_oncall_teams", error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list OnCall teams: {str(e)}"
        track_call("list_oncall_teams", error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def list_oncall_users(kubecontext: str) -> Dict[str, Any]:
    """
    List users from Grafana OnCall.
    args:
        kubecontext: Kubernetes context to use for Grafana configuration
    Returns:
        Dict containing array of OnCall users
    """
    try:
        result = make_grafana_request("GET", "/api/plugins/grafana-oncall-app/resources/api/v1/users", kubecontext=kubecontext)
        
        if result["success"]:
            users = result["data"]
            
            track_call("list_oncall_users", output=f"Retrieved {len(users)} OnCall users")
            response = {
                "success": True,
                "users": users,
                "total_count": len(users)
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_oncall_users", error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list OnCall users: {str(e)}"
        track_call("list_oncall_users", error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# SIFT TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_sift_investigation(kubecontext: str, uuid: str) -> Dict[str, Any]:
    """
    Retrieve an existing Sift investigation by its UUID.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        uuid: Investigation UUID
        
    Returns:
        Dict containing investigation details
    """
    try:
        result = make_grafana_request("GET", f"/api/plugins/grafana-sift-app/resources/api/v1/investigations/{uuid}", kubecontext=kubecontext)
        
        if result["success"]:
            investigation = result["data"]
            
            track_call("get_sift_investigation", kwargs=locals(), output="Sift investigation retrieved") 
            response = {
                "success": True,
                "investigation": investigation,
                "uuid": uuid
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_sift_investigation", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get Sift investigation: {str(e)}"
        track_call("get_sift_investigation", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_sift_analysis(kubecontext: str, investigation_uuid: str, analysis_id: str) -> Dict[str, Any]:
    """
    Retrieve a specific analysis from a Sift investigation.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        investigation_uuid: Investigation UUID
        analysis_id: Analysis ID
        
    Returns:
        Dict containing analysis details
    """
    try:
        result = make_grafana_request("GET", 
                                    f"/api/plugins/grafana-sift-app/resources/api/v1/investigations/{investigation_uuid}/analysis/{analysis_id}", kubecontext=kubecontext)
        
        if result["success"]:
            analysis = result["data"]
            
            track_call("get_sift_analysis", kwargs=locals(), output="Sift analysis retrieved")
            response =  {
                "success": True,
                "analysis": analysis,
                "investigation_uuid": investigation_uuid,
                "analysis_id": analysis_id
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_sift_analysis", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get Sift analysis: {str(e)}"
        track_call("get_sift_analysis", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def list_sift_investigations(kubecontext: str, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Retrieve a list of Sift investigations with an optional limit.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        limit: Maximum number of investigations to return
        
    Returns:
        Dict containing array of investigations
    """
    try:
        params = {}
        
        if limit is not None:
            params["limit"] = limit
        
        result = make_grafana_request("GET", "/api/plugins/grafana-sift-app/resources/api/v1/investigations", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            investigations = result["data"]
            
            track_call("list_sift_investigations", kwargs=locals(), 
                      output=f"Retrieved {len(investigations)} Sift investigations")
            response =  {
                "success": True,
                "investigations": investigations,
                "total_count": len(investigations),
                "limit": limit
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_sift_investigations", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to list Sift investigations: {str(e)}"
        track_call("list_sift_investigations", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def find_error_pattern_logs(kubecontext: str, datasource_uid: str, query: str, start: int, end: int) -> Dict[str, Any]:
    """
    Finds elevated error patterns in Loki logs.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        datasource_uid: Loki datasource UID
        query: LogQL query string
        start: Start time (Unix timestamp)
        end: End time (Unix timestamp)
        
    Returns:
        Dict containing error patterns found
    """
    try:
        data = {
            "datasourceUid": datasource_uid,
            "query": query,
            "start": start,
            "end": end
        }
        
        result = make_grafana_request("POST", "/api/plugins/grafana-sift-app/resources/api/v1/error-patterns", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            patterns = result["data"]
            
            track_call("find_error_pattern_logs", kwargs=locals(), 
                      output=f"Found {len(patterns.get('patterns', []))} error patterns") 
            response =  {
                "success": True,
                "error_patterns": patterns,
                "datasource_uid": datasource_uid,
                "query": query
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("find_error_pattern_logs", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to find error patterns: {str(e)}"
        track_call("find_error_pattern_logs", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def find_slow_requests(kubecontext: str, datasource_uid: str, service: str, start: int, end: int) -> Dict[str, Any]:
    """
    Finds slow requests from the relevant tempo datasources.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        datasource_uid: Tempo datasource UID
        service: Service name to analyze
        start: Start time (Unix timestamp)
        end: End time (Unix timestamp)
        
    Returns:
        Dict containing slow requests found
    """
    try:
        data = {
            "datasourceUid": datasource_uid,
            "service": service,
            "start": start,
            "end": end
        }
        
        result = make_grafana_request("POST", "/api/plugins/grafana-sift-app/resources/api/v1/slow-requests", data=data, kubecontext=kubecontext)
        
        if result["success"]:
            slow_requests = result["data"]
            
            track_call("find_slow_requests", kwargs=locals(), 
                      output=f"Found {len(slow_requests.get('requests', []))} slow requests") 
            response =  {
                "success": True,
                "slow_requests": slow_requests,
                "datasource_uid": datasource_uid,
                "service": service
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("find_slow_requests", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to find slow requests: {str(e)}"
        track_call("find_slow_requests", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# PYROSCOPE TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def list_pyroscope_label_names(kubecontext: str, datasource_uid: str, match: Optional[str] = None) -> Dict[str, Any]:
    """
    List label names matching a selector from Pyroscope datasource.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        kubecontext: Kubernetes context to use for Grafana configuration
        datasource_uid: Pyroscope datasource UID
        match: Label selector to match
        
    Returns:
        Dict containing label names
    """
    try:
        endpoint = f"/api/datasources/proxy/uid/{datasource_uid}/api/v1/labels"
        params = {}
        
        if match:
            params["match"] = match
        
        result = make_grafana_request("GET", endpoint, params=params, kubecontext=kubecontext)
        
        if result["success"]:
            labels_data = result["data"]
            label_names = labels_data if isinstance(labels_data, list) else []
            
            track_call("list_pyroscope_label_names", kwargs=locals(), 
                      output=f"Retrieved {len(label_names)} label names") 
            response =  {
                "success": True,
                "label_names": label_names,
                "total_count": len(label_names),
                "datasource_uid": datasource_uid,
                "match": match
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_pyroscope_label_names", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get Pyroscope label names: {str(e)}"
        track_call("list_pyroscope_label_names", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def list_pyroscope_label_values(kubecontext: str, datasource_uid: str, label: str, match: Optional[str] = None) -> Dict[str, Any]:
    """
    List label values matching a selector for a label name from Pyroscope datasource.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        datasource_uid: Pyroscope datasource UID
        label: Label name
        match: Label selector to match
        
    Returns:
        Dict containing label values
    """
    try:
        endpoint = f"/api/datasources/proxy/uid/{datasource_uid}/api/v1/label/{label}/values"
        params = {}
        
        if match:
            params["match"] = match
        
        result = make_grafana_request("GET", endpoint, params=params, kubecontext=kubecontext)
        
        if result["success"]:
            values_data = result["data"]
            label_values = values_data if isinstance(values_data, list) else []
            
            track_call("list_pyroscope_label_values", kwargs=locals(), 
                      output=f"Retrieved {len(label_values)} label values") 
            response = {
                "success": True,
                "label_values": label_values,
                "total_count": len(label_values),
                "datasource_uid": datasource_uid,
                "label": label,
                "match": match
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_pyroscope_label_values", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get Pyroscope label values: {str(e)}"
        track_call("list_pyroscope_label_values", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def list_pyroscope_profile_types(kubecontext: str, datasource_uid: str) -> Dict[str, Any]:
    """
    List available profile types from Pyroscope datasource.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        datasource_uid: Pyroscope datasource UID
        
    Returns:
        Dict containing profile types
    """
    try:
        endpoint = f"/api/datasources/proxy/uid/{datasource_uid}/api/v1/profile-types"
        
        result = make_grafana_request("GET", endpoint, kubecontext=kubecontext)
        
        if result["success"]:
            profile_types = result["data"]
            
            track_call("list_pyroscope_profile_types", kwargs=locals(), 
                      output=f"Retrieved {len(profile_types)} profile types") 
            response = {
                "success": True,
                "profile_types": profile_types,
                "total_count": len(profile_types),
                "datasource_uid": datasource_uid
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_pyroscope_profile_types", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get Pyroscope profile types: {str(e)}"
        track_call("list_pyroscope_profile_types", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def fetch_pyroscope_profile(kubecontext: str, datasource_uid: str, query: str, start: int, end: int) -> Dict[str, Any]:
    """
    Fetches a profile in DOT format for analysis from Pyroscope datasource.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        datasource_uid: Pyroscope datasource UID
        query: Profile query selector
        start: Start time (Unix timestamp)
        end: End time (Unix timestamp)
        
    Returns:
        Dict containing profile data in DOT format
    """
    try:
        endpoint = f"/api/datasources/proxy/uid/{datasource_uid}/api/v1/render"
        params = {
            "query": query,
            "from": start,
            "until": end,
            "format": "dot"
        }
        
        result = make_grafana_request("GET", endpoint, params=params, kubecontext=kubecontext)
        
        if result["success"]:
            profile_data = result["data"]
            
            track_call("fetch_pyroscope_profile", kwargs=locals(), output="Pyroscope profile fetched") 
            response = {
                "success": True,
                "profile": profile_data,
                "query": query,
                "datasource_uid": datasource_uid,
                "time_range": {"start": start, "end": end}
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("fetch_pyroscope_profile", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to fetch Pyroscope profile: {str(e)}"
        track_call("fetch_pyroscope_profile", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# ASSERTS TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def get_assertions(kubecontext: str, entity: str) -> Dict[str, Any]:
    """
    Get assertion summary for a given entity.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        entity: Entity identifier
        
    Returns:
        Dict containing assertion summary
    """
    try:
        params = {"entity": entity}
        
        result = make_grafana_request("GET", "/api/plugins/asserts-app/resources/api/v1/assertions", params=params, kubecontext=kubecontext)
        
        if result["success"]:
            assertions = result["data"]
            
            track_call("get_assertions", kwargs=locals(), output="Assertions retrieved") 
            response = {
                "success": True,
                "assertions": assertions,
                "entity": entity
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_assertions", kwargs=locals(), error=result["error"])
            result["output"] = json.dumps(result, indent=2) if "output" not in result else result["output"]
            return result
            
    except Exception as e:
        error_msg = f"Failed to get assertions: {str(e)}"
        track_call("get_assertions", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# NAVIGATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def get_grafana_navigation_url(kubecontext: str, resource_type: str, resource_id: Optional[str] = None,
                              query: Optional[str] = None, from_time: Optional[str] = None,
                              to_time: Optional[str] = None) -> Dict[str, Any]:
    """
    Get navigation URLs for Grafana web UI to view specific resources.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        resource_type: Type of resource ('dashboards', 'dashboard', 'explore', 'alerting', 'datasources')
        resource_id: Specific resource ID (required for 'dashboard' type)
        query: Query string for explore view
        from_time: Start time for time-based views
        to_time: End time for time-based views
        
    Returns:
        Dict containing the navigation URL
    """
    try:
        config = get_grafana_config(kubecontext)
        if not config or not config.get('url'):
            error_msg = f"No Grafana URL configured for kubecontext {kubecontext}"
            track_call("get_grafana_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        base_url = config['url'].rstrip('/')
        
        url_mappings = {
            "home": "/",
            "dashboards": "/dashboards",
            "dashboard": "/d/{id}",
            "explore": "/explore",
            "alerting": "/alerting",
            "datasources": "/datasources"
        }
        
        if resource_type not in url_mappings:
            error_msg = f"Invalid resource_type. Valid options: {list(url_mappings.keys())}"
            track_call("get_grafana_navigation_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        if resource_type == "dashboard":
            if not resource_id:
                error_msg = "resource_id is required for dashboard resource_type"
                track_call("get_grafana_navigation_url", kwargs=locals(), error=error_msg)
                return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
            path = url_mappings[resource_type].format(id=resource_id)
        else:
            path = url_mappings[resource_type]
        
        navigation_url = f"{base_url}{path}"
        
        # Add query parameters for explore and time-based views
        params = []
        if query and resource_type == "explore":
            params.append(f"left={urlencode({'queries': [{'expr': query}]})[8:]}")
        if from_time and to_time:
            params.append(f"from={from_time}&to={to_time}")
        
        if params:
            navigation_url += "?" + "&".join(params)
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "resource_type": resource_type,
            "grafana_base_url": base_url
        }
        
        if resource_id:
            result["resource_id"] = resource_id
        if query:
            result["query"] = query
        if from_time and to_time:
            result["time_range"] = {"from": from_time, "to": to_time}
        
        track_call("get_grafana_navigation_url", kwargs=locals(), 
                  output=f"Generated URL for {resource_type}")
        
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate navigation URL: {str(e)}"
        track_call("get_grafana_navigation_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_grafana_dashboard_url(kubecontext: str, dashboard_uid: str, panel_id: Optional[str] = None,
                             from_time: Optional[str] = None, to_time: Optional[str] = None,
                             variables_json: Optional[str] = None) -> Dict[str, Any]:
    """
    Get direct navigation URL for a specific Grafana dashboard in the web UI.
    
    Args:
        kubecontext: Kubernetes context to use for Grafana configuration
        dashboard_uid: Dashboard UID
        panel_id: Specific panel ID to focus on
        from_time: Start time for dashboard view
        to_time: End time for dashboard view
        variables_json: JSON string of dashboard template variables
        
    Returns:
        Dict containing the navigation URL for the dashboard
    """
    try:
        config = get_grafana_config(kubecontext)
        if not config or not config.get('url'):
            error_msg = f"No Grafana URL configured for kubecontext {kubecontext}"
            track_call("get_grafana_dashboard_url", kwargs=locals(), error=error_msg)
            return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}
        
        base_url = config['url'].rstrip('/')
        navigation_url = f"{base_url}/d/{dashboard_uid}"
        
        variables = {}
        if variables_json:
            try:
                variables = json.loads(variables_json)
            except json.JSONDecodeError as e:
                return {"success": False, "error": f"Invalid JSON in variables: {str(e)}"}
        
        # Add query parameters
        params = []
        if panel_id:
            params.append(f"viewPanel={panel_id}")
        if from_time and to_time:
            params.append(f"from={from_time}&to={to_time}")
        if variables:
            for key, value in variables.items():
                params.append(f"var-{key}={value}")
        
        if params:
            navigation_url += "?" + "&".join(params)
        
        result = {
            "success": True,
            "navigation_url": navigation_url,
            "dashboard_uid": dashboard_uid,
            "grafana_base_url": base_url
        }
        
        if panel_id:
            result["panel_id"] = panel_id
        if from_time and to_time:
            result["time_range"] = {"from": from_time, "to": to_time}
        if variables:
            result["variables"] = variables
        
        track_call("get_grafana_dashboard_url", kwargs=locals(), 
                  output=f"Generated URL for dashboard {dashboard_uid}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to generate dashboard URL: {str(e)}"
        track_call("get_grafana_dashboard_url", kwargs=locals(), error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

#-------------------------------------------------------------------------------------#
# CONFIGURATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def set_grafana_config(kubecontext: str, url: str, api_token: str, enabled: bool = True) -> Dict[str, Any]:
    """
    Set Grafana configuration for a specific kubecontext and save to additionalConfig.yaml.
    
    Args:
        kubecontext: Kubernetes context to configure Grafana for
        url: Grafana URL (e.g., 'https://grafana.example.com')
        api_token: Grafana service account token
        enabled: Whether Grafana is enabled for this kubecontext
        
    Returns:
        Dict containing configuration result
    """
    try:
        # Import here to avoid circular imports
        from config.config import update_cluster_config
        
        # Validate URL format
        if not url.startswith(('http://', 'https://')):
            return {
                "success": False, 
                "error": "Grafana URL must start with http:// or https://",
                "output": json.dumps({"success": False, "error": "Grafana URL must start with http:// or https://"}, indent=2)
            }
        
        # Build the grafana configuration
        grafana_config = {
            "enabled": enabled,
            "url": url.rstrip('/'),
            "api_token": api_token
        }
        
        # Update cluster configuration
        cluster_config = {"grafana": grafana_config}
        success = update_cluster_config(kubecontext, cluster_config)
        
        if not success:
            return {
                "success": False,
                "error": f"Failed to save Grafana configuration for kubecontext {kubecontext}",
                "output": json.dumps({"success": False, "error": f"Failed to save Grafana configuration for kubecontext {kubecontext}"}, indent=2)
            }
        
        # Clear cache to force reload
        clear_grafana_config_cache()
        
        # Test the connection
        test_result = test_grafana_connection(kubecontext)
        
        result = {
            "success": True,
            "message": f"Grafana configuration saved for kubecontext {kubecontext}",
            "kubecontext": kubecontext,
            "configuration": {
                "enabled": enabled,
                "url": url,
                "has_api_token": bool(api_token)
            },
            "connection_test": test_result.get("success", False),
            "connection_error": test_result.get("error") if not test_result.get("success") else None
        }
        
        track_call("set_grafana_config", kwargs={
            "kubecontext": kubecontext, 
            "url": url,
            "has_api_token": bool(api_token)
        }, output=f"Configuration saved for kubecontext {kubecontext}")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to set Grafana configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("set_grafana_config", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def get_grafana_config_tool(kubecontext: str) -> Dict[str, Any]:
    """
    Get Grafana configuration for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to get configuration for
    
    Returns:
        Dict containing the kubecontext's Grafana configuration
    """
    
    try:
        config = get_grafana_config(kubecontext)
        
        if not config:
            return {
                "success": False, 
                "error": f"No Grafana configuration found for kubecontext {kubecontext}",
                "kubecontext": kubecontext,
                "output": json.dumps({"success": False, "error": f"No Grafana configuration found for kubecontext {kubecontext}"}, indent=2)
            }
        
        # Return sanitized config (without sensitive data)
        safe_config = {
            "success": True,
            "kubecontext": config['cluster_name'],
            "enabled": config['enabled'],
            "url": config['url'],
            "has_api_token": bool(config.get('api_token'))
        }
        
        track_call("get_grafana_config_tool", kwargs={"kubecontext": kubecontext}, 
                  output=f"Retrieved config for kubecontext {kubecontext}")
        safe_config["output"] = json.dumps(safe_config, indent=2)
        return safe_config
        
    except Exception as e:
        error_msg = f"Failed to get Grafana configuration for kubecontext {kubecontext}: {str(e)}"
        track_call("get_grafana_config_tool", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "kubecontext": kubecontext, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

@function_tool
def test_grafana_connection(kubecontext: str) -> Dict[str, Any]:
    """
    Test Grafana connection for a specific kubecontext.
    
    Args:
        kubecontext: Kubernetes context to test connection for
    
    Returns:
        Dict containing connection test results
    """
    
    try:
        # Test with a simple user info API call
        result = make_grafana_request("GET", "/api/user", kubecontext=kubecontext)
        
        if result["success"]:
            user_data = result["data"]
            
            track_call("test_grafana_connection", kwargs={"kubecontext": kubecontext}, 
                      output=f"Connection successful for kubecontext {kubecontext}")
            
            response = {
                "success": True,
                "kubecontext": kubecontext,
                "message": "Grafana connection successful",
                "user_info": user_data
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("test_grafana_connection", kwargs={"kubecontext": kubecontext}, 
                      error=result.get("error"))
            response = {
                "success": False,
                "kubecontext": kubecontext,
                "error": f"Grafana connection failed: {result.get('error')}",
                "connection_test": False
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to test Grafana connection for kubecontext {kubecontext}: {str(e)}"
        track_call("test_grafana_connection", kwargs={"kubecontext": kubecontext}, error=error_msg)
        return {"success": False, "error": error_msg, "kubecontext": kubecontext, "output": json.dumps({"success": False, "error": error_msg}, indent=2)}

# Configuration tools
grafana_config_tools = [
    get_grafana_config_tool,
    set_grafana_config,
    test_grafana_connection
]

# Read-only operations - allowed in recon mode
grafana_read_tools = [
    # Admin tools
    list_teams,
    list_users_by_org,
    
    # Dashboard tools
    search_dashboards,
    get_dashboard_by_uid,
    get_dashboard_panel_queries,
    
    # Datasource tools
    list_datasources,
    get_datasource_by_uid,

    
    # Incident tools (read-only)
    list_incidents,
    get_incident,
    
    # OnCall tools (read-only)
    list_oncall_schedules,
    get_oncall_shift,
    get_current_oncall_users,
    list_oncall_teams,
    list_oncall_users,
    
    # Sift tools (read-only)
    get_sift_investigation,
    get_sift_analysis,
    list_sift_investigations,
    find_error_pattern_logs,
    find_slow_requests,
    
    # Pyroscope tools (read-only)
    list_pyroscope_label_names,
    list_pyroscope_label_values,
    list_pyroscope_profile_types,
    fetch_pyroscope_profile,
    
    # Asserts tools (read-only)
    get_assertions,
    
    # Navigation tools
    get_grafana_navigation_url,
    get_grafana_dashboard_url,
] + grafana_config_tools

# Action/modification operations - only allowed when recon mode is off
grafana_action_tools = [
    # update_dashboard,
    # create_incident,
    # add_activity_to_incident,
]

# Combined tools based on recon mode
def get_grafana_tools():
    from config.config import get_recon_mode
    if get_recon_mode():
        return grafana_read_tools
    else:
        return grafana_read_tools + grafana_action_tools

# For backward compatibility
grafana_tools = get_grafana_tools()