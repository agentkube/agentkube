#-------------------------------------------------------------------------------------#
# Filesystem Tools - File and directory operations for local and remote filesystem management.
# Provides tools for reading, writing, copying, moving, and monitoring files with permission handling.
#-------------------------------------------------------------------------------------#

import shutil
from pathlib import Path
from typing import Dict, List, Optional, Any
from agents import function_tool
from pydantic import BaseModel
import datetime
import re

# Global default path for relative path resolution
# TODO set current working dir, pass it from UI
_default_filesystem_path: Optional[str] = None

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

def resolve_path(path_str: str) -> Path:
    """Resolve a path string against the default filesystem path if it's relative"""
    path = Path(path_str)
    
    if path.is_absolute():
        return path
    
    if _default_filesystem_path:
        return Path(_default_filesystem_path) / path
    
    return path.resolve()

def format_file_info(path: Path) -> Dict[str, Any]:
    """Format file/directory information"""
    try:
        stat = path.stat()
        return {
            "name": path.name,
            "path": str(path),
            "type": "directory" if path.is_dir() else "file",
            "size": stat.st_size if path.is_file() else None,
            "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "created": datetime.datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "permissions": oct(stat.st_mode)[-3:],
            "exists": True
        }
    except (OSError, FileNotFoundError) as e:
        return {
            "name": path.name,
            "path": str(path),
            "type": "unknown",
            "size": None,
            "modified": None,
            "created": None,
            "permissions": None,
            "exists": False,
            "error": str(e)
        }

@function_tool
def set_filesystem_default(default_path: str) -> Dict[str, str]:
    """
    Sets a default absolute path for the current session. 
    Relative paths used in subsequent tool calls will be resolved against this default.
    
    Args:
        default_path: Absolute path to set as default for relative path resolution
        
    Returns:
        Dict containing the operation result
    """
    global _default_filesystem_path
    
    try:
        resolved_path = Path(default_path).resolve()
        
        if not resolved_path.exists():
            error_msg = f"Path does not exist: {resolved_path}"
            track_call("set_filesystem_default", kwargs={"default_path": default_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "default_path": None
            }
        
        if not resolved_path.is_dir():
            error_msg = f"Path is not a directory: {resolved_path}"
            track_call("set_filesystem_default", kwargs={"default_path": default_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "default_path": None
            }
        
        _default_filesystem_path = str(resolved_path)
        
        result = {
            "success": True,
            "message": f"Default filesystem path set to: {_default_filesystem_path}",
            "default_path": _default_filesystem_path
        }
        
        track_call("set_filesystem_default", kwargs={"default_path": default_path}, output=result["message"])
        return result
        
    except Exception as e:
        error_msg = f"Failed to set default path: {str(e)}"
        track_call("set_filesystem_default", kwargs={"default_path": default_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "default_path": None
        }

@function_tool
def read_file(file_path: str, encoding: Optional[str] = None) -> Dict[str, Any]:
    """
    Reads the entire content of a specified file as text.
    
    Args:
        file_path: Path to the file to read (relative or absolute)
        encoding: Text encoding to use. If not specified, uses 'utf-8'
        
    Returns:
        Dict containing the file content and metadata
    """
    actual_encoding = encoding if encoding is not None else 'utf-8'
    
    try:
        resolved_path = resolve_path(file_path)
        
        if not resolved_path.exists():
            error_msg = f"File does not exist: {resolved_path}"
            track_call("read_file", kwargs={"file_path": file_path, "encoding": actual_encoding}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "content": None,
                "file_info": format_file_info(resolved_path)
            }
        
        if not resolved_path.is_file():
            error_msg = f"Path is not a file: {resolved_path}"
            track_call("read_file", kwargs={"file_path": file_path, "encoding": actual_encoding}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "content": None,
                "file_info": format_file_info(resolved_path)
            }
        
        with open(resolved_path, 'r', encoding=actual_encoding) as file:
            content = file.read()
        
        result = {
            "success": True,
            "content": content,
            "file_info": format_file_info(resolved_path),
            "encoding": actual_encoding,
            "length": len(content)
        }
        
        track_call("read_file", kwargs={"file_path": file_path, "encoding": actual_encoding}, 
                  output=f"Read {len(content)} characters")
        return result
        
    except UnicodeDecodeError as e:
        error_msg = f"Encoding error reading file: {str(e)}"
        track_call("read_file", kwargs={"file_path": file_path, "encoding": actual_encoding}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "content": None,
            "file_info": format_file_info(resolve_path(file_path))
        }
    except Exception as e:
        error_msg = f"Failed to read file: {str(e)}"
        track_call("read_file", kwargs={"file_path": file_path, "encoding": actual_encoding}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "content": None,
            "file_info": format_file_info(resolve_path(file_path))
        }

@function_tool
def write_file(file_path: str, content: str, encoding: Optional[str] = None, 
               create_parents: Optional[bool] = None) -> Dict[str, Any]:
    """
    Writes content to a specified file. Creates the file and necessary parent directories if they don't exist.
    
    Args:
        file_path: Path to the file to write (relative or absolute)
        content: Content to write to the file
        encoding: Text encoding to use. If not specified, uses 'utf-8'
        create_parents: Whether to create parent directories. If not specified, uses True
        
    Returns:
        Dict containing the operation result and file metadata
    """
    actual_encoding = encoding if encoding is not None else 'utf-8'
    actual_create_parents = create_parents if create_parents is not None else True
    
    try:
        resolved_path = resolve_path(file_path)
        
        # Create parent directories if needed
        if actual_create_parents and resolved_path.parent != resolved_path:
            resolved_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(resolved_path, 'w', encoding=actual_encoding) as file:
            file.write(content)
        
        result = {
            "success": True,
            "message": f"Successfully wrote {len(content)} characters to file",
            "file_info": format_file_info(resolved_path),
            "encoding": actual_encoding,
            "content_length": len(content)
        }
        
        track_call("write_file", kwargs={
            "file_path": file_path, "encoding": actual_encoding, "create_parents": actual_create_parents
        }, output=f"Wrote {len(content)} characters")
        return result
        
    except PermissionError as e:
        error_msg = f"Permission denied writing to file: {str(e)}"
        track_call("write_file", kwargs={
            "file_path": file_path, "encoding": actual_encoding, "create_parents": actual_create_parents
        }, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "file_info": format_file_info(resolve_path(file_path))
        }
    except Exception as e:
        error_msg = f"Failed to write file: {str(e)}"
        track_call("write_file", kwargs={
            "file_path": file_path, "encoding": actual_encoding, "create_parents": actual_create_parents
        }, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "file_info": format_file_info(resolve_path(file_path))
        }

class FileUpdate(BaseModel):
    search: str
    replace: str

@function_tool
def update_file(file_path: str, updates: List[FileUpdate], use_regex: Optional[bool] = None,
                replace_all: Optional[bool] = None, encoding: Optional[str] = None) -> Dict[str, Any]:
    """
    Performs targeted search-and-replace operations within an existing file.
    
    Args:
        file_path: Path to the file to update (relative or absolute)
        updates: List of FileUpdate objects (search and replace strings)
        use_regex: Whether to treat search patterns as regular expressions. If not specified, uses False
        replace_all: Whether to replace all occurrences. If not specified, uses True
        encoding: Text encoding to use. If not specified, uses 'utf-8'
        
    Returns:
        Dict containing the operation result and change summary
    """
    actual_use_regex = use_regex if use_regex is not None else False
    actual_replace_all = replace_all if replace_all is not None else True
    actual_encoding = encoding if encoding is not None else 'utf-8'
    
    try:
        resolved_path = resolve_path(file_path)
        
        if not resolved_path.exists():
            error_msg = f"File does not exist: {resolved_path}"
            track_call("update_file", kwargs={
                "file_path": file_path, "updates": [u.dict() for u in updates], "use_regex": actual_use_regex,
                "replace_all": actual_replace_all, "encoding": actual_encoding
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "file_info": format_file_info(resolved_path)
            }
        
        if not resolved_path.is_file():
            error_msg = f"Path is not a file: {resolved_path}"
            track_call("update_file", kwargs={
                "file_path": file_path, "updates": [u.dict() for u in updates], "use_regex": actual_use_regex,
                "replace_all": actual_replace_all, "encoding": actual_encoding
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "file_info": format_file_info(resolved_path)
            }
        
        # Read the original content
        with open(resolved_path, 'r', encoding=actual_encoding) as file:
            original_content = file.read()
        
        updated_content = original_content
        changes_made = []
        
        # Apply each update
        for i, update in enumerate(updates):
            search_pattern = update.search
            replace_text = update.replace
            
            if actual_use_regex:
                if actual_replace_all:
                    new_content, count = re.subn(search_pattern, replace_text, updated_content)
                else:
                    new_content, count = re.subn(search_pattern, replace_text, updated_content, count=1)
            else:
                if actual_replace_all:
                    count = updated_content.count(search_pattern)
                    new_content = updated_content.replace(search_pattern, replace_text)
                else:
                    count = 1 if search_pattern in updated_content else 0
                    new_content = updated_content.replace(search_pattern, replace_text, 1)
            
            if count > 0:
                changes_made.append({
                    "update_index": i,
                    "search": search_pattern,
                    "replace": replace_text,
                    "occurrences_replaced": count
                })
                updated_content = new_content
        
        # Write the updated content back
        if updated_content != original_content:
            with open(resolved_path, 'w', encoding=actual_encoding) as file:
                file.write(updated_content)
        
        result = {
            "success": True,
            "message": f"Applied {len(changes_made)} updates to file",
            "changes_made": changes_made,
            "total_replacements": sum(change["occurrences_replaced"] for change in changes_made),
            "file_info": format_file_info(resolved_path),
            "content_changed": updated_content != original_content
        }
        
        track_call("update_file", kwargs={
            "file_path": file_path, "updates": [u.dict() for u in updates], "use_regex": actual_use_regex,
            "replace_all": actual_replace_all, "encoding": actual_encoding
        }, output=f"Applied {len(changes_made)} updates")
        return result
        
    except Exception as e:
        error_msg = f"Failed to update file: {str(e)}"
        track_call("update_file", kwargs={
            "file_path": file_path, "updates": [u.dict() for u in updates], "use_regex": actual_use_regex,
            "replace_all": actual_replace_all, "encoding": actual_encoding
        }, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "file_info": format_file_info(resolve_path(file_path))
        }

@function_tool
def list_files(directory_path: str, include_nested: Optional[bool] = None, 
               max_entries: Optional[int] = None, show_hidden: Optional[bool] = None) -> Dict[str, Any]:
    """
    Lists files and directories within a specified path.
    
    Args:
        directory_path: Path to the directory to list (relative or absolute)
        include_nested: Whether to include nested directories recursively. If not specified, uses False
        max_entries: Maximum number of entries to return. No limit if not specified
        show_hidden: Whether to show hidden files/directories. If not specified, uses False
        
    Returns:
        Dict containing the directory listing and metadata
    """
    actual_include_nested = include_nested if include_nested is not None else False
    actual_show_hidden = show_hidden if show_hidden is not None else False
    
    try:
        resolved_path = resolve_path(directory_path)
        
        if not resolved_path.exists():
            error_msg = f"Directory does not exist: {resolved_path}"
            track_call("list_files", kwargs={
                "directory_path": directory_path, "include_nested": actual_include_nested,
                "max_entries": max_entries, "show_hidden": actual_show_hidden
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        if not resolved_path.is_dir():
            error_msg = f"Path is not a directory: {resolved_path}"
            track_call("list_files", kwargs={
                "directory_path": directory_path, "include_nested": actual_include_nested,
                "max_entries": max_entries, "show_hidden": actual_show_hidden
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        entries = []
        entry_count = 0
        
        def should_include(path: Path) -> bool:
            if not actual_show_hidden and path.name.startswith('.'):
                return False
            return True
        
        if actual_include_nested:
            # Recursive listing
            for item in resolved_path.rglob('*'):
                if max_entries and entry_count >= max_entries:
                    break
                if should_include(item):
                    entries.append(format_file_info(item))
                    entry_count += 1
        else:
            # Non-recursive listing
            try:
                for item in resolved_path.iterdir():
                    if max_entries and entry_count >= max_entries:
                        break
                    if should_include(item):
                        entries.append(format_file_info(item))
                        entry_count += 1
            except PermissionError:
                error_msg = f"Permission denied accessing directory: {resolved_path}"
                track_call("list_files", kwargs={
                    "directory_path": directory_path, "include_nested": actual_include_nested,
                    "max_entries": max_entries, "show_hidden": actual_show_hidden
                }, error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "directory_info": format_file_info(resolved_path)
                }
        
        # Sort entries: directories first, then files, both alphabetically
        entries.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))
        
        result = {
            "success": True,
            "directory_info": format_file_info(resolved_path),
            "entries": entries,
            "total_entries": len(entries),
            "truncated": max_entries is not None and entry_count >= max_entries,
            "include_nested": actual_include_nested,
            "show_hidden": actual_show_hidden
        }
        
        track_call("list_files", kwargs={
            "directory_path": directory_path, "include_nested": actual_include_nested,
            "max_entries": max_entries, "show_hidden": actual_show_hidden
        }, output=f"Listed {len(entries)} entries")
        return result
        
    except Exception as e:
        error_msg = f"Failed to list directory: {str(e)}"
        track_call("list_files", kwargs={
            "directory_path": directory_path, "include_nested": actual_include_nested,
            "max_entries": max_entries, "show_hidden": actual_show_hidden
        }, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "directory_info": format_file_info(resolve_path(directory_path))
        }

@function_tool
def delete_file(file_path: str) -> Dict[str, Any]:
    """
    Permanently removes a specific file.
    
    Args:
        file_path: Path to the file to delete (relative or absolute)
        
    Returns:
        Dict containing the operation result
    """
    try:
        resolved_path = resolve_path(file_path)
        
        if not resolved_path.exists():
            error_msg = f"File does not exist: {resolved_path}"
            track_call("delete_file", kwargs={"file_path": file_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "file_info": format_file_info(resolved_path)
            }
        
        if not resolved_path.is_file():
            error_msg = f"Path is not a file: {resolved_path}"
            track_call("delete_file", kwargs={"file_path": file_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "file_info": format_file_info(resolved_path)
            }
        
        file_info_before = format_file_info(resolved_path)
        resolved_path.unlink()
        
        result = {
            "success": True,
            "message": f"Successfully deleted file: {resolved_path}",
            "deleted_file_info": file_info_before
        }
        
        track_call("delete_file", kwargs={"file_path": file_path}, output="File deleted successfully")
        return result
        
    except PermissionError as e:
        error_msg = f"Permission denied deleting file: {str(e)}"
        track_call("delete_file", kwargs={"file_path": file_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "file_info": format_file_info(resolve_path(file_path))
        }
    except Exception as e:
        error_msg = f"Failed to delete file: {str(e)}"
        track_call("delete_file", kwargs={"file_path": file_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "file_info": format_file_info(resolve_path(file_path))
        }

@function_tool
def delete_directory(directory_path: str, recursive: Optional[bool] = None) -> Dict[str, Any]:
    """
    Permanently removes a directory.
    
    Args:
        directory_path: Path to the directory to delete (relative or absolute)
        recursive: Whether to remove non-empty directories and their contents. If not specified, uses False
        
    Returns:
        Dict containing the operation result
    """
    actual_recursive = recursive if recursive is not None else False
    
    try:
        resolved_path = resolve_path(directory_path)
        
        if not resolved_path.exists():
            error_msg = f"Directory does not exist: {resolved_path}"
            track_call("delete_directory", kwargs={"directory_path": directory_path, "recursive": actual_recursive}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        if not resolved_path.is_dir():
            error_msg = f"Path is not a directory: {resolved_path}"
            track_call("delete_directory", kwargs={"directory_path": directory_path, "recursive": actual_recursive}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        directory_info_before = format_file_info(resolved_path)
        
        if actual_recursive:
            shutil.rmtree(resolved_path)
        else:
            resolved_path.rmdir()  # Only works on empty directories
        
        result = {
            "success": True,
            "message": f"Successfully deleted directory: {resolved_path}",
            "deleted_directory_info": directory_info_before,
            "recursive": actual_recursive
        }
        
        track_call("delete_directory", kwargs={"directory_path": directory_path, "recursive": actual_recursive}, 
                  output="Directory deleted successfully")
        return result
        
    except OSError as e:
        if "not empty" in str(e).lower():
            error_msg = f"Directory not empty (use recursive=True to force deletion): {str(e)}"
        else:
            error_msg = f"Failed to delete directory: {str(e)}"
        track_call("delete_directory", kwargs={"directory_path": directory_path, "recursive": actual_recursive}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "directory_info": format_file_info(resolve_path(directory_path))
        }
    except Exception as e:
        error_msg = f"Failed to delete directory: {str(e)}"
        track_call("delete_directory", kwargs={"directory_path": directory_path, "recursive": actual_recursive}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "directory_info": format_file_info(resolve_path(directory_path))
        }

@function_tool
def create_directory(directory_path: str, create_parents: Optional[bool] = None) -> Dict[str, Any]:
    """
    Creates a new directory at the specified path.
    
    Args:
        directory_path: Path where to create the directory (relative or absolute)
        create_parents: Whether to create parent directories. If not specified, uses True
        
    Returns:
        Dict containing the operation result
    """
    actual_create_parents = create_parents if create_parents is not None else True
    
    try:
        resolved_path = resolve_path(directory_path)
        
        if resolved_path.exists():
            if resolved_path.is_dir():
                result = {
                    "success": True,
                    "message": f"Directory already exists: {resolved_path}",
                    "directory_info": format_file_info(resolved_path),
                    "created": False
                }
                track_call("create_directory", kwargs={"directory_path": directory_path, "create_parents": actual_create_parents}, 
                          output="Directory already exists")
                return result
            else:
                error_msg = f"Path exists but is not a directory: {resolved_path}"
                track_call("create_directory", kwargs={"directory_path": directory_path, "create_parents": actual_create_parents}, 
                          error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "directory_info": format_file_info(resolved_path)
                }
        
        resolved_path.mkdir(parents=actual_create_parents, exist_ok=False)
        
        result = {
            "success": True,
            "message": f"Successfully created directory: {resolved_path}",
            "directory_info": format_file_info(resolved_path),
            "created": True,
            "create_parents": actual_create_parents
        }
        
        track_call("create_directory", kwargs={"directory_path": directory_path, "create_parents": actual_create_parents}, 
                  output="Directory created successfully")
        return result
        
    except FileExistsError:
        result = {
            "success": True,
            "message": f"Directory already exists: {resolved_path}",
            "directory_info": format_file_info(resolved_path),
            "created": False
        }
        track_call("create_directory", kwargs={"directory_path": directory_path, "create_parents": actual_create_parents}, 
                  output="Directory already exists")
        return result
    except PermissionError as e:
        error_msg = f"Permission denied creating directory: {str(e)}"
        track_call("create_directory", kwargs={"directory_path": directory_path, "create_parents": actual_create_parents}, 
                  error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "directory_info": format_file_info(resolve_path(directory_path))
        }
    except Exception as e:
        error_msg = f"Failed to create directory: {str(e)}"
        track_call("create_directory", kwargs={"directory_path": directory_path, "create_parents": actual_create_parents}, 
                  error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "directory_info": format_file_info(resolve_path(directory_path))
        }

@function_tool
def move_path(source_path: str, destination_path: str) -> Dict[str, Any]:
    """
    Moves or renames a file or directory from a source path to a destination path.
    
    Args:
        source_path: Source path (relative or absolute)
        destination_path: Destination path (relative or absolute)
        
    Returns:
        Dict containing the operation result
    """
    try:
        resolved_source = resolve_path(source_path)
        resolved_destination = resolve_path(destination_path)
        
        if not resolved_source.exists():
            error_msg = f"Source path does not exist: {resolved_source}"
            track_call("move_path", kwargs={"source_path": source_path, "destination_path": destination_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "source_info": format_file_info(resolved_source),
                "destination_info": format_file_info(resolved_destination)
            }
        
        if resolved_destination.exists():
            error_msg = f"Destination path already exists: {resolved_destination}"
            track_call("move_path", kwargs={"source_path": source_path, "destination_path": destination_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "source_info": format_file_info(resolved_source),
                "destination_info": format_file_info(resolved_destination)
            }
        
        source_info_before = format_file_info(resolved_source)
        
        # Create parent directories for destination if needed
        if resolved_destination.parent != resolved_destination:
            resolved_destination.parent.mkdir(parents=True, exist_ok=True)
        
        shutil.move(str(resolved_source), str(resolved_destination))
        
        result = {
            "success": True,
            "message": f"Successfully moved {resolved_source} to {resolved_destination}",
            "source_info": source_info_before,
            "destination_info": format_file_info(resolved_destination),
            "operation": "move"
        }
        
        track_call("move_path", kwargs={"source_path": source_path, "destination_path": destination_path}, 
                  output="Path moved successfully")
        return result
        
    except PermissionError as e:
        error_msg = f"Permission denied moving path: {str(e)}"
        track_call("move_path", kwargs={"source_path": source_path, "destination_path": destination_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "source_info": format_file_info(resolve_path(source_path)),
            "destination_info": format_file_info(resolve_path(destination_path))
        }
    except Exception as e:
        error_msg = f"Failed to move path: {str(e)}"
        track_call("move_path", kwargs={"source_path": source_path, "destination_path": destination_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "source_info": format_file_info(resolve_path(source_path)),
            "destination_info": format_file_info(resolve_path(destination_path))
        }

@function_tool
def copy_path(source_path: str, destination_path: str, recursive: Optional[bool] = None) -> Dict[str, Any]:
    """
    Copies a file or directory from a source path to a destination path.
    
    Args:
        source_path: Source path (relative or absolute)
        destination_path: Destination path (relative or absolute)
        recursive: Whether to copy directories recursively. If not specified, uses True
        
    Returns:
        Dict containing the operation result
    """
    actual_recursive = recursive if recursive is not None else True
    
    try:
        resolved_source = resolve_path(source_path)
        resolved_destination = resolve_path(destination_path)
        
        if not resolved_source.exists():
            error_msg = f"Source path does not exist: {resolved_source}"
            track_call("copy_path", kwargs={
                "source_path": source_path, "destination_path": destination_path, "recursive": actual_recursive
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "source_info": format_file_info(resolved_source),
                "destination_info": format_file_info(resolved_destination)
            }
        
        if resolved_destination.exists():
            error_msg = f"Destination path already exists: {resolved_destination}"
            track_call("copy_path", kwargs={
                "source_path": source_path, "destination_path": destination_path, "recursive": actual_recursive
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "source_info": format_file_info(resolved_source),
                "destination_info": format_file_info(resolved_destination)
            }
        
        source_info_before = format_file_info(resolved_source)
        
        # Create parent directories for destination if needed
        if resolved_destination.parent != resolved_destination:
            resolved_destination.parent.mkdir(parents=True, exist_ok=True)
        
        if resolved_source.is_file():
            shutil.copy2(str(resolved_source), str(resolved_destination))
        elif resolved_source.is_dir():
            if actual_recursive:
                shutil.copytree(str(resolved_source), str(resolved_destination))
            else:
                error_msg = f"Source is a directory but recursive=False: {resolved_source}"
                track_call("copy_path", kwargs={
                    "source_path": source_path, "destination_path": destination_path, "recursive": actual_recursive
                }, error=error_msg)
                return {
                    "success": False,
                    "error": error_msg,
                    "source_info": source_info_before,
                    "destination_info": format_file_info(resolved_destination)
                }
        
        result = {
            "success": True,
            "message": f"Successfully copied {resolved_source} to {resolved_destination}",
            "source_info": source_info_before,
            "destination_info": format_file_info(resolved_destination),
            "operation": "copy",
            "recursive": actual_recursive
        }
        
        track_call("copy_path", kwargs={
            "source_path": source_path, "destination_path": destination_path, "recursive": actual_recursive
        }, output="Path copied successfully")
        return result
        
    except PermissionError as e:
        error_msg = f"Permission denied copying path: {str(e)}"
        track_call("copy_path", kwargs={
            "source_path": source_path, "destination_path": destination_path, "recursive": actual_recursive
        }, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "source_info": format_file_info(resolve_path(source_path)),
            "destination_info": format_file_info(resolve_path(destination_path))
        }
    except Exception as e:
        error_msg = f"Failed to copy path: {str(e)}"
        track_call("copy_path", kwargs={
            "source_path": source_path, "destination_path": destination_path, "recursive": actual_recursive
        }, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "source_info": format_file_info(resolve_path(source_path)),
            "destination_info": format_file_info(resolve_path(destination_path))
        }

@function_tool
def get_file_info(file_path: str) -> Dict[str, Any]:
    """
    Gets detailed information about a file or directory.
    
    Args:
        file_path: Path to the file or directory (relative or absolute)
        
    Returns:
        Dict containing detailed file/directory information
    """
    try:
        resolved_path = resolve_path(file_path)
        file_info = format_file_info(resolved_path)
        
        # Add additional information if file exists
        if resolved_path.exists():
            try:
                # Add file size in human readable format
                if file_info["size"] is not None:
                    size_bytes = file_info["size"]
                    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                        if size_bytes < 1024.0:
                            file_info["size_human"] = f"{size_bytes:.1f} {unit}"
                            break
                        size_bytes /= 1024.0
                
                # Add absolute path
                file_info["absolute_path"] = str(resolved_path.resolve())
                
                # Add parent directory
                if resolved_path.parent != resolved_path:
                    file_info["parent_directory"] = str(resolved_path.parent)
                
                # For directories, add entry count
                if resolved_path.is_dir():
                    try:
                        entry_count = len(list(resolved_path.iterdir()))
                        file_info["entry_count"] = entry_count
                    except PermissionError:
                        file_info["entry_count"] = "Permission denied"
                
            except Exception as e:
                file_info["additional_info_error"] = str(e)
        
        result = {
            "success": True,
            "file_info": file_info
        }
        
        track_call("get_file_info", kwargs={"file_path": file_path}, output="File info retrieved")
        return result
        
    except Exception as e:
        error_msg = f"Failed to get file info: {str(e)}"
        track_call("get_file_info", kwargs={"file_path": file_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "file_info": format_file_info(resolve_path(file_path))
        }

@function_tool
def find_files(directory_path: str, pattern: str, use_regex: Optional[bool] = None, 
               include_directories: Optional[bool] = None, max_results: Optional[int] = None) -> Dict[str, Any]:
    """
    Searches for files and directories matching a pattern.
    
    Args:
        directory_path: Directory to search in (relative or absolute)
        pattern: Search pattern (glob pattern or regex if use_regex=True)
        use_regex: Whether to treat pattern as regex. If not specified, uses False (glob pattern)
        include_directories: Whether to include directories in results. If not specified, uses True
        max_results: Maximum number of results to return
        
    Returns:
        Dict containing search results
    """
    actual_use_regex = use_regex if use_regex is not None else False
    actual_include_directories = include_directories if include_directories is not None else True
    
    try:
        resolved_path = resolve_path(directory_path)
        
        if not resolved_path.exists():
            error_msg = f"Directory does not exist: {resolved_path}"
            track_call("find_files", kwargs={
                "directory_path": directory_path, "pattern": pattern, "use_regex": actual_use_regex,
                "include_directories": actual_include_directories, "max_results": max_results
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        if not resolved_path.is_dir():
            error_msg = f"Path is not a directory: {resolved_path}"
            track_call("find_files", kwargs={
                "directory_path": directory_path, "pattern": pattern, "use_regex": actual_use_regex,
                "include_directories": actual_include_directories, "max_results": max_results
            }, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        matches = []
        result_count = 0
        
        if actual_use_regex:
            # Use regex pattern
            regex_pattern = re.compile(pattern)
            
            for item in resolved_path.rglob('*'):
                if max_results and result_count >= max_results:
                    break
                    
                if not actual_include_directories and item.is_dir():
                    continue
                    
                if regex_pattern.search(item.name):
                    matches.append(format_file_info(item))
                    result_count += 1
        else:
            # Use glob pattern
            for item in resolved_path.rglob(pattern):
                if max_results and result_count >= max_results:
                    break
                    
                if not actual_include_directories and item.is_dir():
                    continue
                    
                matches.append(format_file_info(item))
                result_count += 1
        
        result = {
            "success": True,
            "directory_info": format_file_info(resolved_path),
            "matches": matches,
            "total_matches": len(matches),
            "pattern": pattern,
            "use_regex": actual_use_regex,
            "include_directories": actual_include_directories,
            "truncated": max_results is not None and result_count >= max_results
        }
        
        track_call("find_files", kwargs={
            "directory_path": directory_path, "pattern": pattern, "use_regex": actual_use_regex,
            "include_directories": actual_include_directories, "max_results": max_results
        }, output=f"Found {len(matches)} matches")
        return result
        
    except Exception as e:
        error_msg = f"Failed to search files: {str(e)}"
        track_call("find_files", kwargs={
            "directory_path": directory_path, "pattern": pattern, "use_regex": actual_use_regex,
            "include_directories": actual_include_directories, "max_results": max_results
        }, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "directory_info": format_file_info(resolve_path(directory_path))
        }

@function_tool
def get_current_directory() -> Dict[str, Any]:
    """
    Gets the current working directory and default filesystem path.
    
    Returns:
        Dict containing current directory information
    """
    try:
        current_dir = Path.cwd()
        
        result = {
            "success": True,
            "current_working_directory": str(current_dir),
            "default_filesystem_path": _default_filesystem_path,
            "current_directory_info": format_file_info(current_dir)
        }
        
        track_call("get_current_directory", output="Current directory retrieved")
        return result
        
    except Exception as e:
        error_msg = f"Failed to get current directory: {str(e)}"
        track_call("get_current_directory", error=error_msg)
        return {
            "success": False,
            "error": error_msg
        }

@function_tool
def check_path_exists(file_path: str) -> Dict[str, Any]:
    """
    Checks if a path exists and returns basic information.
    
    Args:
        file_path: Path to check (relative or absolute)
        
    Returns:
        Dict containing existence check result
    """
    try:
        resolved_path = resolve_path(file_path)
        
        result = {
            "success": True,
            "path": str(resolved_path),
            "exists": resolved_path.exists(),
            "is_file": resolved_path.is_file() if resolved_path.exists() else None,
            "is_directory": resolved_path.is_dir() if resolved_path.exists() else None,
            "is_symlink": resolved_path.is_symlink() if resolved_path.exists() else None,
            "file_info": format_file_info(resolved_path) if resolved_path.exists() else None
        }
        
        track_call("check_path_exists", kwargs={"file_path": file_path}, 
                  output=f"Path exists: {result['exists']}")
        return result
        
    except Exception as e:
        error_msg = f"Failed to check path existence: {str(e)}"
        track_call("check_path_exists", kwargs={"file_path": file_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "path": str(resolve_path(file_path))
        }

@function_tool
def get_disk_usage(directory_path: str) -> Dict[str, Any]:
    """
    Gets disk usage information for a directory.
    
    Args:
        directory_path: Path to the directory (relative or absolute)
        
    Returns:
        Dict containing disk usage information
    """
    try:
        resolved_path = resolve_path(directory_path)
        
        if not resolved_path.exists():
            error_msg = f"Directory does not exist: {resolved_path}"
            track_call("get_disk_usage", kwargs={"directory_path": directory_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        if not resolved_path.is_dir():
            error_msg = f"Path is not a directory: {resolved_path}"
            track_call("get_disk_usage", kwargs={"directory_path": directory_path}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "directory_info": format_file_info(resolved_path)
            }
        
        usage = shutil.disk_usage(resolved_path)
        
        def format_bytes(bytes_value):
            for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                if bytes_value < 1024.0:
                    return f"{bytes_value:.1f} {unit}"
                bytes_value /= 1024.0
            return f"{bytes_value:.1f} PB"
        
        result = {
            "success": True,
            "directory_info": format_file_info(resolved_path),
            "total_space": usage.total,
            "used_space": usage.used,
            "free_space": usage.free,
            "total_space_human": format_bytes(usage.total),
            "used_space_human": format_bytes(usage.used),
            "free_space_human": format_bytes(usage.free),
            "usage_percentage": round((usage.used / usage.total) * 100, 2)
        }
        
        track_call("get_disk_usage", kwargs={"directory_path": directory_path}, 
                  output=f"Usage: {result['usage_percentage']}%")
        return result
        
    except Exception as e:
        error_msg = f"Failed to get disk usage: {str(e)}"
        track_call("get_disk_usage", kwargs={"directory_path": directory_path}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "directory_info": format_file_info(resolve_path(directory_path))
        }

@function_tool
def watch_file_changes(file_path: str, check_interval: Optional[int] = None) -> Dict[str, Any]:
    """
    Monitors a file for changes and returns current state information.
    
    Args:
        file_path: Path to the file to monitor (relative or absolute)
        check_interval: Interval in seconds for checking changes. If not specified, uses 1
        
    Returns:
        Dict containing file monitoring information
    """
    actual_check_interval = check_interval if check_interval is not None else 1
    
    try:
        resolved_path = resolve_path(file_path)
        
        if not resolved_path.exists():
            error_msg = f"File does not exist: {resolved_path}"
            track_call("watch_file_changes", kwargs={"file_path": file_path, "check_interval": actual_check_interval}, error=error_msg)
            return {
                "success": False,
                "error": error_msg,
                "file_info": format_file_info(resolved_path)
            }
        
        file_info = format_file_info(resolved_path)
        
        result = {
            "success": True,
            "message": f"File monitoring setup for: {resolved_path}",
            "file_info": file_info,
            "check_interval": actual_check_interval,
            "last_modified": file_info["modified"],
            "monitoring_active": True
        }
        
        track_call("watch_file_changes", kwargs={"file_path": file_path, "check_interval": actual_check_interval}, 
                  output="File monitoring setup")
        return result
        
    except Exception as e:
        error_msg = f"Failed to setup file monitoring: {str(e)}"
        track_call("watch_file_changes", kwargs={"file_path": file_path, "check_interval": actual_check_interval}, error=error_msg)
        return {
            "success": False,
            "error": error_msg,
            "file_info": format_file_info(resolve_path(file_path))
        }

# Read-only operations - allowed in recon mode
filesystem_read_tools = [
    read_file,
    list_files,
    get_file_info,
    find_files,
    get_current_directory,
    check_path_exists,
    get_disk_usage,
    watch_file_changes
]

# Action/modification operations - only allowed when recon mode is off
filesystem_action_tools = [
    set_filesystem_default,
    write_file,
    update_file,
    delete_file,
    delete_directory,
    create_directory,
    move_path,
    copy_path
]

# Combined tools based on recon mode
def get_filesystem_tools():
    try:
        from config.config import get_recon_mode
        if get_recon_mode():
            return filesystem_read_tools
        else:
            return filesystem_read_tools + filesystem_action_tools
    except ImportError:
        # Fallback if config module not available
        return filesystem_read_tools + filesystem_action_tools

# For backward compatibility
filesystem_tools = get_filesystem_tools()