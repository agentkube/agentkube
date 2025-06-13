import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Sparkles, Crown, ArrowRight } from "lucide-react";
import { useAuth } from '@/contexts/useAuth';
import { useNavigate } from 'react-router-dom';
import { openExternalUrl } from '@/api/external';

const UpgradeToProContainer: React.FC = () => {
  const { user, loading } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Only show if user exists, is not licensed, and subscription is not active
    if (!loading && user) {
      setShouldShow(!user.isLicensed || user.subscription.status !== 'active');
    } else {
      setShouldShow(false);
    }
  }, [user, loading]);

  const handleUpgrade = () => {
    openExternalUrl("https://www.agentkube.com/pricing");
  };

  // Don't render anything while loading or if shouldn't show
  if (loading || !shouldShow) {
    return null;
  }

  return (
    <div className="px-4 py-3 bg-gradient-to-r from-blue-500/10 to-green-500/10 border-purple-200 dark:border-green-800/50">
      <div className="flex items-start justify-between">
        <div className="flex items-start justify-between w-full space-x-3">
          <div className="flex-shrink-0">
            <Crown className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>

          <div className="flex items-center justify-between w-full">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                Upgrade to Pro
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Unlock advanced AI features and priority support.
              </p>
            </div>

            <Button
              onClick={handleUpgrade}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white h-7 px-3 text-xs"
            >
              Upgrade
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeToProContainer;