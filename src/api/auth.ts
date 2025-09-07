import { ORCHESTRATOR_URL } from '@/config';

// OAuth2 response types
export interface AuthInitResponse {
  success: boolean;
  auth_url?: string;
  session_id?: string;
  callback_port?: number;
  expires_in?: number;
  message?: string;
  error?: string | null;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  has_tokens: boolean;
  user_email?: string;
  user_name?: string;
  user_info?: {
    id: string;
    email: string;
    name: string;
  };
  expires_at?: string;
  scopes: string[];
}

export interface UserProfileResponse {
  id: string;
  supabaseId: string;
  email: string;
  name: string;
  usage_count: number;
  usage_limit: number | null;
  subscription: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthCallbackRequest {
  session_id: string;
  auth_code: string;
}

export interface AuthCallbackResponse {
  success: boolean;
  message: string;
  error?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface AuthLogoutResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface AuthConfigResponse {
  oauth2_enabled: boolean;
  client_id: string;
  authorization_url?: string;
  scopes: string[];
  callback_port?: number;
  callback_timeout?: number;
  fallback_to_license: boolean;
  server_base_url?: string;
}


/**
 * Initiates OAuth2 login flow
 * @param openBrowser Whether to automatically open the browser
 * @returns OAuth2 login initiation response
 */
export const initiateOAuth2Login = async (
  openBrowser: boolean = true
): Promise<AuthInitResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        open_browser: openBrowser,
        additional_params: {}
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to initiate OAuth2 login: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error initiating OAuth2 login:', error);
    throw error;
  }
};

/**
 * Handles manual authorization code entry (fallback)
 * @param sessionId Session ID from login initiation
 * @param authCode Authorization code from browser
 * @returns OAuth2 callback response
 */
export const handleOAuth2Callback = async (
  sessionId: string,
  authCode: string
): Promise<AuthCallbackResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        auth_code: authCode
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to handle OAuth2 callback: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error handling OAuth2 callback:', error);
    throw error;
  }
};

/**
 * Gets current OAuth2 authentication status
 * @returns OAuth2 authentication status
 */
export const getOAuth2Status = async (): Promise<AuthStatusResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/status`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get OAuth2 status: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error getting OAuth2 status:', error);
    throw error;
  }
};

/**
 * Refreshes OAuth2 access tokens
 * @param force Whether to force token refresh even if tokens are still valid
 * @returns Token refresh response
 */
export const refreshOAuth2Tokens = async (force: boolean = false): Promise<{ success: boolean; message: string; error?: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force }),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh OAuth2 tokens: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error refreshing OAuth2 tokens:', error);
    throw error;
  }
};

/**
 * Logs out user and clears OAuth2 tokens
 * @returns OAuth2 logout response
 */
export const logoutOAuth2 = async (): Promise<AuthLogoutResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to logout OAuth2: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error logging out OAuth2:', error);
    throw error;
  }
};

/**
 * Gets OAuth2 configuration information
 * @returns OAuth2 configuration
 */
export const getOAuth2Config = async (): Promise<AuthConfigResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/config`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get OAuth2 config: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error getting OAuth2 config:', error);
    throw error;
  }
};

/**
 * Checks OAuth2 system health
 * @returns OAuth2 health status
 */
export const checkOAuth2Health = async (): Promise<{ 
  oauth2_enabled: boolean; 
  config_valid: boolean; 
  status: string;
  user_authenticated?: boolean;
}> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to check OAuth2 health: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error checking OAuth2 health:', error);
    throw error;
  }
};

/**
 * Gets complete user profile including subscription and usage data
 * @returns User profile with subscription and usage information
 */
export const getUserProfile = async (): Promise<UserProfileResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/auth/user`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user profile: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
};

/**
 * Opens external URL for OAuth2 authentication
 * @param url The authorization URL to open
 */
export const openOAuth2AuthUrl = async (url: string): Promise<void> => {
  try {
    // Use the existing openExternalUrl function from external API
    const { openExternalUrl } = await import('@/api/external');
    await openExternalUrl(url);
  } catch (error) {
    console.error('Error opening OAuth2 auth URL:', error);
    // Fallback to window.open if the external API fails
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
    }
  }
};