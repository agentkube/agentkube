import React, { useState, useEffect } from 'react';
import { User, CreditCard, Settings, LogOut, ChevronRight, Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

// Mock user data - replace with actual API calls in production
const mockUserData = {
  email: 'founder@agentkube.com',
  subscription: {
    plan: 'Pro',
    status: 'active',
    renewalDate: '2025-04-20'
  }
};

const Account = () => {
  const [userData, setUserData] = useState<typeof mockUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Simulate API call to fetch user data
    const fetchUserData = async () => {
      try {
        setLoading(true);
        // Replace with actual API call
        // const response = await fetchUser();
        // setUserData(response.data);

        // Using mock data for now
        setTimeout(() => {
          setUserData(mockUserData);
          setLoading(false);
        }, 800);
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        toast({
          title: "Error loading account",
          description: "Could not load your account information. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
      }
    };

    fetchUserData();
  }, [toast]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      // Simulate API call for logout
      await new Promise(resolve => setTimeout(resolve, 1000));

      // In a real application, you would call your auth service
      // await authService.logout();

      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account.",
      });

      // Redirect to login page
      // navigate('/login');
      console.log('User logged out');
    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: "Logout failed",
        description: "There was an error logging out. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingOut(false);
      setIsLogoutDialogOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading account information...</span>
      </div>
    );
  }

  return (
    <div className="p-6 mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold dark:text-white mb-2">Account</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Information */}
      <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-700/30 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full mr-4">
              <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-medium dark:text-white mb-1">Profile Information</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Manage your personal details
              </p>

              <div className="space-y-4">
                <div>
                  <p className="text-gray-900 dark:text-gray-500">You are currently logged in as {userData?.email || 'N/A'}</p>
                </div>
              </div>

              <div className="mt-6 flex space-x-4">
                <Button
                  variant="outline"
                  className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
                  onClick={() => {
                    // Navigate to profile edit page or open modal
                    toast({
                      title: "Edit Profile",
                      description: "Profile editing will be available soon.",
                    });
                  }}
                >
                  Manage
                  <Settings2 className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center  hover:bg-red-700"
                  onClick={() => setIsLogoutDialogOpen(true)}
                >
                  Logout
                  <LogOut className="mr-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Information */}
      <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-700/30 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-start">
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full mr-4">
              <CreditCard className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-medium dark:text-white mb-1">Subscription</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Manage your subscription plan and billing
              </p>

              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/20 rounded-lg mb-6">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-gray-900 dark:text-white font-medium">{userData?.subscription?.plan} Plan</span>
                    <div className="flex items-center mt-1">
                      <span className={`ml-3 text-xs px-2 py-1 rounded-full ${userData?.subscription?.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                        }`}>
                        {userData?.subscription?.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  {userData?.subscription?.status === 'active' && (
                    <div className="text-right">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Renews on</span>
                      <p className="text-gray-900 dark:text-white">
                        {new Date(userData?.subscription?.renewalDate).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
                  onClick={() => {
                    // Navigate to subscription management page
                    toast({
                      title: "Manage Subscription",
                      description: "Subscription management will be available soon.",
                    });
                  }}
                >
                  Manage Subscription
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
                  onClick={() => {
                    // Open billing history page
                    toast({
                      title: "Billing History",
                      description: "Billing history will be available soon.",
                    });
                  }}
                >
                  Billing History
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Logout Confirmation Dialog */}
      <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-gray-900/50 backdrop-blur-sm">
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
};

export default Account;