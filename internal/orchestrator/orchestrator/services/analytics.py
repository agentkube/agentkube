import httpx
import logging
from typing import Dict, Any, Optional
from config.config import get_agentkube_server_url, get_ak_analytics_api_key, get_settings
from orchestrator.services.account.session import SessionService

logger = logging.getLogger(__name__)

class AnalyticsService:
    """Service for sending analytics events to AgentKube server."""
    
    @staticmethod
    def track_event(event: str, properties: Dict[str, Any], email: Optional[str] = None, name: Optional[str] = None) -> bool:
        """
        Track an analytics event by sending it to the AgentKube server.
        Only sends if usageAnalytics is enabled in settings.
        
        Args:
            event: The event name to track
            properties: Event properties dictionary
            email: User email (optional, will be fetched from session if not provided)
            name: User name (optional, will be fetched from session if not provided)
            
        Returns:
            bool: True if event was sent successfully or analytics disabled, False on error
        """
        try:
            # Check if usage analytics is enabled in settings
            settings = get_settings()
            usage_analytics_enabled = settings.get("general", {}).get("usageAnalytics", False)
            
            if not usage_analytics_enabled:
                logger.debug(f"Analytics disabled, skipping event: {event}")
                return True  # Return True as this is expected behavior
            # Get user info from session if not provided
            if not email or not name:
                user_info = SessionService.get_user_info()
                if user_info:
                    email = email or user_info.get('email')
                    name = name or user_info.get('name')
                    user_id = user_info.get('id')
                else:
                    user_id = None
            
            # Get server URL and API key from config
            server_url = get_agentkube_server_url()
            api_key = get_ak_analytics_api_key()
            
            # Prepare the payload matching the expected format from analytics controller
            payload = {
                "event": event,
                "properties": {
                    **properties,
                    "distinct_id": email or user_id or "anonymous"
                }
            }
            
            # Add email and name to properties if available
            if email:
                payload["properties"]["email"] = email
            if name:
                payload["properties"]["name"] = name
            
            # Make request to AgentKube analytics endpoint using the header name from analytics controller
            response = httpx.post(
                f"{server_url}/api/v1/analytics/track",
                headers={
                    "x-analytics-api-key": api_key,  # Use lowercase header as expected by controller
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully tracked event: {event}")
                return True
            else:
                logger.warning(f"Failed to track event {event}: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error tracking analytics event {event}: {e}")
            return False

def send_event(event: str, properties: Dict[str, Any]) -> bool:
    """
    Convenience function to send analytics events.
    Email and name are automatically fetched from the session.
    
    Args:
        event: The event name to track
        properties: Event properties dictionary
        
    Returns:
        bool: True if event was sent successfully, False otherwise
    """
    return AnalyticsService.track_event(event, properties)