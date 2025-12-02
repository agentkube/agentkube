import React, { useState, useEffect } from 'react';
import { User, LogOut, Loader2, Settings2, CreditCardIcon, Shield, Copy, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { openExternalUrl } from '@/api/external';
import { useAuth } from '@/contexts/useAuth';
import { useAnalytics } from '@/contexts/useAnalytics';
import { getUserProfile } from '@/api/auth';

const Account = () => {
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const { toast } = useToast();
  const { captureEvent, isAnalyticsEnabled } = useAnalytics();
  const {
    user,
    loginSession,
    initiateLogin,
    handleManualCallback,
    logout,
    setUser
  } = useAuth();

  // Fetch latest user profile directly from API every time the account page is visited
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const profile = await getUserProfile();
        
        // Update user with fresh profile data
        setUser(prevUser => {
          return {
            ...prevUser,
            id: profile.id,
            email: profile.email,
            name: profile.name,
            isAuthenticated: true, // Set authentication status to true
            supabaseId: profile.supabaseId,
            usage_count: profile.usage_count,
            usage_limit: profile.usage_limit,
            subscription: profile.subscription,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt
          };
        });
      } catch (error) {
        console.error('Failed to load user profile:', error);
      }
    };

    // Always fetch profile when component mounts if user is authenticated
    fetchUserProfile();
  }, [setUser]); // Removed user?.isAuthenticated dependency to fetch on every mount

  // Separate effect to handle authentication state changes
  useEffect(() => {
    if (user?.isAuthenticated) {
      // User successfully authenticated - close the login dialog
      setIsLoginDialogOpen(false);
      setAuthCode('');
      setIsLoggingIn(false);

      const fetchUserProfile = async () => {
        try {
          const profile = await getUserProfile();

          setUser(prevUser => {
            if (!prevUser) return null;
            return {
              ...prevUser,
              supabaseId: profile.supabaseId,
              usage_count: profile.usage_count,
              usage_limit: profile.usage_limit,
              subscription: profile.subscription,
              createdAt: profile.createdAt,
              updatedAt: profile.updatedAt
            };
          });
        } catch (error) {
          console.error('Failed to load user profile on auth change:', error);
        }
      };

      fetchUserProfile();
    }
  }, [user?.isAuthenticated, setUser]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      // Send logout event if analytics is enabled
      if (isAnalyticsEnabled) {
        await captureEvent('user_logout', {
          user_id: user?.id,
          email: user?.email
        });
      }

      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoggingOut(false);
      setIsLogoutDialogOpen(false);
    }
  };

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await initiateLogin();

      toast({
        title: "Opening Browser",
        description: "Browser opening for authentication. If it doesn't open, use the manual URL below.",
      });

      // Show manual code entry dialog
      setIsLoginDialogOpen(true);

    } catch (error) {
      console.error('Login failed:', error);
      setIsLoggingIn(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "URL copied to clipboard",
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: "Copy Failed",
        description: "Unable to copy URL to clipboard",
        variant: "destructive",
      });
    }
  };

  const truncateUrl = (url: string, maxLength: number = 50) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  };

  const handleManualCodeEntry = async () => {
    try {
      setIsLoggingIn(true);

      if (!authCode.trim()) {
        toast({
          title: "Invalid Code",
          description: "Please enter the authorization code from your browser.",
          variant: "destructive",
        });
        return;
      }

      const success = await handleManualCallback(authCode);

      if (success) {
        // Send signin event if analytics is enabled
        if (isAnalyticsEnabled) {
          await captureEvent('user_signin', {
            method: 'manual_callback'
          });
        }
        
        setIsLoginDialogOpen(false);
        setAuthCode('');
      }

    } catch (error) {
      console.error('Manual callback failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };



  // If not authenticated, show login interface
  if (!user?.isAuthenticated) {
    return (
      <div className="p-6 mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Account</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage your account settings and preferences
          </p>
        </div>

        {/* OAuth2 Login Card */}
        <Card className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-700/30 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-end">
              <div className="bg-blue-100 dark:bg-blue-900/20 p-10 rounded-lg mr-4">
                <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <p className='p-2 text-xs dark:text-gray-400/60'>Sign in to access free ai credits and access to all premium models.</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="text-white min-w-44 flex justify-between"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opening Browser...
                      </>
                    ) : (
                      <>
                        Sign In
                        <Shield className="h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      // Send pricing event if analytics is enabled
                      if (isAnalyticsEnabled) {
                        captureEvent('pricing_viewed', {
                          source: 'account_page'
                        });
                      }
                      openExternalUrl("https://agentkube.com/pricing");
                    }}
                    className="text-white min-w-44 flex justify-between"
                  >
                    <CreditCardIcon className="h-4 w-4 mr-2" />
                    View Pricing
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manual Code Entry Dialog */}
        <Dialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen}>
          <DialogContent className="sm:max-w-lg bg-gray-100 dark:bg-[#0B0D13]/30 backdrop-blur-md">
            <DialogHeader>
              <DialogTitle className='text-center'>Complete Authentication</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-gray-700 dark:text-gray-300 text-sm text-center">
                {loginSession ? (
                  <>Complete authentication in your browser, then paste the authorization code below.</>
                ) : (
                  <>Complete the sign in process in your browser and enter the authorization code below.</>
                )}
              </p>

              {loginSession && (
                <div className="bg-gray-50 dark:bg-gray-700/20 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Authentication URL:</span>
                    <Button
                      // variant="ghost"
                      size="sm"
                      onClick={() => openExternalUrl(loginSession.authUrl)}
                      className="h-6 min-w-36 flex justify-between px-2 text-xs"
                    >
                      Open
                      <ArrowUpRight className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 bg-white dark:bg-gray-800/20 rounded border px-2 py-1">
                    <code className="text-xs text-gray-600 dark:text-gray-300 flex-1 truncate">
                      {truncateUrl(loginSession.authUrl)}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(loginSession.authUrl)}
                      className="h-6 w-6 p-0"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2 text-center">
                <Label htmlFor="auth-code">Authorization Code</Label>
                <Input
                  id="auth-code"
                  placeholder="Enter authorization code from browser"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  disabled={isLoggingIn}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsLoginDialogOpen(false);
                  setAuthCode('');
                  setIsLoggingIn(false);
                }}
                disabled={isLoggingIn}
              >
                Cancel
              </Button>
              <Button
                onClick={handleManualCodeEntry}
                disabled={isLoggingIn || !authCode.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Complete Sign In
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Logout Confirmation Dialog */}
        <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
          <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-[#0B0D13]/50 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle>Confirm Logout</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700 dark:text-gray-300">
                Are you sure you want to log out of your account?
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsLogoutDialogOpen(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="bg-red-600 hover:bg-red-700"
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging out...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Show full account details once authenticated
  return (
    <div className="p-6 mx-auto space-y-4">
      <div>
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Account</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Information */}
      <Card className="bg-transparent dark:bg-transparent border border-gray-200 dark:border-gray-700/30 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-end">
            <div className="bg-blue-100 dark:bg-blue-900/20 p-10 rounded-lg mr-4">
              <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-gray-900 dark:text-gray-300">
                    {user.name}
                  </p>
                  {user.subscription?.plan && (
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                      user.subscription.plan === 'free' 
                        ? 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-200'
                        : user.subscription.plan === 'developer'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                        : user.subscription.plan === 'startup'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200'
                    }`}>
                      {user.subscription.plan.charAt(0).toUpperCase() + user.subscription.plan.slice(1)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-900 dark:text-gray-400">
                  {user.email}
                </p>

              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-w-44 flex justify-between "
                  onClick={() => {
                    openExternalUrl("https://account.agentkube.com/settings");
                    toast({
                      title: "Manage Account",
                      description: "Opening account management page...",
                    });
                  }}
                >
                  Manage Account
                  <Settings2 className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center min-w-56 justify-between"
                  onClick={() => {
                    openExternalUrl("https://account.agentkube.com/settings?tab=subscriptions");
                    toast({
                      title: "Manage Subscription",
                      description: "Opening subscription management page...",
                    });
                  }}
                >
                  Manage Subscription
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setIsLogoutDialogOpen(true)}
                  className="min-w-44 flex justify-between hover:bg-red-700 text-white"
                >
                  Logout
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Information */}
      <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none ">
        <CardContent className="p-4 flex flex-col h-full">
          <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Usage</h2>
          <div className="mt-20">
            <div className="flex items-baseline gap-2">
              {(() => {
                const usagePercentage = user.usage_limit 
                  ? Math.min((user.usage_count || 0) / user.usage_limit * 100, 100)
                  : 0;
                
                const numberColor = usagePercentage >= 80 
                  ? 'text-yellow-600 dark:text-yellow-600' 
                  : 'text-blue-600 dark:text-blue-400';
                
                return (
                  <p className={`text-5xl font-light ${numberColor} mb-1`}>
                    {user.usage_count || 0}
                  </p>
                );
              })()}
              <div>
                <p className="text-sm text-gray-800 dark:text-gray-400">
                  / {user.usage_limit || '∞'} requests
                </p>
              </div>
            </div>
            <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
              {(() => {
                const usagePercentage = user.usage_limit 
                  ? Math.min((user.usage_count || 0) / user.usage_limit * 100, 100)
                  : 0;
                
                const barColor = usagePercentage >= 80 
                  ? 'bg-yellow-500 dark:bg-yellow-600' 
                  : 'bg-blue-500 dark:bg-blue-400';
                
                return (
                  <div
                    className={`h-1 ${barColor} rounded-[0.3rem]`}
                    style={{ width: `${usagePercentage}%` }}
                  ></div>
                );
              })()}
            </div>
            
            {/* Upgrade button when usage is high */}
            {(() => {
              const usagePercentage = user.usage_limit 
                ? Math.min((user.usage_count || 0) / user.usage_limit * 100, 100)
                : 0;
              
              if (usagePercentage >= 80) {
                return (
                  <div className="mt-3">
                    <Button
                      onClick={() => {
                        openExternalUrl("https://account.agentkube.com/settings?tab=plans");
                        toast({
                          title: "Upgrade Plan",
                          description: "Opening subscription management page...",
                        });
                      }}
                      size="sm"
                      className="bg-yellow-600 w-44 flex justify-between hover:bg-yellow-700 text-white text-xs px-3 py-1 h-7"
                    >
                      Upgrade <ArrowUpRight />
                    </Button>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Logout Confirmation Dialog */}
      <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-[#0B0D13]/40 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>Confirm Logout</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-700 dark:text-gray-300">
              Are you sure you want to log out of your account?
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsLogoutDialogOpen(false)}
              disabled={isLoggingOut}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging out...
                </>
              ) : (
                <>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Account;