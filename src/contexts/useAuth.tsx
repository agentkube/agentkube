// useAuth.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { validateLicense } from '@/api/subscription';
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadUserFromStorage = async () => {
      try {
        setLoading(true);
        
        const savedLicense = localStorage.getItem('userLicense');
        
        if (savedLicense) {
          const parsedData = JSON.parse(savedLicense);
          
          if (parsedData.license_key && parsedData.instance_id) {
            try {
              const response = await validateLicense(parsedData.license_key, parsedData.instance_id) as ValidateLicenseResponse;
              
              if (response.valid && response.license_key.status === 'active') {
                // License is valid and active, keep existing user info
                setUser(parsedData.userInfo);
              } else {
                // License is valid but inactive, or invalid
                // Update user info to reflect inactive status but keep user data
                const userInfo = parsedData.userInfo;
                
                // Set subscription status to match the license status
                if (response.valid) {
                  // License exists but may be inactive
                  userInfo.subscription.status = response.license_key.status;
                  userInfo.isLicensed = false;
                  
                  // Keep user data but update to free tier if inactive
                  if (response.license_key.status !== 'active') {
                    userInfo.subscription.product_name = 'Free';
                    
                    // Show toast for inactive license
                    toast({
                      title: "License Inactive",
                      description: "Your license is currently inactive. Please reactivate to access premium features.",
                      variant: "destructive",
                    });
                  }
                  
                  setUser(userInfo);
                  
                  // Update local storage with new status
                  localStorage.setItem('userLicense', JSON.stringify({
                    license_key: parsedData.license_key,
                    instance_id: parsedData.instance_id,
                    userInfo: userInfo
                  }));
                } else {
                  // License is invalid, remove it
                  localStorage.removeItem('userLicense');
                  // Set user to null or create a free user
                  setUser(null);
                }
              }
            } catch (error) {
              console.error('Error validating saved license:', error);
              
              // On error, keep user but mark as free/inactive
              const userInfo = parsedData.userInfo;
              userInfo.isLicensed = false;
              userInfo.subscription.status = 'inactive';
              userInfo.subscription.product_name = 'Free';
              
              setUser(userInfo);
              
              // Update storage with inactive status
              localStorage.setItem('userLicense', JSON.stringify({
                license_key: parsedData.license_key,
                instance_id: parsedData.instance_id,
                userInfo: userInfo
              }));
            }
          } else {
            localStorage.removeItem('userLicense');
          }
        }
        
        setLoading(false);
      } catch (error) {
        toast({
          title: "Error loading license",
          description: "Could not load your license information. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
      }
    };

    loadUserFromStorage();
  }, [toast]);

  const updateUserLicenseInfo = (licenseInfo: {
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
    
    try {
      localStorage.setItem('userLicense', JSON.stringify({
        license_key: licenseInfo.license_key,
        instance_id: licenseInfo.instance_id,
        userInfo: updatedUser
      }));
    } catch (error) {
      console.error('Failed to save license to local storage:', error);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      setLoading(true);
    
      localStorage.removeItem('userLicense');
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