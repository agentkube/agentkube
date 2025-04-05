import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Key, CheckCircle2 } from 'lucide-react';
import { triggerConfetti } from '@/utils/confetti.utils';
import { validateLicense, activateLicense } from '@/api/subscription';
import { useAuth } from '@/contexts/useAuth';
import { generateInstanceName } from '@/utils/osinfo.utils';

interface LicenseKeyDialogProps {
  onSuccess?: () => void;
}

const LicenseKeyDialog: React.FC<LicenseKeyDialogProps> = ({ onSuccess }) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  const { updateUserLicenseInfo } = useAuth();


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!licenseKey.trim()) {
      setError('Please enter a license key');
      return;
    }
    
    const formattedKey = licenseKey.replace(/\s/g, '');
    if (!/^[A-Z0-9]{8}(-[A-Z0-9]{4}){3}-[A-Z0-9]{12}$/i.test(formattedKey)) {
      setError('Please enter a valid license key format');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // First validate the license
      const validationResult = await validateLicense(formattedKey);
      
      if (!validationResult.valid) {
        setError(validationResult.error || 'Invalid license key');
        toast({
          title: "Validation Failed",
          description: validationResult.error || "Invalid license key. Please check and try again.",
          variant: "destructive",
        });
        return;
      }
      
      // Check activation limit before trying to activate
      if (validationResult.license_key.activation_usage >= validationResult.license_key.activation_limit) {
        setError(`License key has reached its activation limit (${validationResult.license_key.activation_limit}). Please purchase a new license.`);
        toast({
          title: "Activation Limit Reached",
          description: `This license key has reached its activation limit of ${validationResult.license_key.activation_limit}.`,
          variant: "destructive",
        });
        return;
      }
      
 
      try {
        const instanceName = generateInstanceName();
        const activationResult = await activateLicense(formattedKey, instanceName);
        
        if (!activationResult.activated) {
          setError(activationResult.error || 'Failed to activate license');
          toast({
            title: "Activation Failed",
            description: activationResult.error || "Failed to activate license. Please try again.",
            variant: "destructive",
          });
          return;
        }
        

        updateUserLicenseInfo({
          customer_name: activationResult.meta.customer_name,
          customer_email: activationResult.meta.customer_email,
          product_name: activationResult.meta.product_name,
          license_key: formattedKey,
          instance_id: activationResult.instance.id,
          created_at: activationResult.license_key.created_at,
          status: activationResult.license_key.status
        });
        
        // Set success state
        setSuccess(true);
        
        // Trigger confetti animation
        triggerConfetti();
        
        toast({
          title: "License Key Activated",
          description: `Your ${activationResult.meta.product_name} license has been successfully activated.`,
        });
        
        // Reset form after successful submission
        setTimeout(() => {
          setIsOpen(false);
          if (onSuccess) onSuccess();
          
          // Reset for next time dialog is opened
          setTimeout(() => {
            setLicenseKey('');
            setSuccess(false);
          }, 300);
        }, 1500);
      } catch (activationError) {
        // Handle specific activation errors
        if (activationError instanceof Error && activationError.message.includes('activation limit')) {
          setError(`License key has reached its activation limit. Please purchase a new license.`);
          toast({
            title: "Activation Limit Reached",
            description: "This license key has reached its activation limit.",
            variant: "destructive",
          });
        } else {
          setError('Failed to activate license. Please try again.');
          toast({
            title: "Activation Failed",
            description: "There was an error activating your license key. Please try again.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('License validation failed:', error);
      setError('Failed to validate license. Please check your network connection and try again.');
      toast({
        title: "Error",
        description: "There was an unexpected error processing your license. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleOpenChange = (open: boolean) => {
    if (!isSubmitting) {
      setIsOpen(open);
      if (!open) {
        // Reset form when dialog is closed
        setTimeout(() => {
          setLicenseKey('');
          setError(null);
          setSuccess(false);
        }, 300);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
        >
          <Key className="mr-2 h-4 w-4" />
          Add License Key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-[#0B0D13] backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-[Anton] uppercase font-bold">{success ? "License Activated" : "Enter License Key"}</DialogTitle>
        </DialogHeader>
        
        {success ? (
          <div className="py-6 flex flex-col items-center justify-center text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">License Key Activated</h3>
            <p className="text-gray-700 dark:text-gray-300">
              Thank you! Your license key has been successfully activated.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="license-key">License Key</Label>
                <Input
                  id="license-key"
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                  className="bg-white dark:bg-gray-800"
                  disabled={isSubmitting}
                  autoComplete="off"
                  spellCheck="false"
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
              </div>
              
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter the license key you received after purchasing AgentKube. 
                This will activate your license and unlock all premium features.
              </p>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="mt-4 sm:mt-0"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !licenseKey.trim()}
                className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Activating...
                  </>
                ) : (
                  <>Activate License</>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LicenseKeyDialog;