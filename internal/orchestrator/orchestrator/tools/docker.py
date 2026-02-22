#-------------------------------------------------------------------------------------#
# Docker Registry Tools - Docker registry operations for Root Cause Analysis.
# Focused on image availability checks and verification for Kubernetes environments.
#-------------------------------------------------------------------------------------#

import requests
import json
from agents import function_tool
from typing import Dict, Optional, List, Any
import datetime
import os

# Configuration - Separate variables as requested
DOCKER_REGISTRY_URL = 'https://registry-1.docker.io'
DOCKER_AUTH_URL = 'https://auth.docker.io'
DOCKER_USERNAME = ''  # Your Docker Hub username
DOCKER_PASSWORD = ''  # Your Docker Hub Personal Access Token (PAT)

# Debug mode - can be enabled via environment variable
DEBUG_MODE = os.getenv('DOCKER_TOOLS_DEBUG', '').lower() in ('true', '1', 'yes')

tool_call_history = []

def track_call(name, args=None, kwargs=None, output=None, error=None, 
               request_info=None, response_info=None, duration_ms=None):
    """Record a tool call in the history with comprehensive output"""
    if args is None:
        args = ()
    if kwargs is None:
        kwargs = {}
    
    call_record = {
        "tool": name,
        "args": args,
        "kwargs": kwargs,
        "output": output,
        "error": error,
        "timestamp": datetime.datetime.now().isoformat(),
        "duration_ms": duration_ms
    }
    
    # Add detailed request/response info if available
    if request_info:
        call_record["request"] = request_info
    if response_info:
        call_record["response"] = response_info
    
    tool_call_history.append(call_record)
    
    # Enhanced logging for debug mode
    if DEBUG_MODE:
        print(f"[DEBUG] tool_call: {name}")
        if duration_ms:
            print(f"[DEBUG] duration: {duration_ms}ms")
        if request_info:
            print(f"[DEBUG] request: {json.dumps(request_info, indent=2)}")
        if response_info and not response_info.get('raw_content_truncated'):
            print(f"[DEBUG] response: {json.dumps(response_info, indent=2)}")
    else:
        print(f"tool_call: {name}")

def parse_image_name(image_name: str) -> Dict[str, str]:
    """Parse image name into registry, repository, and tag components"""
    # Handle formats: nginx:latest, library/nginx:latest, myuser/myapp:v1.0
    
    if ':' in image_name and not '/' in image_name.split(':')[-1]:
        repository, tag = image_name.rsplit(':', 1)
    else:
        repository = image_name
        tag = 'latest'
    
    # For Docker Hub, add library/ prefix for official images without namespace
    if '/' not in repository:
        repository = f'library/{repository}'
    
    return {
        'repository': repository,
        'tag': tag
    }

def get_docker_auth_token(repository: str) -> Optional[str]:
    """Get authentication token for Docker Hub"""
    try:
        auth_url = f"{DOCKER_AUTH_URL}/token"
        params = {
            'service': 'registry.docker.io',
            'scope': f'repository:{repository}:pull'
        }
        
        if DOCKER_USERNAME and DOCKER_PASSWORD:
            # Use username + PAT for authentication
            auth = (DOCKER_USERNAME, DOCKER_PASSWORD)
            response = requests.get(auth_url, params=params, auth=auth, timeout=10)
        else:
            # Public access
            response = requests.get(auth_url, params=params, timeout=10)
        
        if response.status_code == 200:
            return response.json().get('token')
        
        return None
    except Exception as e:
        print(f"Auth error: {str(e)}")
        return None

def make_registry_request(method: str, url: str, headers: Optional[Dict] = None) -> Dict[str, Any]:
    """Make a request to Docker registry with error handling"""
    try:
        response = requests.request(method, url, headers=headers or {}, timeout=15)
        
        return {
            "success": response.status_code < 400,
            "status_code": response.status_code,
            "data": response.json() if response.content and 'application/json' in response.headers.get('content-type', '') else response.text,
            "headers": dict(response.headers)
        }
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Request timeout"}
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Request failed: {str(e)}"}
    except json.JSONDecodeError:
        return {"success": False, "error": "Invalid JSON response"}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {str(e)}"}

#-------------------------------------------------------------------------------------#
# IMAGE AVAILABILITY TOOLS
#-------------------------------------------------------------------------------------#

@function_tool
def check_public_image_exists(image_name: str) -> Dict[str, Any]:
    """
    Simple check for publicly available Docker images using Docker Hub API.
    Works without authentication for public images.
    
    Args:
        image_name: Image name (e.g., 'nginx:latest', 'ubuntu:20.04')
        
    Returns:
        Dict containing image availability status
    """
    try:
        parsed = parse_image_name(image_name)
        repository = parsed['repository']
        tag = parsed['tag']
        
        # Use Docker Hub API v2 for public repositories
        url = f"https://registry.hub.docker.com/v2/repositories/{repository}/tags/{tag}/"
        
        try:
            response = requests.head(url, timeout=10)
            status_code = response.status_code
            
            if status_code == 200:
                track_call("check_public_image_exists", kwargs=locals(), 
                          output=f"Public image {image_name} exists")
                response = {
                    "success": True,
                    "exists": True,
                    "image_name": image_name,
                    "repository": repository,
                    "tag": tag,
                    "method": "docker_hub_api",
                    "status_code": status_code
                }
                response["output"] = json.dumps(response, indent=2)
                return response
            elif status_code == 404:
                track_call("check_public_image_exists", kwargs=locals(), 
                          output=f"Public image {image_name} not found")
                response = {
                    "success": True,
                    "exists": False,
                    "image_name": image_name,
                    "repository": repository,
                    "tag": tag,
                    "method": "docker_hub_api",
                    "status_code": status_code,
                    "error": "Image not found in Docker Hub"
                }
                response["output"] = json.dumps(response, indent=2)
                return response
            else:
                response = {
                    "success": False,
                    "exists": False,
                    "image_name": image_name,
                    "method": "docker_hub_api",
                    "status_code": status_code,
                    "error": f"Unexpected HTTP status: {status_code}"
                }
                response["output"] = json.dumps(response, indent=2)
                return response
        except requests.exceptions.Timeout:
            response = {
                "success": False,
                "exists": False,
                "image_name": image_name,
                "error": "Request timeout"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        except requests.exceptions.RequestException as e:
            response = {
                "success": False,
                "exists": False,
                "image_name": image_name,
                "error": f"Request failed: {str(e)}"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to check public image: {str(e)}"
        track_call("check_public_image_exists", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def check_private_image_exists(image_name: str) -> Dict[str, Any]:
    """
    Check if a private Docker image exists in Docker Hub registry using registry API.
    Requires authentication via set_docker_config() for private repositories.
    For public images, use check_public_image_exists() instead.
    
    Args:
        image_name: Image name (e.g., 'myuser/myapp:v1.0', 'company/private-repo:latest')
        
    Returns:
        Dict containing image existence status and basic info
    """
    try:
        parsed = parse_image_name(image_name)
        repository = parsed['repository']
        tag = parsed['tag']
        
        # Get authentication token
        token = get_docker_auth_token(repository)
        
        headers = {
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json'
        }
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        # Check if manifest exists
        manifest_url = f"{DOCKER_REGISTRY_URL}/v2/{repository}/manifests/{tag}"
        result = make_registry_request("HEAD", manifest_url, headers)
        
        if result["success"]:
            # Get additional metadata from headers
            docker_content_digest = result["headers"].get('docker-content-digest', '')
            content_length = result["headers"].get('content-length', '0')
            
            track_call("check_private_image_exists", kwargs=locals(), 
                      output=f"Private image {image_name} exists")
            response = {
                "success": True,
                "exists": True,
                "image_name": image_name,
                "repository": repository,
                "tag": tag,
                "digest": docker_content_digest,
                "manifest_size": int(content_length) if content_length.isdigit() else 0
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        elif result["status_code"] == 404:
            track_call("check_private_image_exists", kwargs=locals(), 
                      output=f"Private image {image_name} not found")
            response = {
                "success": True,
                "exists": False,
                "image_name": image_name,
                "repository": repository,
                "tag": tag,
                "error": "Image not found in registry"
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("check_private_image_exists", kwargs=locals(), error=result.get("error", "Unknown error"))
            response = {
                "success": False,
                "exists": False,
                "image_name": image_name,
                "error": result.get("error", f"HTTP {result['status_code']}")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to check image existence: {str(e)}"
        track_call("check_private_image_exists", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def get_image_manifest(image_name: str) -> Dict[str, Any]:
    """
    Get detailed manifest information for a Docker image.
    
    Args:
        image_name: Image name (e.g., 'nginx:latest', 'myuser/myapp:v1.0')
        
    Returns:
        Dict containing detailed image manifest
    """
    try:
        parsed = parse_image_name(image_name)
        repository = parsed['repository']
        tag = parsed['tag']
        
        # Get authentication token
        token = get_docker_auth_token(repository)
        
        headers = {
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.manifest.v1+json'
        }
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        # Get manifest
        manifest_url = f"{DOCKER_REGISTRY_URL}/v2/{repository}/manifests/{tag}"
        result = make_registry_request("GET", manifest_url, headers)
        
        if result["success"]:
            manifest = result["data"]
            
            # Extract key information
            schema_version = manifest.get('schemaVersion', 0)
            media_type = manifest.get('mediaType', '')
            
            # Handle different manifest formats
            if schema_version == 2:
                config_digest = manifest.get('config', {}).get('digest', '')
                layers = manifest.get('layers', [])
                layer_count = len(layers)
                total_size = sum(layer.get('size', 0) for layer in layers)
            else:
                config_digest = ''
                layer_count = 0
                total_size = 0
            
            track_call("get_image_manifest", kwargs=locals(), 
                      output=f"Retrieved manifest for {image_name}")
            response = {
                "success": True,
                "image_name": image_name,
                "repository": repository,
                "tag": tag,
                "manifest": manifest,
                "schema_version": schema_version,
                "media_type": media_type,
                "config_digest": config_digest,
                "layer_count": layer_count,
                "total_size": total_size,
                "digest": result["headers"].get('docker-content-digest', '')
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("get_image_manifest", kwargs=locals(), error=result.get("error", "Failed to get manifest"))
            response = {
                "success": False,
                "error": result.get("error", f"HTTP {result['status_code']}")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to get image manifest: {str(e)}"
        track_call("get_image_manifest", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def list_image_tags(repository: str, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    List available tags for a Docker repository.
    
    Args:
        repository: Repository name (e.g., 'library/nginx', 'myuser/myapp')
        limit: Maximum number of tags to return
        
    Returns:
        Dict containing list of available tags
    """
    try:
        # Get authentication token
        token = get_docker_auth_token(repository)
        
        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        # Get tags list
        tags_url = f"{DOCKER_REGISTRY_URL}/v2/{repository}/tags/list"
        result = make_registry_request("GET", tags_url, headers)
        
        if result["success"]:
            tags_data = result["data"]
            all_tags = tags_data.get('tags', [])
            
            # Apply limit if specified
            if limit and len(all_tags) > limit:
                tags = all_tags[:limit]
                truncated = True
            else:
                tags = all_tags
                truncated = False
            
            track_call("list_image_tags", kwargs=locals(), 
                      output=f"Retrieved {len(tags)} tags for {repository}")
            response = {
                "success": True,
                "repository": repository,
                "tags": tags,
                "total_count": len(all_tags),
                "returned_count": len(tags),
                "truncated": truncated
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        else:
            track_call("list_image_tags", kwargs=locals(), error=result.get("error", "Failed to get tags"))
            response = {
                "success": False,
                "error": result.get("error", f"HTTP {result['status_code']}")
            }
            response["output"] = json.dumps(response, indent=2)
            return response
            
    except Exception as e:
        error_msg = f"Failed to list image tags: {str(e)}"
        track_call("list_image_tags", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def check_multiple_images(image_list: List[str]) -> Dict[str, Any]:
    """
    Check existence of multiple Docker images efficiently.
    
    Args:
        image_list: List of image names to check
        
    Returns:
        Dict containing results for all images
    """
    try:
        results = {}
        summary = {"exists": 0, "missing": 0, "errors": 0}
        
        for image_name in image_list:
            result = check_private_image_exists(image_name)
            results[image_name] = result
            
            if result.get("success"):
                if result.get("exists"):
                    summary["exists"] += 1
                else:
                    summary["missing"] += 1
            else:
                summary["errors"] += 1
        
        track_call("check_multiple_images", kwargs=locals(), 
                  output=f"Checked {len(image_list)} images: {summary['exists']} exist, {summary['missing']} missing, {summary['errors']} errors")
        response = {
            "success": True,
            "total_images": len(image_list),
            "results": results,
            "summary": summary
        }
        response["output"] = json.dumps(response, indent=2)
        return response
        
    except Exception as e:
        error_msg = f"Failed to check multiple images: {str(e)}"
        track_call("check_multiple_images", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def verify_image_pullability(image_name: str) -> Dict[str, Any]:
    """
    Verify if an image can be pulled by checking manifest and layers availability.
    
    Args:
        image_name: Image name to verify
        
    Returns:
        Dict containing pullability status and details
    """
    try:
        # First check if image exists
        exists_result = check_private_image_exists(image_name)
        if not exists_result.get("success") or not exists_result.get("exists"):
            response = {
                "success": True,
                "pullable": False,
                "reason": "Image does not exist",
                "details": exists_result
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        
        # Get manifest to check layers
        manifest_result = get_image_manifest(image_name)
        if not manifest_result.get("success"):
            response = {
                "success": True,
                "pullable": False,
                "reason": "Cannot access manifest",
                "details": manifest_result
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        
        manifest = manifest_result.get("manifest", {})
        layers = manifest.get("layers", [])
        
        # For basic verification, if we can get manifest, image should be pullable
        # More detailed layer checking would require additional API calls
        
        track_call("verify_image_pullability", kwargs=locals(), 
                  output=f"Image {image_name} is {'pullable' if layers else 'may not be pullable'}")
        response = {
            "success": True,
            "pullable": bool(layers),
            "image_name": image_name,
            "layer_count": len(layers),
            "total_size": manifest_result.get("total_size", 0),
            "manifest_digest": manifest_result.get("digest", ""),
            "details": {
                "schema_version": manifest_result.get("schema_version"),
                "media_type": manifest_result.get("media_type")
            }
        }
        response["output"] = json.dumps(response, indent=2)
        return response
        
    except Exception as e:
        error_msg = f"Failed to verify image pullability: {str(e)}"
        track_call("verify_image_pullability", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

#-------------------------------------------------------------------------------------#
# CONFIGURATION FUNCTIONS
#-------------------------------------------------------------------------------------#

@function_tool
def set_docker_config(registry_url: str, auth_url: str, username: str, password: str) -> Dict[str, Any]:
    """
    Set Docker registry configuration.
    
    Args:
        registry_url: Docker registry URL (e.g., 'https://registry-1.docker.io')
        auth_url: Docker auth URL (e.g., 'https://auth.docker.io') 
        username: Docker Hub username
        password: Docker Hub Personal Access Token (PAT)
        
    Returns:
        Dict containing configuration result
    """
    global DOCKER_REGISTRY_URL, DOCKER_AUTH_URL, DOCKER_USERNAME, DOCKER_PASSWORD
    
    try:
        DOCKER_REGISTRY_URL = registry_url.rstrip('/')
        DOCKER_AUTH_URL = auth_url.rstrip('/')
        DOCKER_USERNAME = username
        DOCKER_PASSWORD = password
        
        # Test connection by trying to get a token
        test_token = get_docker_auth_token('library/alpine')
        
        result = {
            "success": True,
            "message": "Docker configuration set successfully",  
            "registry_url": DOCKER_REGISTRY_URL,
            "auth_url": DOCKER_AUTH_URL,
            "username": DOCKER_USERNAME,
            "has_password": bool(DOCKER_PASSWORD),
            "connection_test": bool(test_token),
            "test_token_length": len(test_token) if test_token else 0
        }
        
        track_call("set_docker_config", kwargs={
            "registry_url": registry_url,
            "auth_url": auth_url,
            "username": username
        }, output="Configuration set successfully")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to set Docker configuration: {str(e)}"
        track_call("set_docker_config", kwargs=locals(), error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def get_docker_config() -> Dict[str, Any]:
    """
    Get current Docker registry configuration.
    
    Returns:
        Dict containing current configuration
    """
    try:
        result = {
            "success": True,
            "registry_url": DOCKER_REGISTRY_URL or "Not configured",
            "auth_url": DOCKER_AUTH_URL or "Not configured", 
            "username": DOCKER_USERNAME or "Not configured",
            "has_password": bool(DOCKER_PASSWORD),
            "configured": bool(DOCKER_REGISTRY_URL and DOCKER_AUTH_URL)
        }
        
        track_call("get_docker_config", output="Configuration retrieved")
        result["output"] = json.dumps(result, indent=2)
        return result
        
    except Exception as e:
        error_msg = f"Failed to get Docker configuration: {str(e)}"
        track_call("get_docker_config", error=error_msg)
        response = {"success": False, "error": error_msg}
        response["output"] = json.dumps(response, indent=2)
        return response

docker_tools = [
    # Image availability tools
    check_public_image_exists, 
    check_private_image_exists,         
    get_image_manifest,
    list_image_tags,
    check_multiple_images,
    verify_image_pullability,
    
    # Configuration tools
    set_docker_config,
    get_docker_config
]