import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  posthogCapture, 
  posthogCaptureAnonymous, 
  posthogCapturePageView, 
  posthogCaptureScreenView,
  posthogCaptureWebVitals,
  posthogCaptureAppStarted,
  posthogCaptureAppClosed
} from '@/api/analytics/posthog';

// Define the context type
interface PostHogContextType {
  analyticsEnabled: boolean;
  setAnalyticsEnabled: (enabled: boolean) => void;
  captureEvent: (event: string, properties?: Record<string, any>) => Promise<{ status: string }>;
  captureAnonymousEvent: (event: string, properties?: Record<string, any>) => Promise<{ status: string }>;
  capturePageView: (url?: string, properties?: Record<string, any>) => Promise<{ status: string }>;
  captureScreenView: (screenName: string, properties?: Record<string, any>) => Promise<{ status: string }>;
  captureWebVitals: (metrics?: Record<string, any>) => Promise<{ status: string }>;
  captureAppStarted: (properties?: Record<string, any>) => Promise<{ status: string }>;
  captureAppClosed: (properties?: Record<string, any>) => Promise<{ status: string }>;
}

// Create the context with default values
const PostHogContext = createContext<PostHogContextType>({
  analyticsEnabled: true,
  setAnalyticsEnabled: () => {},
  captureEvent: async () => ({ status: 'Disabled' }),
  captureAnonymousEvent: async () => ({ status: 'Disabled' }),
  capturePageView: async () => ({ status: 'Disabled' }),
  captureScreenView: async () => ({ status: 'Disabled' }),
  captureWebVitals: async () => ({ status: 'Disabled' }),
  captureAppStarted: async () => ({ status: 'Disabled' }),
  captureAppClosed: async () => ({ status: 'Disabled' })
});

// Props for the provider component
interface PostHogProviderProps {
  children: ReactNode;
  initialAnalyticsEnabled?: boolean;
}

// PostHog Provider component
export const PostHogProvider: React.FC<PostHogProviderProps> = ({ 
  children, 
  initialAnalyticsEnabled = true 
}) => {
  // State to track whether analytics is enabled
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(initialAnalyticsEnabled);
  
  // Load analytics preference from localStorage on mount
  useEffect(() => {
    const storedPreference = localStorage.getItem('analytics_enabled');
    
    if (storedPreference !== null) {
      setAnalyticsEnabled(storedPreference === 'true');
    }
  }, []);
  
  // Save preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('analytics_enabled', analyticsEnabled.toString());
  }, [analyticsEnabled]);
  
  // Capture app_started event on initial mount
  useEffect(() => {
    posthogCaptureAppStarted();

    
    // Capture app_closed event when component unmounts (app closes)
    return () => {
      posthogCaptureAppClosed();
    };
  }, [analyticsEnabled]);
  
  // Wrapper for capture that respects the enabled setting
  const captureEvent = async (event: string, properties?: Record<string, any>) => {
    if (!analyticsEnabled) {
      return { status: 'Disabled' };
    }
    
    // Always allow app_started events even if analytics is toggled during session
    if (event === 'app_started') {
      return posthogCapture(event, properties);
    }
    
    return posthogCapture(event, properties);
  };
  
  // Wrapper for anonymous capture that respects the enabled setting
  const captureAnonymousEvent = async (event: string, properties?: Record<string, any>) => {
    if (!analyticsEnabled) {
      return { status: 'Disabled' };
    }
    
    return posthogCaptureAnonymous(event, properties);
  };
  
  // Wrapper for page view capture that respects the enabled setting
  const capturePageView = async (url?: string, properties?: Record<string, any>) => {
    if (!analyticsEnabled) {
      return { status: 'Disabled' };
    }
    
    return posthogCapturePageView(url, properties);
  };
  
  // Wrapper for screen view capture that respects the enabled setting
  const captureScreenView = async (screenName: string, properties?: Record<string, any>) => {
    if (!analyticsEnabled) {
      return { status: 'Disabled' };
    }
    
    return posthogCaptureScreenView(screenName, properties);
  };
  
  // Wrapper for web vitals capture that respects the enabled setting
  const captureWebVitals = async (metrics?: Record<string, any>) => {
    if (!analyticsEnabled) {
      return { status: 'Disabled' };
    }
    
    return posthogCaptureWebVitals(metrics);
  };
  
  // Wrapper for app started capture that respects the enabled setting
  const captureAppStarted = async (properties?: Record<string, any>) => {
    if (!analyticsEnabled) {
      return { status: 'Disabled' };
    }
    
    return posthogCaptureAppStarted(properties);
  };
  
  // Wrapper for app closed capture that respects the enabled setting
  const captureAppClosed = async (properties?: Record<string, any>) => {
    if (!analyticsEnabled) {
      return { status: 'Disabled' };
    }
    
    return posthogCaptureAppClosed(properties);
  };
  
  // Provide the context value
  const contextValue: PostHogContextType = {
    analyticsEnabled,
    setAnalyticsEnabled,
    captureEvent,
    captureAnonymousEvent,
    capturePageView,
    captureScreenView,
    captureWebVitals,
    captureAppStarted,
    captureAppClosed
  };
  
  return (
    <PostHogContext.Provider value={contextValue}>
      {children}
    </PostHogContext.Provider>
  );
};

// Custom hook to use the PostHog context
export const usePostHog = () => useContext(PostHogContext);

export default PostHogContext;