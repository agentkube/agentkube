// import React, { useEffect, useState } from 'react';
// import { Lock, Loader2 } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
// import { Input } from '@/components/ui/input';
// import { Label } from '@/components/ui/label';
// import { useToast } from '@/hooks/use-toast';
// import { useAuth } from '@/contexts/useAuth';
// import { validateLicense, activateLicense } from '@/api/subscription';
// import { ValidateLicenseResponse, ActivateLicenseResponse } from '@/types/subscription';
// import { generateInstanceName } from '@/utils/osinfo.utils';

// interface ReactivateLicenseProps {
//   variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
//   className?: string;
//   onSuccess?: () => void;
// }

// const ReactivateLicense: React.FC<ReactivateLicenseProps> = ({ 
//   variant = "default", 
//   className = "", 
//   onSuccess 
// }) => {
//   const [isOpen, setIsOpen] = useState<boolean>(false);
//   const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
//   const [licenseKey, setLicenseKey] = useState<string>('');
//   const [error, setError] = useState<string | null>(null);
//   const { toast } = useToast();
//   const { updateUserLicenseInfo, user } = useAuth();

//   useEffect(() => {
//     if (user?.license_key) {
//       setLicenseKey(user.license_key);
//     }
//   }, [user]);


//   const handleReactivate = async (e: React.FormEvent): Promise<void> => {
//     e.preventDefault();
//     setError(null);
    
//     if (!licenseKey.trim()) {
//       setError('Please enter your license key');
//       return;
//     }
    
//     const formattedKey = licenseKey.replace(/\s/g, '');
//     if (!/^[A-Z0-9]{8}(-[A-Z0-9]{4}){3}-[A-Z0-9]{12}$/i.test(formattedKey)) {
//       setError('Please enter a valid license key format');
//       return;
//     }
    
//     setIsSubmitting(true);
    
//     try {

//       const validationResult = await validateLicense(formattedKey) as ValidateLicenseResponse;
      
//       if (!validationResult.valid) {
//         setError(validationResult.error || 'Invalid license key');
//         toast({
//           title: "Validation Failed",
//           description: validationResult.error || "Invalid license key. Please check and try again.",
//           variant: "destructive",
//         });
//         return;
//       }
      
//       try {
//         const instanceName = generateInstanceName();
//         const activationResult = await activateLicense(formattedKey, instanceName) as ActivateLicenseResponse;
      

//         if (!activationResult.activated) {
//           setError(activationResult.error || 'Failed to reactivate license');
//           toast({
//             title: "Reactivation Failed",
//             description: activationResult.error || "Failed to reactivate license. Please try again.",
//             variant: "destructive",
//           });
//           return;
//         }
        
//         updateUserLicenseInfo({
//           customer_name: activationResult.meta.customer_name,
//           customer_email: activationResult.meta.customer_email,
//           product_name: activationResult.meta.product_name,
//           license_key: formattedKey,
//           instance_id: activationResult.instance.id,
//           created_at: activationResult.license_key.created_at,
//           status: activationResult.license_key.status
//         });
        
//         toast({
//           title: "License Successfully Reactivated",
//           description: `Your ${activationResult.meta.product_name} license has been reactivated.`,
//         });
        
//         setIsOpen(false);
//         if (onSuccess) onSuccess();
//       } catch (activationError) {
//         console.error('Reactivation error:', activationError);
//         if (activationError instanceof Error && activationError.message.includes('activation limit')) {
//           setError(`License key has reached its activation limit. Please contact support.`);
//           toast({
//             title: "Activation Limit Reached",
//             description: "This license key has reached its activation limit. Please contact customer support for assistance.",
//             variant: "destructive",
//           });
//         } else {
//           setError('Failed to reactivate license. Please try again.');
//           toast({
//             title: "Reactivation Failed",
//             description: "There was an error reactivating your license key. Please try again or contact support.",
//             variant: "destructive",
//           });
//         }
//       }
//     } catch (error) {
//       console.error('License validation failed:', error);
//       setError('Failed to validate license. Please check your network connection and try again.');
//       toast({
//         title: "Error",
//         description: "There was an unexpected error processing your license. Please try again later.",
//         variant: "destructive",
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <>
//       <Button
//         variant={variant}
//         className={`flex items-center ${className}`}
//         onClick={() => setIsOpen(true)}
//       >
//         <Lock className="mr-2 h-4 w-4" />
//         Reactivate License
//       </Button>
      
//       <Dialog open={isOpen} onOpenChange={(open: boolean) => !isSubmitting && setIsOpen(open)}>
//         <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-card backdrop-blur-md">
//           <DialogHeader>
//             <DialogTitle className="text-2xl font-bold">Reactivate Your License</DialogTitle>
//           </DialogHeader>
          
//           <form onSubmit={handleReactivate}>
//             <div className="py-4 space-y-4">
//               <div className="space-y-2">
//                 <Label htmlFor="license-key">License Key</Label>
//                 <Input
//                   id="license-key"
//                   placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
//                   value={licenseKey}
//                   onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLicenseKey(e.target.value.toUpperCase())}
//                   className="bg-white dark:bg-gray-800"
//                   disabled={isSubmitting}
//                   autoComplete="off"
//                   spellCheck={false}
//                 />
//                 {error && <p className="text-sm text-red-500">{error}</p>}
//               </div>
              
//               <p className="text-sm text-gray-500 dark:text-gray-400">
//                 Enter your license key to reactivate your subscription.
//                 If you're having trouble with reactivation, please contact our support team.
//               </p>
//             </div>
            
//             <DialogFooter>
//               <Button
//                 type="button"
//                 variant="outline"
//                 onClick={() => setIsOpen(false)}
//                 disabled={isSubmitting}
//                 className="mt-4 sm:mt-0"
//               >
//                 Cancel
//               </Button>
//               <Button
//                 type="submit"
//                 disabled={isSubmitting || !licenseKey.trim()}
//                 className="mt-4 sm:mt-0 bg-blue-600 hover:bg-blue-700"
//               >
//                 {isSubmitting ? (
//                   <>
//                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                     Reactivating...
//                   </>
//                 ) : (
//                   <>Reactivate License</>
//                 )}
//               </Button>
//             </DialogFooter>
//           </form>
//         </DialogContent>
//       </Dialog>
//     </>
//   );
// };

// export default ReactivateLicense;