import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Key, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

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

  const triggerConfetti = () => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset states
    setError(null);
    
    // Validate license key format
    if (!licenseKey.trim()) {
      setError('Please enter a license key');
      return;
    }
    
    // Simple regex for XXX-XXX-XXX-XXX format
    const licenseKeyRegex = /^[A-Z0-9]{3,4}(-[A-Z0-9]{3,4}){2,4}$/;
    if (!licenseKeyRegex.test(licenseKey)) {
      setError('Please enter a valid license key format (e.g., XXXX-XXXX-XXXX-XXXX-XXXX)');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Simulate API call to validate and register license key
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In a real application, you would call your API
      // const response = await api.activateLicense(licenseKey);
      
      // Set success state
      setSuccess(true);
      
      // Trigger confetti animation
      triggerConfetti();
      
      toast({
        title: "License Key Activated",
        description: "Your license key has been successfully activated.",
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
      
    } catch (error) {
      console.error('License activation failed:', error);
      setError('Failed to activate license key. Please check your key and try again.');
      
      toast({
        title: "Activation Failed",
        description: "There was an error activating your license key. Please try again.",
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