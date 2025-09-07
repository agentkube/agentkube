import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Sparkles, Crown, ArrowRight, User, ArrowUpRight } from "lucide-react";
import { useAuth } from '@/contexts/useAuth';
import { useNavigate } from 'react-router-dom';
import { openExternalUrl } from '@/api/external';

const SignInContainer: React.FC = () => {
  const { user, loading } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Show sign in if user is not authenticated, or show upgrade if close to limit
    if (!loading) {
      if (!user || !user.isAuthenticated) {
        setShouldShow(true);
      } else if (user.isAuthenticated) {
        // Check if user is close to usage limit (80% or more)
        const usagePercentage = user.usage_limit && user.usage_count ? (user.usage_count / user.usage_limit) * 100 : 0;
        setShouldShow(usagePercentage >= 80);
      }
    } else {
      setShouldShow(false);
    }
  }, [user, loading]);

  const handleSignIn = () => {
    navigate('/settings/account');
  };

  const handleUpgrade = () => {
    openExternalUrl("https://www.agentkube.com/pricing");
  };

  // Don't render anything while loading or if shouldn't show
  if (loading || !shouldShow) {
    return null;
  }

  // Show upgrade message if user is authenticated but close to limit
  if (user?.isAuthenticated) {
    return (
      <div className="px-4 py-3 bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-200 dark:border-orange-800/50">
        <div className="flex items-start justify-between">
          <div className="flex items-start justify-between w-full space-x-3">
            <div className="flex-shrink-0">
              <Crown className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>

            <div className="flex items-center justify-between w-full">
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                  Credits Running Low
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  You've used {user.usage_count} of {user.usage_limit} credits. Upgrade for unlimited usage.
                </p>
              </div>

              <Button
                onClick={handleUpgrade}
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 text-white h-7 px-3 text-xs"
              >
                Upgrade
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show sign in message if user is not authenticated
  return (
    <div className="px-4 py-3 bg-gradient-to-r from-blue-500/10 to-green-500/10 border-blue-200 dark:border-blue-800/50">
      <div className="flex items-start justify-between">
        <div className="flex items-start justify-between w-full space-x-3">
          <div className="flex-shrink-0">
            <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>

          <div className="flex items-center justify-between w-full">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                Sign In
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Sign in to access the AI assistant with free credits included.
              </p>
            </div>

            <Button
              onClick={handleSignIn}              
              className="flex justify-between min-w-36 bg-blue-600 hover:bg-blue-700 text-white h-7 px-3 text-xs"
            >
              Sign In
              <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInContainer;