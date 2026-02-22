from __future__ import annotations

import abc
import asyncio
from contextlib import AbstractAsyncContextManager, AsyncExitStack
from datetime import timedelta
from pathlib import Path
from typing import Any, Literal

from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from mcp import ClientSession, StdioServerParameters, Tool as MCPTool, stdio_client
from mcp.client.sse import sse_client
from mcp.client.streamable_http import GetSessionIdCallback, streamablehttp_client
from mcp.shared.message import SessionMessage
from mcp.types import CallToolResult, InitializeResult
from typing_extensions import NotRequired, TypedDict
import warnings


class MCPServerError(Exception):
    """Exception raised for MCP server errors."""
    pass


class MCPServer(abc.ABC):
    """Base class for Model Context Protocol servers."""

    @abc.abstractmethod
    async def connect(self):
        """Connect to the server."""
        pass

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """A readable name for the server."""
        pass

    @abc.abstractmethod
    async def cleanup(self):
        """Cleanup the server."""
        self.session = None
        print(f"Cleaned up MCP server: {getattr(self, '_name', 'unknown')}")

    @abc.abstractmethod
    async def list_tools(self) -> list[MCPTool]:
        """List the tools available on the server."""
        pass

    @abc.abstractmethod
    async def call_tool(self, tool_name: str, arguments: dict[str, Any] | None) -> CallToolResult:
        """Invoke a tool on the server."""
        pass


class _MCPServerWithClientSession(MCPServer, abc.ABC):
    """Base class for MCP servers that use a `ClientSession` to communicate with the server."""

    def __init__(self, cache_tools_list: bool, client_session_timeout_seconds: float | None):
        self.session: ClientSession | None = None
        self.exit_stack: AsyncExitStack = AsyncExitStack()
        self._cleanup_lock: asyncio.Lock = asyncio.Lock()
        self.cache_tools_list = cache_tools_list
        self.server_initialize_result: InitializeResult | None = None
        self.client_session_timeout_seconds = client_session_timeout_seconds
        
        # Cache management
        self._cache_dirty = True
        self._tools_list: list[MCPTool] | None = None

    @abc.abstractmethod
    def create_streams(
        self,
    ) -> AbstractAsyncContextManager[
        tuple[
            MemoryObjectReceiveStream[SessionMessage | Exception],
            MemoryObjectSendStream[SessionMessage],
            GetSessionIdCallback | None
        ]
    ]:
        """Create the streams for the server."""
        pass

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        await self.cleanup()

    def invalidate_tools_cache(self):
        """Invalidate the tools cache."""
        self._cache_dirty = True

    async def connect(self):
        """Connect to the server."""
        try:
            transport = await self.exit_stack.enter_async_context(self.create_streams())
            read, write, *_ = transport

            session = await self.exit_stack.enter_async_context(
                ClientSession(
                    read,
                    write,
                    timedelta(seconds=self.client_session_timeout_seconds)
                    if self.client_session_timeout_seconds
                    else None,
                )
            )
            server_result = await session.initialize()
            self.server_initialize_result = server_result
            self.session = session
        except Exception as e:
            print(f"Error initializing MCP server: {e}")
            await self.cleanup()
            raise MCPServerError(f"Failed to connect to MCP server: {e}")

    async def list_tools(self) -> list[MCPTool]:
        """List the tools available on the server."""
        if not self.session:
            raise MCPServerError("Server not initialized. Make sure you call `connect()` first.")

        # Return from cache if caching is enabled, we have tools, and the cache is not dirty
        if self.cache_tools_list and not self._cache_dirty and self._tools_list:
            return self._tools_list

        # Reset the cache dirty to False
        self._cache_dirty = False

        # Fetch the tools from the server
        self._tools_list = (await self.session.list_tools()).tools
        return self._tools_list

    async def call_tool(self, tool_name: str, arguments: dict[str, Any] | None) -> CallToolResult:
        """Invoke a tool on the server."""
        if not self.session:
            raise MCPServerError("Server not initialized. Make sure you call `connect()` first.")

        return await self.session.call_tool(tool_name, arguments)

    async def cleanup(self):
        """Cleanup the server."""
        async with self._cleanup_lock:
            try:
                # Close session first
                self.session = None

                # Properly close the exit stack
                if hasattr(self, 'exit_stack') and self.exit_stack:
                    print(f"Starting cleanup of MCP server: {self.name}")

                    # Close the exit stack which triggers subprocess termination
                    await self.exit_stack.aclose()
                    print(f"Exit stack closed for MCP server: {self.name}")

                    # Wait briefly for subprocess termination to complete
                    # The MCP SDK waits up to 2 seconds for graceful exit before SIGTERM/SIGKILL
                    try:
                        await asyncio.wait_for(asyncio.sleep(2.5), timeout=3.0)
                    except asyncio.TimeoutError:
                        print(f"Timeout waiting for subprocess termination: {self.name}")

                    # Create a new exit stack for potential reconnection
                    self.exit_stack = AsyncExitStack()
            except Exception as e:
                print(f"Error cleaning up server {self.name}: {e}")
                import traceback
                traceback.print_exc()
            finally:
                self.session = None


class MCPServerStdioParams(TypedDict):
    """Parameters for stdio MCP server connection."""
    command: str
    args: NotRequired[list[str]]
    env: NotRequired[dict[str, str]]
    cwd: NotRequired[str | Path]
    encoding: NotRequired[str]
    encoding_error_handler: NotRequired[Literal["strict", "ignore", "replace"]]


class MCPServerStdio(_MCPServerWithClientSession):
    """MCP server implementation that uses the stdio transport."""

    def __init__(
        self,
        params: MCPServerStdioParams,
        cache_tools_list: bool = False,
        name: str | None = None,
        client_session_timeout_seconds: float | None = 30,
    ):
        super().__init__(cache_tools_list, client_session_timeout_seconds)

        self.params = StdioServerParameters(
            command=params["command"],
            args=params.get("args", []),
            env=params.get("env"),
            cwd=params.get("cwd"),
            encoding=params.get("encoding", "utf-8"),
            encoding_error_handler=params.get("encoding_error_handler", "strict"),
        )

        self._name = name or f"stdio: {self.params.command}"

    def create_streams(
        self,
    ) -> AbstractAsyncContextManager[
        tuple[
            MemoryObjectReceiveStream[SessionMessage | Exception],
            MemoryObjectSendStream[SessionMessage],
            GetSessionIdCallback | None
        ]
    ]:
        """Create the streams for the server."""
        return stdio_client(self.params)

    @property
    def name(self) -> str:
        """A readable name for the server."""
        return self._name


class MCPServerSseParams(TypedDict):
    """Parameters for SSE MCP server connection."""
    url: str
    headers: NotRequired[dict[str, str]]
    timeout: NotRequired[float]
    sse_read_timeout: NotRequired[float]


class MCPServerSse(_MCPServerWithClientSession):
    """MCP server implementation that uses the HTTP with SSE transport."""

    def __init__(
        self,
        params: MCPServerSseParams,
        cache_tools_list: bool = False,
        name: str | None = None,
        client_session_timeout_seconds: float | None = 5,
    ):
        super().__init__(cache_tools_list, client_session_timeout_seconds)
        self.params = params
        self._name = name or f"sse: {self.params['url']}"

    def create_streams(
        self,
    ) -> AbstractAsyncContextManager[
        tuple[
            MemoryObjectReceiveStream[SessionMessage | Exception],
            MemoryObjectSendStream[SessionMessage],
            GetSessionIdCallback | None
        ]
    ]:
        """Create the streams for the server."""
        return sse_client(
            url=self.params["url"],
            headers=self.params.get("headers", None),
            timeout=self.params.get("timeout", 5),
            sse_read_timeout=self.params.get("sse_read_timeout", 60 * 5),
        )

    @property
    def name(self) -> str:
        """A readable name for the server."""
        return self._name


class MCPServerStreamableHttpParams(TypedDict):
    """Parameters for Streamable HTTP MCP server connection."""
    url: str
    headers: NotRequired[dict[str, str]]
    timeout: NotRequired[timedelta]
    sse_read_timeout: NotRequired[timedelta]
    terminate_on_close: NotRequired[bool]


class MCPServerStreamableHttp(_MCPServerWithClientSession):
    """MCP server implementation that uses the Streamable HTTP transport."""

    def __init__(
        self,
        params: MCPServerStreamableHttpParams,
        cache_tools_list: bool = False,
        name: str | None = None,
        client_session_timeout_seconds: float | None = 5,
    ):
        super().__init__(cache_tools_list, client_session_timeout_seconds)
        self.params = params
        self._name = name or f"streamable_http: {self.params['url']}"

    def create_streams(
        self,
    ) -> AbstractAsyncContextManager[
        tuple[
            MemoryObjectReceiveStream[SessionMessage | Exception],
            MemoryObjectSendStream[SessionMessage],
            GetSessionIdCallback | None
        ]
    ]:
        """Create the streams for the server."""
        return streamablehttp_client(
            url=self.params["url"],
            headers=self.params.get("headers", None),
            timeout=self.params.get("timeout", timedelta(seconds=30)),
            sse_read_timeout=self.params.get("sse_read_timeout", timedelta(seconds=60 * 5)),
            terminate_on_close=self.params.get("terminate_on_close", True)
        )

    @property
    def name(self) -> str:
        """A readable name for the server."""
        return self._name