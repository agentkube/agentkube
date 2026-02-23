"""Authentication-specific exceptions."""


class AuthError(Exception):
    """Base authentication error."""
    pass


class OAuth2Error(AuthError):
    """OAuth2-specific error."""
    pass


class TokenExpiredError(OAuth2Error):
    """Token has expired and cannot be refreshed."""
    pass


class TokenRefreshError(OAuth2Error):
    """Failed to refresh token."""
    pass


class CallbackTimeoutError(OAuth2Error):
    """OAuth2 callback timed out."""
    pass


class InvalidAuthCodeError(OAuth2Error):
    """Invalid authorization code provided."""
    pass


class CallbackServerError(OAuth2Error):
    """Local callback server error."""
    pass