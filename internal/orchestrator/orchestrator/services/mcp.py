import logging
import os
from typing import Dict, List, Optional, Any
import asyncio

from orchestrator.tools.mcp import MCPClient

# Configure logging
logger = logging.getLogger(__name__)

# Global MCP client instance - lazy initialized
_mcp_client: Optional[MCPClient] = None
# Flag to indicate if client needs to be reset
_client_reset_needed = False

def get_mcp_client() -> MCPClient:
    """Get or create the MCP client instance."""
    global _mcp_client, _client_reset_needed
    if _client_reset_needed:
        logger.info("MCP client reset required, will be reset on next async operation")
    if _mcp_client is None:
        from config.config import get_mcp_config
        _mcp_client = MCPClient(get_mcp_config())
    return _mcp_client

def set_client_reset_flag():
    """Set flag to reset client on next async operation."""
    global _client_reset_needed
    _client_reset_needed = True
    logger.info("MCP client reset flag has been set")

class MCPService:
    """Service for interacting with MCP servers."""
    
    @staticmethod
    async def list_servers(try_connect: bool = True) -> List[Dict[str, Any]]:
        """List all configured MCP servers with status information."""
        await MCPService._check_reset_client()
        client = get_mcp_client()
        await client.initialize()
        
        # Get server status
        server_status = await client.get_server_status(try_connect=try_connect)
        
        # Add enabled field from config to each server
        from config.config import get_mcp_config
        mcp_config = get_mcp_config()
        
        for server in server_status:
            server_name = server.get('name', '')
            if mcp_config and "mcpServers" in mcp_config and server_name in mcp_config["mcpServers"]:
                server['enabled'] = mcp_config["mcpServers"][server_name].get('enabled', True)
            else:
                server['enabled'] = True  # Default to enabled if not found
        
        return server_status
    
    @staticmethod
    async def get_server_status(server_name: str) -> Dict[str, Any]:
        """Get status information for a specific server."""
        await MCPService._check_reset_client()
        client = get_mcp_client()
        await client.initialize()
        status_list = await client.get_server_status(server_name)
        if not status_list:
            raise ValueError(f"Server '{server_name}' not found")
        return status_list[0]
    
    @staticmethod
    async def list_all_tools(force_refresh: bool = False) -> List[Dict[str, Any]]:
        """List all tools from all connected servers."""
        await MCPService._check_reset_client()
        client = get_mcp_client()
        await client.initialize()
        return await client.list_all_tools()
    
    @staticmethod
    async def list_server_tools(server_name: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """List tools for a specific server."""
        await MCPService._check_reset_client()
        client = get_mcp_client()
        await client.initialize()
        return await client.list_server_tools(server_name)
    
    @staticmethod
    async def call_tool(server_name: str, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call a tool on a specific server."""
        await MCPService._check_reset_client()
        client = get_mcp_client()
        await client.initialize()
        return await client.call_tool(server_name, tool_name, arguments)
    
    @staticmethod
    async def connect_to_server(server_name: str) -> bool:
        """Connect to a specific server."""
        await MCPService._check_reset_client()
        client = get_mcp_client()
        await client.initialize()
        return await client.connect_to_server(server_name)
    
    @staticmethod
    async def _check_reset_client():
        """Check if client reset is needed and perform reset."""
        global _mcp_client, _client_reset_needed
        if _client_reset_needed and _mcp_client is not None:
            logger.info("Resetting MCP client due to configuration change")
            await _mcp_client.cleanup()
            _mcp_client = None
            _client_reset_needed = False
    
    @staticmethod
    async def reset_client():
        """Reset the MCP client to force reconnection with new configuration."""
        global _mcp_client
        if _mcp_client is not None:
            logger.info("Explicitly resetting MCP client")
            await _mcp_client.cleanup()
            _mcp_client = None