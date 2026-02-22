import asyncio
import json
import logging
import os
import shutil
from typing import Dict, List, Optional, Any, Tuple
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MCPServer:
    """Represents a single MCP server connection."""
    
    def __init__(self, name: str, config: Dict[str, Any]) -> None:
        """Initialize an MCP server connection.
        
        Args:
            name: Name of the server
            config: Server configuration dictionary
        """
        self.name = name
        self.config = config
        self.transport_type = config.get("transport", "stdio")
        self.stdio_context = None
        self.session: Optional[ClientSession] = None
        self._cleanup_lock = asyncio.Lock()
        self.capabilities: Optional[Dict[str, Any]] = None
        self.status = "disconnected"
        self.tools_cache = None
        self.tools_last_updated = None

    async def initialize(self) -> bool:
        """Initialize the server connection.
        
        Returns:
            bool: True if successfully initialized, False otherwise
        """
        try:
            if self.transport_type == "stdio":
                await self._initialize_stdio()
            elif self.transport_type == "sse":
                await self._initialize_sse()
            else:
                logger.error(f"Unsupported transport type for {self.name}: {self.transport_type}")
                self.status = "error"
                return False
            
            self.status = "connected"
            return True
        except Exception as e:
            logger.error(f"Error initializing server {self.name}: {e}")
            self.status = "error"
            await self.cleanup()
            return False

    async def _initialize_stdio(self) -> None:
        """Initialize a stdio connection."""
        command = self.config.get('command')
        if not command:
            raise ValueError(f"Missing 'command' in server configuration for {self.name}")
        
        # Handle npx and similar command wrappers
        if command == "npx":
            command = shutil.which("npx")
        
        server_params = StdioServerParameters(
            command=command,
            args=self.config.get('args', []),
            env={**os.environ, **self.config.get('env', {})} if self.config.get('env') else None
        )
        
        self.stdio_context = stdio_client(server_params)
        read, write = await self.stdio_context.__aenter__()
        self.session = ClientSession(read, write)
        await self.session.__aenter__()
        self.capabilities = await self.session.initialize()

    async def _initialize_sse(self) -> None:
        """Initialize an SSE connection."""
        url = self.config.get('url')
        if not url:
            raise ValueError(f"Missing 'url' in server configuration for {self.name}")
        
        headers = self.config.get('headers')
        timeout = self.config.get('timeout', 5)
        sse_read_timeout = self.config.get('sse_read_timeout', 300)
        
        self.stdio_context = sse_client(url, headers, timeout, sse_read_timeout)
        read, write = await self.stdio_context.__aenter__()
        self.session = ClientSession(read, write)
        await self.session.__aenter__()
        self.capabilities = await self.session.initialize()

    async def list_tools(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """List available tools from the server.
        
        Args:
            force_refresh: Whether to force a refresh of the tools list
            
        Returns:
            A list of available tools
            
        Raises:
            RuntimeError: If the server is not initialized
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")
        
        # Use cached tools if available and not forcing a refresh
        if self.tools_cache is not None and not force_refresh:
            return self.tools_cache
        
        try:
            tools_response = await self.session.list_tools()
            tools = []
            
            for tool in tools_response.tools:
                tool_info = {
                    "name": tool.name,
                    "description": tool.description or "",
                    "inputSchema": tool.inputSchema,
                }
                
                if hasattr(tool, 'annotations') and tool.annotations:
                    tool_info["annotations"] = tool.annotations
                    
                tools.append(tool_info)
            
            # Cache the tools
            self.tools_cache = tools
            import time
            self.tools_last_updated = time.time()
            
            return tools
        except Exception as e:
            logger.error(f"Error listing tools for {self.name}: {e}")
            # Set status to error if we couldn't list tools
            self.status = "error"
            return []

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call a tool on the server.
        
        Args:
            tool_name: Name of the tool to call
            arguments: Arguments to pass to the tool
            
        Returns:
            The result of the tool call
            
        Raises:
            RuntimeError: If the server is not initialized
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")
        
        try:
            result = await self.session.call_tool(tool_name, arguments)
            return result
        except Exception as e:
            logger.error(f"Error calling tool {tool_name} on {self.name}: {e}")
            raise

    async def cleanup(self) -> None:
        """Clean up server resources."""
        async with self._cleanup_lock:
            try:
                if self.session:
                    try:
                        await self.session.__aexit__(None, None, None)
                    except Exception as e:
                        logger.warning(f"Warning during session cleanup for {self.name}: {e}")
                    finally:
                        self.session = None

                if self.stdio_context:
                    try:
                        await self.stdio_context.__aexit__(None, None, None)
                    except Exception as e:
                        logger.warning(f"Warning during context cleanup for {self.name}: {e}")
                    finally:
                        self.stdio_context = None
                        
                self.status = "disconnected"
            except Exception as e:
                logger.error(f"Error during cleanup of server {self.name}: {e}")

    def get_status_info(self) -> Dict[str, Any]:
        """Get status information about this server.
        
        Returns:
            Dictionary with server status information
        """
        return {
            "name": self.name,
            "status": self.status,
            "transport": self.transport_type,
            "toolsCount": len(self.tools_cache) if self.tools_cache else 0,
            "connected": self.status == "connected",
            "lastUpdated": self.tools_last_updated
        }


class MCPClient:
    """Client for managing multiple MCP server connections."""
    
    def __init__(self, config: Dict[str, Any] = None) -> None:
        """Initialize the MCP client.
        
        Args:
            config: MCP configuration dictionary with server definitions
        """
        self.config = config or {}
        self.servers: Dict[str, MCPServer] = {}
        self.exit_stack = AsyncExitStack()
        self._initialization_lock = asyncio.Lock()
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize all servers from configuration."""
        async with self._initialization_lock:
            if self._initialized:
                return
                
            if not self.config or "mcpServers" not in self.config:
                logger.warning("No MCP servers configured")
                self._initialized = True
                return
                
            server_configs = self.config.get("mcpServers", {})
            for name, config in server_configs.items():
                server = MCPServer(name, config)
                self.servers[name] = server
                
            # Don't automatically connect to all servers - we'll connect on-demand
            # This prevents long startup times when there are many servers
            self._initialized = True

    async def connect_to_server(self, server_name: str) -> bool:
        """Connect to a specific server.
        
        Args:
            server_name: Name of the server to connect to
            
        Returns:
            True if successfully connected, False otherwise
        """
        if not self._initialized:
            await self.initialize()
            
        if server_name not in self.servers:
            logger.error(f"Server {server_name} not found in configuration")
            return False
            
        server = self.servers[server_name]
        if server.status == "connected":
            return True
            
        return await server.initialize()

    async def ensure_server_connected(self, server_name: str) -> bool:
        """Ensure a server is connected, connecting if necessary.
        
        Args:
            server_name: Name of the server
            
        Returns:
            True if connected, False otherwise
        """
        if not self._initialized:
            await self.initialize()
            
        if server_name not in self.servers:
            logger.error(f"Server {server_name} not found in configuration")
            return False
            
        server = self.servers[server_name]
        if server.status == "connected":
            return True
            
        return await server.initialize()

    async def get_server_status(self, server_name: str = None, try_connect: bool = False) -> List[Dict[str, Any]]:
        """Get status information for servers.
        
        Args:
            server_name: Optional name of a specific server to get status for
            try_connect: Whether to try connecting to disconnected servers
            
        Returns:
            List of server status dictionaries
        """
        if not self._initialized:
            await self.initialize()
            
        if server_name:
            if server_name not in self.servers:
                return []
            
            server = self.servers[server_name]
            if try_connect and server.status != "connected":
                await server.initialize()
            
            return [self._format_server_info(server)]
            
        result = []
        for server in self.servers.values():
            if try_connect and server.status != "connected":
                await server.initialize()
            
            result.append(self._format_server_info(server))
        
        return result
    
    def _format_server_info(self, server: MCPServer) -> Dict[str, Any]:
        """Format server information according to the desired schema."""
        info = {
            "name": server.name,
            "type": server.transport_type,
            "connected": server.status == "connected",
            "tools_count": len(server.tools_cache) if server.tools_cache else 0,
            "error": None
        }
        
        # Add transport-specific fields
        if server.transport_type == "sse" and "url" in server.config:
            info["url"] = server.config["url"]
        elif server.transport_type == "stdio":
            if "command" in server.config:
                info["command"] = server.config["command"]
            if "args" in server.config:
                info["args"] = server.config["args"]
            if "env" in server.config:
                info["env"] = server.config["env"]
        
        # Add error if any
        if server.status == "error":
            info["error"] = "Failed to connect to server"
            
        return info

    async def list_all_tools(self) -> List[Dict[str, Any]]:
        """List all tools from all servers.
        
        Returns:
            List of tools with server information
        """
        if not self._initialized:
            await self.initialize()
            
        all_tools = []
        for server_name, server in self.servers.items():
            # Try to connect if not already connected
            if server.status != "connected":
                connected = await server.initialize()
                if not connected:
                    continue
                    
            tools = await server.list_tools()
            for tool in tools:
                all_tools.append({
                    "server": server_name,
                    "serverTransport": server.transport_type,
                    **tool
                })
                
        return all_tools

    async def list_server_tools(self, server_name: str) -> List[Dict[str, Any]]:
        """List tools for a specific server.
        
        Args:
            server_name: Name of the server
            
        Returns:
            List of tools for the specified server
        """
        if not self._initialized:
            await self.initialize()
            
        if server_name not in self.servers:
            logger.error(f"Server {server_name} not found in configuration")
            return []
            
        server = self.servers[server_name]
        if server.status != "connected":
            connected = await server.initialize()
            if not connected:
                return []
                
        tools = await server.list_tools()
        return tools

    async def call_tool(self, server_name: str, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call a tool on a specific server.
        
        Args:
            server_name: Name of the server
            tool_name: Name of the tool
            arguments: Arguments to pass to the tool
            
        Returns:
            Result of the tool call
            
        Raises:
            ValueError: If the server is not found
            RuntimeError: If the server is not connected
        """
        if not self._initialized:
            await self.initialize()
            
        if server_name not in self.servers:
            raise ValueError(f"Server {server_name} not found in configuration")
            
        server = self.servers[server_name]
        if server.status != "connected":
            connected = await server.initialize()
            if not connected:
                raise RuntimeError(f"Server {server_name} is not connected")
                
        return await server.call_tool(tool_name, arguments)

    async def cleanup(self) -> None:
        """Clean up all server connections."""
        cleanup_tasks = []
        for server in self.servers.values():
            if server.status == "connected":
                cleanup_tasks.append(asyncio.create_task(server.cleanup()))
                
        if cleanup_tasks:
            await asyncio.gather(*cleanup_tasks, return_exceptions=True)

    async def __aenter__(self) -> "MCPClient":
        """Enter async context manager."""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Exit async context manager."""
        await self.cleanup()