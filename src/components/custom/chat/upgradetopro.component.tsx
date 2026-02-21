import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Crown, ArrowRight, ArrowUpRight, X } from "lucide-react";
import { useAuth } from '@/contexts/useAuth';
import { openExternalUrl } from '@/api/external';

const UpgradeToProContainer: React.FC = () => {
  const { user, loading, oauth2Enabled } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Show upgrade if auth is enabled, user is authenticated, and close to limit or exceeded
    if (!loading && oauth2Enabled && user?.isAuthenticated) {
      // Check if user has exceeded limit or is close to usage limit (80% or more)
      const usagePercentage = user.usage_limit && user.usage_count ? (user.usage_count / user.usage_limit) * 100 : 0;
      const hasExceededLimit = user.usage_limit && (user.usage_count || 0) >= user.usage_limit;
      setShouldShow(hasExceededLimit || usagePercentage >= 80);
    } else {
      setShouldShow(false);
    }
  }, [user, loading, oauth2Enabled]);

  const handleUpgrade = () => {
    openExternalUrl("https://account.agentkube.com");
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  // Don't render anything if auth is disabled, while loading, if shouldn't show, or if dismissed
  if (!oauth2Enabled || loading || !shouldShow || !user?.isAuthenticated || isDismissed) {
    return null;
  }

  const hasExceededLimit = user.usage_limit && (user.usage_count || 0) >= user.usage_limit;
  
  return (
    <div className={`px-4 py-3 ${hasExceededLimit 
      ? 'bg-gradient-to-r from-blue-500/10 to-gray-500/10 border-red-200 dark:border-red-800/50' 
      : 'bg-gradient-to-r from-yellow-500/10 to-gray-500/10 border-orange-200 dark:border-orange-800/50'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start w-full space-x-3">
          <div className="flex-shrink-0">
            <Crown className={`h-5 w-5 ${hasExceededLimit 
              ? 'text-red-600 dark:text-red-400' 
              : 'text-orange-600 dark:text-orange-400'
            }`} />
          </div>

          <div className="flex items-center justify-between w-full">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                {hasExceededLimit ? 'Usage Limit Exceeded' : 'Credits Running Low'}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {hasExceededLimit 
                  ? `You've reached your limit of ${user.usage_limit} credits. Upgrade to continue.`
                  : `You've used ${user.usage_count} of ${user.usage_limit} credits. Upgrade for unlimited usage.`
                }
              </p>
            </div>

            <Button
              onClick={handleUpgrade}
              size="sm"
              className={`text-white h-7 w-44 flex justify-between px-3 text-xs ${hasExceededLimit
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              Upgrade
              <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
        
        <button
          onClick={handleDismiss}
          className="ml-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default UpgradeToProContainer;