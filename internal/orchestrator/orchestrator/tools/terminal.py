#-------------------------------------------------------------------------------------#
# Terminal Tools - Command execution and shell operations for system interaction.
# Provides tools for running commands, managing processes, and terminal session handling.
#-------------------------------------------------------------------------------------#

import subprocess
import shlex
import os
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from agents import function_tool
import datetime
import re
import signal
import psutil
import json

# Global configuration for terminal operations
_allowed_directory: Optional[str] = None
_allowed_commands: List[str] = ['all']  # Default to allowing all commands, can be restricted via config
_allowed_flags: List[str] = ['all']     # Default to allowing all flags, can be restricted via config
_max_command_length: int = 1024
_command_timeout: int = 30
_allow_shell_operators: bool = False

tool_call_history = []

def initialize_terminal_security():
    """Initialize terminal security settings from config if available"""
    global _allow_shell_operators
    try:
        from config.config import get_recon_mode
        # In recon mode, be more restrictive
        if get_recon_mode():
            _allow_shell_operators = False
        else:
            _allow_shell_operators = True
    except ImportError:
        pass  # Config module might not be available

# Initialize on module load
initialize_terminal_security()

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

def validate_command_security(command: str) -> Dict[str, Any]:
    """Validate command against security rules"""
    if len(command) > _max_command_length:
        return {
            "valid": False,
            "error": f"Command length {len(command)} exceeds maximum {_max_command_length}"
        }
    
    # Check for shell operators if not allowed
    if not _allow_shell_operators:
        shell_operators = ['&&', '||', '|', '>', '>>', '<', ';', '`', '$']
        for operator in shell_operators:
            if operator in command:
                return {
                    "valid": False,
                    "error": f"Shell operator '{operator}' not allowed"
                }
    
    # Parse command into parts
    try:
        parts = shlex.split(command)
    except ValueError as e:
        return {
            "valid": False,
            "error": f"Invalid command syntax: {str(e)}"
        }
    
    if not parts:
        return {
            "valid": False,
            "error": "Empty command"
        }
    
    cmd_name = parts[0]
    cmd_args = parts[1:]
    
    # Check deny list from config first
    try:
        from config.config import get_deny_list
        deny_list = get_deny_list()
        if cmd_name in deny_list:
            return {
                "valid": False,
                "error": f"Command '{cmd_name}' is in the deny list"
            }
    except ImportError:
        pass  # Config module might not be available
    
    # Check if command is allowed (unless 'all' is specified)
    if 'all' not in _allowed_commands and cmd_name not in _allowed_commands:
        return {
            "valid": False,
            "error": f"Command '{cmd_name}' not in allowed commands: {_allowed_commands}"
        }
    
    # Check flags if 'all' is not specified
    if 'all' not in _allowed_flags:
        for arg in cmd_args:
            if arg.startswith('-'):
                # Handle combined short flags like -la, -lah, etc.
                if arg.startswith('--'):
                    # Long flags must match exactly
                    if arg not in _allowed_flags:
                        return {
                            "valid": False,
                            "error": f"Flag '{arg}' not in allowed flags: {_allowed_flags}"
                        }
                elif len(arg) > 2 and not arg.startswith('--'):
                    # Combined short flags like -la, split and check each
                    flag_chars = arg[1:]  # Remove the leading '-'
                    for char in flag_chars:
                        individual_flag = f'-{char}'
                        if individual_flag not in _allowed_flags:
                            return {
                                "valid": False,
                                "error": f"Flag '-{char}' (from '{arg}') not in allowed flags: {_allowed_flags}"
                            }
                else:
                    # Single short flag, check directly
                    if arg not in _allowed_flags:
                        return {
                            "valid": False,
                            "error": f"Flag '{arg}' not in allowed flags: {_allowed_flags}"
                        }
    
    return {"valid": True, "parts": parts}

def validate_path_security(path: str) -> Dict[str, Any]:
    """Validate path is within allowed directory"""
    if not _allowed_directory:
        return {"valid": True, "resolved_path": path}
    
    try:
        allowed_dir = Path(_allowed_directory).resolve()
        target_path = Path(path).resolve()
        
        # Check if target path is within allowed directory
        try:
            target_path.relative_to(allowed_dir)
        except ValueError:
            return {
                "valid": False,
                "error": f"Path '{path}' is outside allowed directory '{_allowed_directory}'"
            }
        
        return {"valid": True, "resolved_path": str(target_path)}
        
    except Exception as e:
        return {
            "valid": False,
            "error": f"Path validation error: {str(e)}"
        }

@function_tool
def set_terminal_config(allowed_directory: Optional[str] = None, allowed_commands: Optional[List[str]] = None,
                       allowed_flags: Optional[List[str]] = None, max_command_length: Optional[int] = None,
                       command_timeout: Optional[int] = None, allow_shell_operators: Optional[bool] = None) -> Dict[str, Any]:
    """
    Sets terminal security configuration for command execution.
    
    Args:
        allowed_directory: Base directory for command execution (all paths must be within this)
        allowed_commands: List of allowed commands or ['all'] to allow any command (default: ['all'])
                         Commands in config deny list are always blocked regardless of this setting
        allowed_flags: List of allowed flags or ['all'] to allow any flag (default: ['all'])
                      Supports combined flags like -la, -rni, etc.
        max_command_length: Maximum command string length (default: 1024)
        command_timeout: Command execution timeout in seconds (default: 30)
        allow_shell_operators: Whether to allow shell operators (&&, ||, |, >, etc.)
                              Automatically set based on recon mode if not specified
        
    Returns:
        Dict containing the configuration result
    """
    global _allowed_directory, _allowed_commands, _allowed_flags, _max_command_length, _command_timeout, _allow_shell_operators
    
    try:
        if allowed_directory is not None:
            dir_path = Path(allowed_directory).resolve()
            if not dir_path.exists():
                error_msg = f"Allowed directory does not exist: {allowed_directory}"
                track_call("set_terminal_config", kwargs={"allowed_directory": allowed_directory}, error=error_msg)
                response = {
                    "success": False,
                    "error": error_msg
                }
                response["output"] = json.dumps(response, indent=2)
                return response
            if not dir_path.is_dir():
                error_msg = f"Allowed directory is not a directory: {allowed_directory}"
                track_call("set_terminal_config", kwargs={"allowed_directory": allowed_directory}, error=error_msg)
                response = {
                    "success": False,
                    "error": error_msg
                }
                response["output"] = json.dumps(response, indent=2)
                return response
            _allowed_directory = str(dir_path)
        
        if allowed_commands is not None:
            _allowed_commands = allowed_commands
        
        if allowed_flags is not None:
            _allowed_flags = allowed_flags
        
        if max_command_length is not None:
            _max_command_length = max_command_length
        
        if command_timeout is not None:
            _command_timeout = command_timeout
        
        if allow_shell_operators is not None:
            _allow_shell_operators = allow_shell_operators
        
        result = {
            "success": True,
            "message": "Terminal configuration updated",
            "config": {
                "allowed_directory": _allowed_directory,
                "allowed_commands": _allowed_commands,
                "allowed_flags": _allowed_flags,
                "max_command_length": _max_command_length,
                "command_timeout": _command_timeout,
                "allow_shell_operators": _allow_shell_operators
            }
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("set_terminal_config", output="Configuration updated")
        return result
        
    except Exception as e:
        error_msg = f"Failed to set terminal configuration: {str(e)}"
        track_call("set_terminal_config", error=error_msg)
        response = {
            "success": False,
            "error": error_msg
        }
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def run_command(command: str, working_directory: Optional[str] = None, 
                capture_output: Optional[bool] = None, timeout: Optional[int] = None) -> Dict[str, Any]:
    """
    Executes a command in the terminal with security validation.
    
    Args:
        command: Command to execute (e.g., 'ls -l' or 'cat file.txt')
        working_directory: Directory to run command in (must be within allowed directory)
        capture_output: Whether to capture stdout/stderr. If not specified, uses True
        timeout: Command timeout in seconds. If not specified, uses configured timeout
        
    Returns:
        Dict containing command execution result
    """
    actual_capture_output = capture_output if capture_output is not None else True
    actual_timeout = timeout if timeout is not None else _command_timeout
    
    try:
        # Validate command security
        security_check = validate_command_security(command)
        if not security_check["valid"]:
            error_msg = f"Security validation failed: {security_check['error']}"
            track_call("run_command", kwargs={"command": command}, error=error_msg)
            response = {
                "success": False,
                "error": error_msg,
                "command": command
            }
            response["output"] = json.dumps(response, indent=2)
            return response
        
        # Determine working directory
        if working_directory:
            path_check = validate_path_security(working_directory)
            if not path_check["valid"]:
                error_msg = f"Working directory validation failed: {path_check['error']}"
                track_call("run_command", kwargs={"command": command, "working_directory": working_directory}, error=error_msg)
                response = {
                    "success": False,
                    "error": error_msg,
                    "command": command
                }
                response["output"] = json.dumps(response, indent=2)
                return response
            work_dir = path_check["resolved_path"]
        else:
            work_dir = _allowed_directory or os.getcwd()
        
        # Execute command
        start_time = datetime.datetime.now()
        
        if actual_capture_output:
            result = subprocess.run(
                security_check["parts"],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=actual_timeout
            )
            
            stdout = result.stdout
            stderr = result.stderr
            return_code = result.returncode
        else:
            result = subprocess.run(
                security_check["parts"],
                cwd=work_dir,
                timeout=actual_timeout
            )
            
            stdout = ""
            stderr = ""
            return_code = result.returncode
        
        end_time = datetime.datetime.now()
        execution_time = (end_time - start_time).total_seconds()
        
        response = {
            "success": True,
            "command": command,
            "return_code": return_code,
            "stdout": stdout,
            "stderr": stderr,
            "working_directory": work_dir,
            "execution_time": execution_time,
            "timestamp": start_time.isoformat()
        }
        
        response["output"] = json.dumps(response, indent=2)
        track_call("run_command", kwargs={"command": command, "working_directory": working_directory}, 
                  output=f"Command executed with return code {return_code}")
        return response
        
    except subprocess.TimeoutExpired:
        error_msg = f"Command timed out after {actual_timeout} seconds"
        track_call("run_command", kwargs={"command": command}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "command": command,
            "timeout": actual_timeout
        }
        response["output"] = json.dumps(response, indent=2)
        return response
    except FileNotFoundError:
        error_msg = f"Command not found: {security_check['parts'][0]}"
        track_call("run_command", kwargs={"command": command}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "command": command
        }
        response["output"] = json.dumps(response, indent=2)
        return response
    except PermissionError:
        error_msg = f"Permission denied executing command: {command}"
        track_call("run_command", kwargs={"command": command}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "command": command
        }
        response["output"] = json.dumps(response, indent=2)
        return response
    except Exception as e:
        error_msg = f"Command execution failed: {str(e)}"
        track_call("run_command", kwargs={"command": command}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "command": command
        }
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def show_security_rules() -> Dict[str, Any]:
    """
    Displays current terminal security configuration and restrictions.
    
    Returns:
        Dict containing current security rules and configuration
    """
    try:
        config = {
            "allowed_directory": _allowed_directory,
            "allowed_commands": _allowed_commands,
            "allowed_flags": _allowed_flags,
            "max_command_length": _max_command_length,
            "command_timeout": _command_timeout,
            "allow_shell_operators": _allow_shell_operators,
            "current_working_directory": os.getcwd()
        }
        
        result = {
            "success": True,
            "security_rules": config,
            "message": "Current terminal security configuration"
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("show_security_rules", output="Security rules retrieved")
        return result
        
    except Exception as e:
        error_msg = f"Failed to get security rules: {str(e)}"
        track_call("show_security_rules", error=error_msg)
        response = {
            "success": False,
            "error": error_msg
        }
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def list_running_processes(pattern: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    Lists currently running processes, optionally filtered by pattern.
    
    Args:
        pattern: Optional regex pattern to filter process names
        limit: Maximum number of processes to return. If not specified, uses 50
        
    Returns:
        Dict containing list of running processes
    """
    actual_limit = limit if limit is not None else 50
    
    try:
        processes = []
        count = 0
        
        for proc in psutil.process_iter(['pid', 'name', 'status', 'cpu_percent', 'memory_percent', 'create_time']):
            if count >= actual_limit:
                break
                
            try:
                proc_info = proc.info
                proc_name = proc_info['name']
                
                # Apply pattern filter if specified
                if pattern and not re.search(pattern, proc_name):
                    continue
                
                processes.append({
                    "pid": proc_info['pid'],
                    "name": proc_name,
                    "status": proc_info['status'],
                    "cpu_percent": proc_info['cpu_percent'],
                    "memory_percent": proc_info['memory_percent'],
                    "create_time": datetime.datetime.fromtimestamp(proc_info['create_time']).isoformat()
                })
                count += 1
                
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        result = {
            "success": True,
            "processes": processes,
            "total_found": len(processes),
            "limit": actual_limit,
            "pattern": pattern
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("list_running_processes", kwargs={"pattern": pattern, "limit": actual_limit}, 
                  output=f"Found {len(processes)} processes")
        return result
        
    except Exception as e:
        error_msg = f"Failed to list processes: {str(e)}"
        track_call("list_running_processes", kwargs={"pattern": pattern, "limit": actual_limit}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg
        }
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def get_process_info(pid: int) -> Dict[str, Any]:
    """
    Gets detailed information about a specific process.
    
    Args:
        pid: Process ID to get information about
        
    Returns:
        Dict containing detailed process information
    """
    try:
        proc = psutil.Process(pid)
        
        process_info = {
            "pid": proc.pid,
            "name": proc.name(),
            "status": proc.status(),
            "cpu_percent": proc.cpu_percent(),
            "memory_percent": proc.memory_percent(),
            "memory_info": proc.memory_info()._asdict(),
            "create_time": datetime.datetime.fromtimestamp(proc.create_time()).isoformat(),
            "cwd": proc.cwd() if hasattr(proc, 'cwd') else None,
            "cmdline": proc.cmdline(),
            "num_threads": proc.num_threads(),
            "username": proc.username() if hasattr(proc, 'username') else None
        }
        
        result = {
            "success": True,
            "process_info": process_info
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("get_process_info", kwargs={"pid": pid}, output="Process info retrieved")
        return result
        
    except psutil.NoSuchProcess:
        error_msg = f"Process with PID {pid} not found"
        track_call("get_process_info", kwargs={"pid": pid}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "pid": pid
        }
        response["output"] = json.dumps(response, indent=2)
        return response
    except psutil.AccessDenied:
        error_msg = f"Access denied for process {pid}"
        track_call("get_process_info", kwargs={"pid": pid}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "pid": pid
        }
        response["output"] = json.dumps(response, indent=2)
        return response
    except Exception as e:
        error_msg = f"Failed to get process info: {str(e)}"
        track_call("get_process_info", kwargs={"pid": pid}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "pid": pid
        }
        response["output"] = json.dumps(response, indent=2)
        return response

@function_tool
def kill_process(pid: int, force: Optional[bool] = None) -> Dict[str, Any]:
    """
    Terminates a process by PID.
    
    Args:
        pid: Process ID to terminate
        force: Whether to force kill (SIGKILL) instead of graceful termination (SIGTERM). If not specified, uses False
        
    Returns:
        Dict containing termination result
    """
    actual_force = force if force is not None else False
    
    try:
        proc = psutil.Process(pid)
        proc_name = proc.name()
        
        if actual_force:
            proc.kill()  # SIGKILL
            signal_used = "SIGKILL"
        else:
            proc.terminate()  # SIGTERM
            signal_used = "SIGTERM"
        
        result = {
            "success": True,
            "message": f"Process {proc_name} (PID: {pid}) terminated with {signal_used}",
            "pid": pid,
            "process_name": proc_name,
            "signal": signal_used,
            "force": actual_force
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("kill_process", kwargs={"pid": pid, "force": actual_force}, 
                  output=f"Process {pid} terminated")
        return result
        
    except psutil.NoSuchProcess:
        error_msg = f"Process with PID {pid} not found"
        track_call("kill_process", kwargs={"pid": pid, "force": actual_force}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "pid": pid
        }
        response["output"] = json.dumps(response, indent=2)
        return response
    except psutil.AccessDenied:
        error_msg = f"Access denied - cannot terminate process {pid}"
        track_call("kill_process", kwargs={"pid": pid, "force": actual_force}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "pid": pid
        }
        response["output"] = json.dumps(response, indent=2)
        return response
    except Exception as e:
        error_msg = f"Failed to terminate process: {str(e)}"
        track_call("kill_process", kwargs={"pid": pid, "force": actual_force}, error=error_msg)
        response = {
            "success": False,
            "error": error_msg,
            "pid": pid
        }
        response["output"] = json.dumps(response, indent=2)
        return response

# @function_tool
# def get_environment_variables(pattern: Optional[str] = None) -> Dict[str, Any]:
#     """
#     Gets environment variables, optionally filtered by pattern.
    
#     Args:
#         pattern: Optional regex pattern to filter environment variable names
        
#     Returns:
#         Dict containing environment variables
#     """
#     try:
#         env_vars = {}
        
#         for key, value in os.environ.items():
#             if pattern and not re.search(pattern, key):
#                 continue
#             env_vars[key] = value
        
#         result = {
#             "success": True,
#             "environment_variables": env_vars,
#             "total_variables": len(env_vars),
#             "pattern": pattern
#         }
        
#         track_call("get_environment_variables", kwargs={"pattern": pattern}, 
#                   output=f"Retrieved {len(env_vars)} environment variables")
#         return result
        
#     except Exception as e:
#         error_msg = f"Failed to get environment variables: {str(e)}"
#         track_call("get_environment_variables", kwargs={"pattern": pattern}, error=error_msg)
#         return {
#             "success": False,
#             "error": error_msg
#         }

@function_tool
def get_system_info() -> Dict[str, Any]:
    """
    Gets system information including CPU, memory, and disk usage.
    
    Returns:
        Dict containing system information
    """
    try:
        # CPU information
        cpu_info = {
            "cpu_count": psutil.cpu_count(),
            "cpu_count_logical": psutil.cpu_count(logical=True),
            "cpu_percent": psutil.cpu_percent(interval=1),
            "cpu_freq": psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None
        }
        
        # Memory information
        memory = psutil.virtual_memory()
        memory_info = {
            "total": memory.total,
            "available": memory.available,
            "used": memory.used,
            "free": memory.free,
            "percent": memory.percent
        }
        
        # Disk information
        disk = psutil.disk_usage('/')
        disk_info = {
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "percent": (disk.used / disk.total) * 100
        }
        
        # System load
        load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else None
        
        system_info = {
            "cpu": cpu_info,
            "memory": memory_info,
            "disk": disk_info,
            "load_average": load_avg,
            "boot_time": datetime.datetime.fromtimestamp(psutil.boot_time()).isoformat()
        }
        
        result = {
            "success": True,
            "system_info": system_info
        }
        
        result["output"] = json.dumps(result, indent=2)
        track_call("get_system_info", output="System info retrieved")
        return result
        
    except Exception as e:
        error_msg = f"Failed to get system info: {str(e)}"
        track_call("get_system_info", error=error_msg)
        response = {
            "success": False,
            "error": error_msg
        }
        response["output"] = json.dumps(response, indent=2)
        return response

# Read-only operations - allowed in recon mode
terminal_read_tools = [
    show_security_rules,
    list_running_processes,
    get_process_info,
    # get_environment_variables,
    get_system_info
]

# Action/modification operations - only allowed when recon mode is off
terminal_action_tools = [
    set_terminal_config,
    run_command,
    kill_process
]

# Combined tools based on recon mode
def get_terminal_tools():
    try:
        from config.config import get_recon_mode
        if get_recon_mode():
            return terminal_read_tools
        else:
            return terminal_read_tools + terminal_action_tools
    except ImportError:
        # Fallback if config module not available
        return terminal_read_tools + terminal_action_tools

# For backward compatibility
terminal_tools = get_terminal_tools()