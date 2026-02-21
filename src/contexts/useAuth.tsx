import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  getOAuth2Status,
  initiateOAuth2Login,
  handleOAuth2Callback,
  logoutOAuth2,
  refreshOAuth2Tokens,
  getOAuth2Config,
  openOAuth2AuthUrl,
  getUserProfile
} from '@/api/auth';

interface UserInfo {
  id: string;
  supabaseId?: string;
  email: string;
  name: string;
  isAuthenticated: boolean;
  usage_count?: number;
  usage_limit?: number | null;
  subscription?: any;
  createdAt?: string;
  updatedAt?: string;
}

interface LoginSession {
  sessionId: string;
  authUrl: string;
  expiresIn: number;
}

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  loginSession: LoginSession | null;
  oauth2Enabled: boolean;

  // OAuth2 methods
  initiateLogin: () => Promise<LoginSession>;
  handleManualCallback: (authCode: string) => Promise<boolean>;
  refreshTokens: () => Promise<boolean>;
  logout: () => Promise<void>;
  loadUserProfile: () => Promise<void>;

  // Legacy compatibility (for gradual migration)
  setUser: React.Dispatch<React.SetStateAction<UserInfo | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to store user info in session storage for UI state persistence
const storeUserInfoInSession = (userInfo: UserInfo | null) => {
  if (userInfo) {
    sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
  } else {
    sessionStorage.removeItem('userInfo');
  }
};

// Helper to get user info from session storage
const getUserInfoFromSession = (): UserInfo | null => {
  const stored = sessionStorage.getItem('userInfo');
  return stored ? JSON.parse(stored) : null;
};

interface AuthProviderProps {
  children: ReactNode;
  enabled?: boolean; // When false, uses guest user instead of authentication
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, enabled = false }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [oauth2Enabled, setOauth2Enabled] = useState(false);
  const { toast } = useToast();

  // Store polling interval and timeout refs so we can clear them
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Check OAuth2 configuration and authentication status on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setLoading(true);

        // If authentication is disabled, use guest user
        if (!enabled) {
          const guestUser: UserInfo = {
            id: 'guest',
            email: 'guest@agentkube.com',
            name: 'Guest',
            isAuthenticated: false
          };
          setUser(guestUser);
          storeUserInfoInSession(guestUser);
          setOauth2Enabled(false);
          setLoading(false);
          return;
        }

        // Check if OAuth2 is enabled
        const config = await getOAuth2Config();
        setOauth2Enabled(config.oauth2_enabled);

        if (!config.oauth2_enabled) {
          const guestUser: UserInfo = {
            id: 'guest',
            email: 'guest@agentkube.com',
            name: 'Guest',
            isAuthenticated: false
          };
          setUser(guestUser);
          storeUserInfoInSession(guestUser);
          setLoading(false);
          return;
        }

        // Try to load user info from session storage first (for UI persistence)
        const sessionUser = getUserInfoFromSession();
        if (sessionUser) {
          setUser(sessionUser);
        }

        // Check current authentication status
        const authStatus = await getOAuth2Status();

        if (authStatus.authenticated && authStatus.user_info?.email) {
          // User is authenticated via OAuth2
          const userInfo: UserInfo = {
            id: authStatus.user_info.id,
            email: authStatus.user_info.email,
            name: authStatus.user_info.name || 'Unknown User',
            isAuthenticated: true
          };

          setUser(userInfo);
          storeUserInfoInSession(userInfo);

          // Load full user profile data
          try {
            await loadFullUserProfile();
          } catch (error) {
            console.log('Could not load full user profile:', error);
          }
        } else if (sessionUser) {
          // OAuth2 not authenticated but we have session user data
          const updatedUser = {
            ...sessionUser,
            isAuthenticated: false
          };
          setUser(updatedUser);
          storeUserInfoInSession(updatedUser);
        } else {
          // No authentication and no session data
          setUser(null);
          storeUserInfoInSession(null);
        }

      } catch (error) {
        console.error('Error initializing auth:', error);

        // Fall back to session storage on error
        const sessionUser = getUserInfoFromSession();
        if (sessionUser) {
          setUser({
            ...sessionUser,
            isAuthenticated: false
          });
        } else {
          setUser(null);
          storeUserInfoInSession(null);
        }

        toast({
          title: "Authentication Error",
          description: "Could not verify authentication status. Using offline mode.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, [toast, enabled]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, []);

  // Initiate OAuth2 login flow
  const initiateLogin = async (): Promise<LoginSession> => {
    try {
      const response = await initiateOAuth2Login(true); // Open browser automatically

      if (!response.success || !response.auth_url || !response.session_id) {
        throw new Error(response.message || 'Failed to initiate login');
      }

      const session: LoginSession = {
        sessionId: response.session_id,
        authUrl: response.auth_url,
        expiresIn: response.expires_in || 300
      };

      setLoginSession(session);

      // Try to open the authorization URL once, but don't fail if it doesn't work
      // try {
      //   await openOAuth2AuthUrl(response.auth_url);
      // } catch (browserError) {
      //   console.log('Browser did not open automatically, user can use manual URL');
      // }

      // Start polling for authentication status
      startAuthStatusPolling();

      return session;

    } catch (error) {
      console.error('Error initiating login:', error);
      toast({
        title: "Login Error",
        description: "Failed to start the login process. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  // Handle manual authorization code entry (fallback)
  const handleManualCallback = async (authCode: string): Promise<boolean> => {
    try {
      if (!loginSession) {
        throw new Error('No active login session');
      }

      const response = await handleOAuth2Callback(loginSession.sessionId, authCode);

      if (!response.success) {
        throw new Error(response.message || 'Authentication failed');
      }

      // Update user info from the callback response
      if (response.user) {
        const userInfo: UserInfo = {
          id: response.user.id,
          email: response.user.email,
          name: response.user.name,
          isAuthenticated: true,
          subscription: {
            product_name: 'OAuth2 User',
            status: 'active',
            created_at: new Date().toISOString()
          }
        };

        setUser(userInfo);
        storeUserInfoInSession(userInfo);
      }

      // Clear login session
      setLoginSession(null);

      toast({
        title: "Login Successful",
        description: `Welcome, ${response.user?.name || 'User'}!`,
      });

      return true;

    } catch (error) {
      console.error('Error handling manual callback:', error);
      toast({
        title: "Authentication Error",
        description: "Failed to complete authentication. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Refresh OAuth2 tokens
  const refreshTokens = async (): Promise<boolean> => {
    try {
      const response = await refreshOAuth2Tokens(false);

      if (!response.success) {
        console.log('Token refresh not needed or failed:', response.message);
        return false;
      }

      // Check authentication status after refresh
      const authStatus = await getOAuth2Status();

      if (authStatus.authenticated && authStatus.user_info?.email) {
        const userInfo: UserInfo = {
          id: authStatus.user_info.id,
          email: authStatus.user_info.email,
          name: authStatus.user_info.name || 'Unknown User',
          isAuthenticated: true,
          subscription: user?.subscription || {
            product_name: 'OAuth2 User',
            status: 'active',
            created_at: new Date().toISOString()
          }
        };

        setUser(userInfo);
        storeUserInfoInSession(userInfo);
      }

      return true;

    } catch (error) {
      console.error('Error refreshing tokens:', error);
      return false;
    }
  };

  // Load full user profile data
  const loadFullUserProfile = async (): Promise<void> => {
    try {
      const profile = await getUserProfile();

      setUser(prevUser => {
        if (!prevUser) return null;

        const fullUserInfo: UserInfo = {
          ...prevUser,
          supabaseId: profile.supabaseId,
          usage_count: profile.usage_count,
          usage_limit: profile.usage_limit,
          subscription: profile.subscription,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt
        };

        storeUserInfoInSession(fullUserInfo);
        return fullUserInfo;
      });

    } catch (error) {
      console.error('Error loading full user profile:', error);
      throw error;
    }
  };

  // Public method to load user profile
  const loadUserProfile = async (): Promise<void> => {
    if (!user?.isAuthenticated) {
      throw new Error('User not authenticated');
    }

    await loadFullUserProfile();
  };

  // Clear polling intervals
  const clearPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  };

  // OAuth2 logout
  const logout = async (): Promise<void> => {
    try {
      setLoading(true);

      // Clear any active polling first
      clearPolling();

      // if (oauth2Enabled) {
      //   // OAuth2 logout
      // }
      await logoutOAuth2();

      // Clear session storage
      sessionStorage.removeItem('userInfo');

      // Clear login session
      setLoginSession(null);

      setUser(null);

      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account.",
      });

    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: "Logout failed",
        description: "There was an error logging out. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Poll for authentication status during login flow
  const startAuthStatusPolling = () => {
    // Clear any existing polling first
    clearPolling();

    pollIntervalRef.current = setInterval(async () => {
      try {
        const authStatus = await getOAuth2Status();

        if (authStatus.authenticated && authStatus.user_info?.email) {
          // User successfully authenticated
          const userInfo: UserInfo = {
            id: authStatus.user_info.id,
            email: authStatus.user_info.email,
            name: authStatus.user_info.name || 'Unknown User',
            isAuthenticated: true,
            subscription: {
              product_name: 'OAuth2 User',
              status: 'active',
              created_at: new Date().toISOString()
            }
          };

          setUser(userInfo);
          storeUserInfoInSession(userInfo);
          setLoginSession(null);

          toast({
            title: "Login Successful",
            description: `Welcome, ${userInfo.name}!`,
          });

          // Clear polling after successful authentication
          clearPolling();
        }

      } catch (error) {
        console.error('Error polling auth status:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes
    pollTimeoutRef.current = setTimeout(() => {
      clearPolling();
      setLoginSession(null);
    }, 300000);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      loginSession,
      oauth2Enabled,
      initiateLogin,
      handleManualCallback,
      refreshTokens,
      logout,
      loadUserProfile,
      setUser // For legacy compatibility
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};