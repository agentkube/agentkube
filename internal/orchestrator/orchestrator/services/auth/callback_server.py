"""Local HTTP server for OAuth2 callback handling."""

import asyncio
import logging
from typing import Optional, Dict, Any
from aiohttp import web, ClientSession
import socket
from urllib.parse import parse_qs

from .exceptions import CallbackTimeoutError, CallbackServerError

logger = logging.getLogger(__name__)


class CallbackServer:
    """Local HTTP server to handle OAuth2 callbacks."""
    
    def __init__(self, port: int = 4689, timeout: int = 300):
        """
        Initialize callback server.
        
        Args:
            port: Port to listen on (default 4689)
            timeout: Timeout in seconds (default 5 minutes)
        """
        self.port = port
        self.timeout = timeout
        self.app = None
        self.runner = None
        self.site = None
        self.callback_result: Optional[Dict[str, Any]] = None
        self.callback_received = asyncio.Event()
        
    def _is_port_available(self, port: int) -> bool:
        """Check if a port is available."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return True
            except socket.error:
                return False
    
    def _find_available_port(self, start_port: int = 4689, max_attempts: int = 10) -> int:
        """Find an available port starting from start_port."""
        for port in range(start_port, start_port + max_attempts):
            if self._is_port_available(port):
                return port
        raise CallbackServerError(f"No available ports found in range {start_port}-{start_port + max_attempts}")
    
    async def _callback_handler(self, request: web.Request) -> web.Response:
        """Handle OAuth2 callback request."""
        try:
            query_params = dict(request.query)
            logger.info(f"Received OAuth2 callback with params: {list(query_params.keys())}")
            
            # Extract relevant parameters
            code = query_params.get('code')
            state = query_params.get('state')
            error = query_params.get('error')
            error_description = query_params.get('error_description')
            
            self.callback_result = {
                'code': code,
                'state': state,
                'error': error,
                'error_description': error_description,
                'success': code is not None and error is None
            }
            
            # Signal that callback was received
            self.callback_received.set()
            
            # Return success page
            if self.callback_result['success']:
                html_content = """
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Authentication Successful</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: #28a745; }
                        .container { max-width: 600px; margin: 0 auto; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="success">✓ Authentication Successful</h1>
                        <p>You have successfully authenticated with Agentkube.</p>
                        <p>You can now close this browser window and return to the application.</p>
                    </div>
                </body>
                </html>
                """
                return web.Response(text=html_content, content_type='text/html')
            else:
                error_msg = error_description or error or "Unknown error"
                html_content = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Authentication Error</title>
                    <style>
                        body {{ font-family: Arial, sans-serif; text-align: center; padding: 50px; }}
                        .error {{ color: #dc3545; }}
                        .container {{ max-width: 600px; margin: 0 auto; }}
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="error">✗ Authentication Error</h1>
                        <p>Authentication failed: {error_msg}</p>
                        <p>Please close this browser window and try again.</p>
                    </div>
                </body>
                </html>
                """
                return web.Response(text=html_content, content_type='text/html', status=400)
                
        except Exception as e:
            logger.error(f"Error handling OAuth2 callback: {e}")
            self.callback_result = {
                'code': None,
                'state': None,
                'error': 'callback_handler_error',
                'error_description': str(e),
                'success': False
            }
            self.callback_received.set()
            
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Callback Error</title>
                <style>
                    body {{ font-family: Arial, sans-serif; text-align: center; padding: 50px; }}
                    .error {{ color: #dc3545; }}
                    .container {{ max-width: 600px; margin: 0 auto; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <h1 class="error">✗ Callback Error</h1>
                    <p>An error occurred while processing the authentication callback.</p>
                    <p>Please close this browser window and try again.</p>
                </div>
            </body>
            </html>
            """
            return web.Response(text=html_content, content_type='text/html', status=500)
    
    async def start(self) -> int:
        """
        Start the callback server.
        
        Returns:
            Port number the server is listening on
            
        Raises:
            CallbackServerError: If server fails to start
        """
        try:
            # Find an available port
            available_port = self._find_available_port(self.port)
            self.port = available_port
            
            # Create aiohttp application
            self.app = web.Application()
            self.app.router.add_get('/callback', self._callback_handler)
            
            # Add a health check endpoint
            async def health_check(request):
                return web.json_response({'status': 'ok', 'message': 'Callback server running'})
            
            self.app.router.add_get('/health', health_check)
            
            # Start the server
            self.runner = web.AppRunner(self.app)
            await self.runner.setup()
            
            self.site = web.TCPSite(self.runner, '127.0.0.1', self.port)
            await self.site.start()
            
            logger.info(f"OAuth2 callback server started on port {self.port}")
            return self.port
            
        except Exception as e:
            logger.error(f"Failed to start callback server: {e}")
            raise CallbackServerError(f"Failed to start callback server: {str(e)}")
    
    async def wait_for_callback(self) -> Dict[str, Any]:
        """
        Wait for OAuth2 callback.
        
        Returns:
            Callback result dictionary
            
        Raises:
            CallbackTimeoutError: If callback times out
        """
        try:
            # Wait for callback with timeout
            await asyncio.wait_for(
                self.callback_received.wait(),
                timeout=self.timeout
            )
            
            return self.callback_result
            
        except asyncio.TimeoutError:
            logger.warning(f"OAuth2 callback timed out after {self.timeout} seconds")
            raise CallbackTimeoutError(f"OAuth2 callback timed out after {self.timeout} seconds")
    
    async def stop(self):
        """Stop the callback server."""
        try:
            if self.site:
                await self.site.stop()
                self.site = None
            
            if self.runner:
                await self.runner.cleanup()
                self.runner = None
            
            self.app = None
            logger.info("OAuth2 callback server stopped")
            
        except Exception as e:
            logger.error(f"Error stopping callback server: {e}")
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.stop()


class CallbackManager:
    """Manager for handling OAuth2 callbacks with automatic cleanup."""
    
    def __init__(self, port: int = 4689, timeout: int = 300):
        self.port = port
        self.timeout = timeout
        self.server: Optional[CallbackServer] = None
    
    async def handle_callback(self) -> Dict[str, Any]:
        """
        Start server and wait for callback with automatic cleanup.
        
        Returns:
            Callback result dictionary
        """
        async with CallbackServer(self.port, self.timeout) as server:
            self.server = server
            result = await server.wait_for_callback()
            self.server = None
            return result
    
    def get_redirect_uri(self) -> str:
        """Get the redirect URI for this callback manager."""
        return f"http://127.0.0.1:{self.port}/callback"