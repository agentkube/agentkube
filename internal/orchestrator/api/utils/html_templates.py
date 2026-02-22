"""HTML template utilities for OAuth callback responses."""

import os
from typing import Optional, Dict, Any


def get_callback_html(
    status: str,
    title: str, 
    message: str,
    user_info: Optional[Dict[str, Any]] = None
) -> str:
    """
    Generate HTML response for OAuth callback with Agentkube design.
    
    Args:
        status: 'success' or 'error'
        title: Page title and main heading
        message: Description message
        user_info: Optional user information dict with 'email' and 'name'
    
    Returns:
        HTML string
    """
    
    # Icons
    success_icon = '''<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'''
    
    error_icon = '''<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'''
    
    icon = success_icon if status == 'success' else error_icon
    
    # User info section
    user_section = ''
    if user_info and status == 'success':
        email = user_info.get('email', 'User')
        name = user_info.get('name', email)
        avatar_letter = email[0].upper() if email else 'U'
        
        user_section = f'<div class="user-info"><div class="user-avatar">{avatar_letter}</div><div class="user-name">{name}</div><div class="user-email">{email}</div></div>'
    
    # Use simple inline template
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f1419 0%, #1a1a1a 100%);
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
        }}
        .container {{ max-width: 28rem; width: 100%; }}
        .card {{
            background: rgba(38, 38, 38, 0.5);
            border: 1px solid rgba(64, 64, 64, 0.8);
            border-radius: 0.75rem;
            padding: 2rem;
            text-align: center;
            backdrop-filter: blur(10px);
        }}
        .header {{ display: flex; align-items: center; justify-content: center; margin-bottom: 2rem; }}
        .logo-text {{ font-size: 1.125rem; font-weight: 600; }}
        .icon-container {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 4rem;
            height: 4rem;
            border-radius: 0.75rem;
            margin-bottom: 1rem;
        }}
        .success .icon-container {{ background: rgba(16, 185, 129, 0.1); }}
        .error .icon-container {{ background: rgba(239, 68, 68, 0.1); }}
        .icon {{ width: 2rem; height: 2rem; }}
        .success .icon {{ color: #10b981; }}
        .error .icon {{ color: #ef4444; }}
        .title {{ font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }}
        .success .title {{ color: #10b981; }}
        .error .title {{ color: #ef4444; }}
        .message {{ color: #a3a3a3; margin-bottom: 1rem; line-height: 1.5; }}
        .user-info {{
            background: rgba(64, 64, 64, 0.5);
            border-radius: 0.5rem;
            padding: 1rem;
            margin-bottom: 1.5rem;
        }}
        .user-avatar {{
            width: 2.5rem;
            height: 2.5rem;
            background: rgba(16, 185, 129, 0.2);
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 0.5rem;
            font-weight: 500;
            color: #10b981;
        }}
        .user-name {{ font-weight: 500; margin-bottom: 0.25rem; }}
        .user-email {{ font-size: 0.875rem; color: #a3a3a3; }}
        .footer-note {{ font-size: 0.875rem; color: #737373; margin-top: 1.5rem; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <span class="logo-text">Agentkube</span>
            </div>
            <div class="{status}">
                <div class="icon-container">{icon}</div>
                <h1 class="title">{title}</h1>
                <p class="message">{message}</p>
                {user_section}
                <p class="footer-note">You can now close this browser window and return to the application.</p>
            </div>
        </div>
    </div>
</body>
</html>"""
    
    return html


def get_success_html(message: str, user_info: Optional[Dict[str, Any]] = None) -> str:
    """Generate success HTML response."""
    return get_callback_html(
        status='success',
        title='Authorization Successful',
        message=message,
        user_info=user_info
    )


def get_error_html(message: str) -> str:
    """Generate error HTML response."""
    return get_callback_html(
        status='error', 
        title='Authorization Failed',
        message=message
    )