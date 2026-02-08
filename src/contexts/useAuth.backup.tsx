// useAuth.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { validateLicense, getLicenseKeyLocal, storeLicenseKeyLocal, updateLicenseKeyLocal, removeLicenseKeyLocal } from '@/api/subscription';
import { ValidateLicenseResponse } from '@/types/subscription';

interface UserInfo {
  email: string;
  subscription: {
    product_name: string;
    status: string;
    created_at: string;
  };
  isLicensed: boolean;
  customer_name?: string;
  customer_email?: string;
  license_key?: string;
  instance_id?: string;
}

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  setUser: React.Dispatch<React.SetStateAction<UserInfo | null>>;
  updateUserLicenseInfo: (licenseInfo: {
    customer_name: string;
    customer_email: string;
    product_name: string;
    license_key: string;
    instance_id: string;
    created_at: string;
    status: string;
  }) => void;
  logout: () => Promise<void>;
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadUserFromAPI = async () => {
      try {
        setLoading(true);
        
        // Try to load user info from session storage first (for UI persistence)
        const sessionUser = getUserInfoFromSession();
        if (sessionUser) {
          setUser(sessionUser);
        }
        
        // Try to get the license key from the backend
        const licenseResponse = await getLicenseKeyLocal();
        
        if (licenseResponse.success && licenseResponse.license_key) {
          const licenseKey = licenseResponse.license_key;
          
          // If we have user info with an instance ID, use it to validate
          let instanceId = sessionUser?.instance_id;
          
          try {
            // Validate the license with LemonSqueezy
            const response = await validateLicense(licenseKey, instanceId) as ValidateLicenseResponse;
            
            if (response.valid) {
              // Create or update user info based on license response
              const userInfo: UserInfo = {
                email: response.meta.customer_email,
                isLicensed: response.license_key.status === 'active',
                customer_name: response.meta.customer_name,
                customer_email: response.meta.customer_email,
                license_key: licenseKey,
                instance_id: response.instance?.id,
                subscription: {
                  product_name: response.license_key.status === 'active' ? response.meta.product_name : 'Free',
                  status: response.license_key.status,
                  created_at: response.license_key.created_at
                }
              };
              
              setUser(userInfo);
              storeUserInfoInSession(userInfo);
              
              // Show license status notification if needed
              if (response.license_key.status !== 'active') {
                toast({
                  title: "License Inactive",
                  description: "Your license is currently inactive. Please reactivate to access premium features.",
                  variant: "destructive",
                });
              }
            } else {
              // Invalid license, but we might still have status information
              if (response.license_key && sessionUser) {
                // Keep session user but update with the actual status from LemonSqueezy
                const updatedUser = {
                  ...sessionUser,
                  isLicensed: false,
                  subscription: {
                    ...sessionUser.subscription,
                    status: response.license_key.status,
                    product_name: 'Free'
                  }
                };
                setUser(updatedUser);
                storeUserInfoInSession(updatedUser);
              } else {
                setUser(null);
                storeUserInfoInSession(null);
              }
              
              // Remove invalid license from backend
              await removeLicenseKeyLocal();
            }
          } catch (error) {
            console.error('Error validating license:', error);
            
            // On validation error, keep user with existing status
            if (sessionUser) {
              const updatedUser = {
                ...sessionUser,
                isLicensed: false,
                subscription: {
                  ...sessionUser.subscription,
                  product_name: 'Free'
                  // Keep the existing status from the session
                }
              };
              setUser(updatedUser);
              storeUserInfoInSession(updatedUser);
            }
          }
        } else if (sessionUser) {
          // No license in backend but we have session user, keep with existing status
          const updatedUser = {
            ...sessionUser,
            isLicensed: false,
            subscription: {
              ...sessionUser.subscription,
              product_name: 'Free'
              // Keep the existing status from the session
            }
          };
          setUser(updatedUser);
          storeUserInfoInSession(updatedUser);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading license from API:', error);
        
        // Fall back to session storage on API error
        const sessionUser = getUserInfoFromSession();
        if (sessionUser) {
          const updatedUser = {
            ...sessionUser,
            isLicensed: false,
            subscription: {
              ...sessionUser.subscription,
              product_name: 'Free'
              // Keep the existing status from the session
            }
          };
          setUser(updatedUser);
        }
        
        toast({
          title: "Error loading license",
          description: "Could not connect to the license server. Using offline mode.",
          variant: "destructive",
        });
        setLoading(false);
      }
    };

    loadUserFromAPI();
  }, [toast]);

  const updateUserLicenseInfo = async (licenseInfo: {
    customer_name: string;
    customer_email: string;
    product_name: string;
    license_key: string;
    instance_id: string;
    created_at: string;
    status: string;
  }) => {
    const updatedUser = {
      email: licenseInfo.customer_email,
      isLicensed: licenseInfo.status === 'active',
      customer_name: licenseInfo.customer_name,
      customer_email: licenseInfo.customer_email,
      license_key: licenseInfo.license_key,
      instance_id: licenseInfo.instance_id,
      subscription: {
        product_name: licenseInfo.status === 'active' ? licenseInfo.product_name : 'Free',
        status: licenseInfo.status,
        created_at: licenseInfo.created_at
      }
    };
    
    setUser(updatedUser);
    storeUserInfoInSession(updatedUser);
    
    try {
      // Store the license key in the backend
      const licenseExists = await has_license_key();
      if (licenseExists) {
        await updateLicenseKeyLocal(licenseInfo.license_key);
      } else {
        await storeLicenseKeyLocal(licenseInfo.license_key);
      }
    } catch (error) {
      console.error('Failed to save license to backend:', error);
      toast({
        title: "Warning",
        description: "Your license was activated but couldn't be saved to the server. Some features may be limited.",
        variant: "destructive",
      });
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setLoading(true);
    
      // Remove license from backend
      await removeLicenseKeyLocal();
      
      // Clear session storage
      sessionStorage.removeItem('userInfo');
      
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

  return (
    <AuthContext.Provider value={{ user, loading, setUser, updateUserLicenseInfo, logout }}>
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

// Helper function to check if license key exists
const has_license_key = async (): Promise<boolean> => {
  try {
    const response = await getLicenseKeyLocal();
    return response.success && !!response.license_key;
  } catch (error) {
    return false;
  }
};