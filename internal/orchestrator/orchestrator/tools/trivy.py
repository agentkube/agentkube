from agents import function_tool
import os
import requests
import datetime
import json
from typing import Dict, Any

AGENTKUBE_SCAN_BASE_URL = "https://scan.agentkube.com/api/v1"

tool_call_history = []

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
    
@function_tool
def scan_manifest(manifest: str) -> Dict[str, Any]:
    """
    Scan a Kubernetes manifest for security vulnerabilities and misconfigurations.
    
    Args:
        manifest: Kubernetes manifest YAML content to scan
        
    Returns:
        Dict containing scan results with vulnerabilities and recommendations
    """
    try:
        # Prepare the request
        url = f"{AGENTKUBE_SCAN_BASE_URL}/scan/config"
        headers = {
            "Content-Type": "application/json"
        }
        data = {
            "manifest": manifest
        }
        
        # Make the POST request
        response = requests.post(url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        
        # Parse the response
        scan_results = response.json()
        
        # Format the response
        result = {
            "success": True,
            "scan_results": scan_results,
            "manifest_scanned": True,
            "scan_url": url
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("scan_manifest", kwargs={"manifest": manifest}, output="Manifest scanned successfully")
        return result
        
    except requests.exceptions.RequestException as e:
        error_msg = f"Failed to scan manifest - API request error: {str(e)}"
        track_call("scan_manifest", kwargs={"manifest": manifest}, error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response
        
    except json.JSONDecodeError as e:
        error_msg = f"Failed to parse scan results: {str(e)}"
        track_call("scan_manifest", kwargs={"manifest": manifest}, error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response
        
    except Exception as e:
        error_msg = f"Failed to scan manifest: {str(e)}"
        track_call("scan_manifest", kwargs={"manifest": manifest}, error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response