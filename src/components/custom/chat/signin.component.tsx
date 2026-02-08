import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { User, ArrowUpRight } from "lucide-react";
import { useAuth } from '@/contexts/useAuth';
import { useNavigate } from 'react-router-dom';

const SignInContainer: React.FC = () => {
  const { user, loading } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Only show sign in if user is not authenticated
    if (!loading) {
      setShouldShow(!user || !user.isAuthenticated);
    } else {
      setShouldShow(false);
    }
  }, [user, loading]);

  const handleSignIn = () => {
    navigate('/settings/account');
  };


  // Don't render anything while loading or if shouldn't show
  if (loading || !shouldShow) {
    return null;
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