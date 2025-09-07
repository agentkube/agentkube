import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { sendEvent } from '@/api/analytics/posthog';
import { getSettings } from '@/api/settings';

// Define the context type
interface AnalyticsContextType {
  captureEvent: (event: string, properties?: Record<string, any>) => Promise<{ success: boolean; message: string }>;
  isAnalyticsEnabled: boolean;
}

// Create the context with default values
const AnalyticsContext = createContext<AnalyticsContextType>({
  captureEvent: async () => ({ success: false, message: 'Analytics not available' }),
  isAnalyticsEnabled: true
});

// Props for the provider component
interface AnalyticsProviderProps {
  children: ReactNode;
}

// Analytics Provider component
export const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({ children }) => {
  const [isAnalyticsEnabled, setIsAnalyticsEnabled] = useState<boolean>(true);
  
  // Load analytics setting on mount
  useEffect(() => {
    const loadAnalyticsSettings = async () => {
      try {
        const settings = await getSettings();
        setIsAnalyticsEnabled(settings.general?.usageAnalytics ?? true);
      } catch (error) {
        console.error('Error loading analytics settings:', error);
        setIsAnalyticsEnabled(true);
      }
    };
    
    loadAnalyticsSettings();
  }, []);
  
  // Wrapper function that checks if analytics is enabled before sending
  const captureEvent = async (
    event: string, 
    properties?: Record<string, any>
  ): Promise<{ success: boolean; message: string }> => {
    try {
      if (!isAnalyticsEnabled) {
        return { success: false, message: 'Analytics disabled in settings' };
      }
      
      // Send the event if analytics is enabled
      return await sendEvent(event, properties);
    } catch (error) {
      console.error('Error sending analytics event:', error);
      return { 
        success: false, 
        message: `Error sending event: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  };
  
  // Provide the context value
  const contextValue: AnalyticsContextType = {
    captureEvent,
    isAnalyticsEnabled
  };
  
  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
};

// Custom hook to use the Analytics context
export const useAnalytics = () => useContext(AnalyticsContext);

export default AnalyticsContext;