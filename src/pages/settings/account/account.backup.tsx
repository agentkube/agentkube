// import React, { useState } from 'react';
// import { User, CreditCard, Settings, LogOut, ChevronRight, Loader2, Settings2, Lock, CreditCardIcon, Key } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Card, CardContent } from '@/components/ui/card';
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
// import { useToast } from '@/hooks/use-toast';
// import { LicenseKeyDialog } from '@/components/custom';
// import { openExternalUrl } from '@/api/external';
// import { useAuth } from '@/contexts/useAuth';
// import ReactivateLicense from '@/components/custom/licensekey/reactivatelicensekey.component';

// const Account = () => {
//   const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
//   const [isLoggingOut, setIsLoggingOut] = useState(false);
//   const { toast } = useToast();
//   const { user, loading, logout } = useAuth();

//   const handleLogout = async () => {
//     try {
//       setIsLoggingOut(true);
//       await logout();
//     } catch (error) {
//       console.error('Logout failed:', error);
//     } finally {
//       setIsLoggingOut(false);
//       setIsLogoutDialogOpen(false);
//     }
//   };

//   const handleLicenseSuccess = () => {
//     // Refresh UI after successful license activation
//     toast({
//       title: "License Activated",
//       description: "Your license has been activated successfully. Refreshing your account details...",
//     });
//   };

//   if (loading) {
//     return (
//       <div className="flex justify-center items-center h-full p-8">
//         <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
//         <span className="ml-2 text-gray-500">Loading account information...</span>
//       </div>
//     );
//   }

//   // If not licensed, only show the license activation card
//   if (!user?.isLicensed) {
//     return (
//       <div className="p-6 mx-auto space-y-8">
//         <div>
//           <h1 className="text-3xl font-semibold dark:text-white mb-2">Account</h1>
//           <p className="text-gray-500 dark:text-gray-400">
//             Please activate your license to view account details
//           </p>
//         </div>

//         {/* License Activation Card */}
//         <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-700/30 shadow-sm">
//           <CardContent className="p-6">
//             <div className="flex items-start">
//               <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full mr-4">
//                 <Lock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
//               </div>
//               <div className="flex-1">
//                 <h2 className="text-xl font-medium dark:text-white mb-1">License Activation Required</h2>
//                 <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
//                   Please activate your license to access your account information and subscription details
//                 </p>

//                 <div className="flex flex-wrap gap-3 mt-6">
//                   <LicenseKeyDialog onSuccess={handleLicenseSuccess} />

//                   {user?.license_key && (
//                     <ReactivateLicense
//                       variant="outline"
//                       className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
//                       onSuccess={handleLicenseSuccess}
//                     />
//                   )}


//                   <Button
//                     variant="outline"
//                     onClick={() => openExternalUrl("https://agentkube.com/pricing")}
//                     className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30">
//                     <CreditCardIcon className="h-4 w-4 mr-2" />
//                     Buy Subscription
//                   </Button>
//                 </div>
//               </div>
//             </div>
//           </CardContent>
//         </Card>

//         {/* Logout Confirmation Dialog */}
//         <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
//           <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-gray-900/50 backdrop-blur-sm">
//             <DialogHeader>
//               <DialogTitle>Confirm Logout</DialogTitle>
//             </DialogHeader>
//             <div className="py-4">
//               <p className="text-gray-700 dark:text-gray-300">
//                 Are you sure you want to log out of your account?
//               </p>
//             </div>
//             <DialogFooter>
//               <Button
//                 variant="outline"
//                 onClick={() => setIsLogoutDialogOpen(false)}
//                 disabled={isLoggingOut}
//               >
//                 Cancel
//               </Button>
//               <Button
//                 variant="destructive"
//                 onClick={handleLogout}
//                 disabled={isLoggingOut}
//                 className="bg-red-600 hover:bg-red-700"
//               >
//                 {isLoggingOut ? (
//                   <>
//                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                     Logging out...
//                   </>
//                 ) : (
//                   <>
//                     <LogOut className="mr-2 h-4 w-4" />
//                     Logout
//                   </>
//                 )}
//               </Button>
//             </DialogFooter>
//           </DialogContent>
//         </Dialog>
//       </div>
//     );
//   }

//   // Show full account details once licensed
//   return (
//     <div className="p-6 mx-auto space-y-8">
//       <div>
//         <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Account</h1>
//         <p className="text-gray-500 dark:text-gray-400">
//           Manage your account settings and preferences
//         </p>
//       </div>

//       {/* Profile Information */}
//       <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-700/30 shadow-sm">
//         <CardContent className="p-6">
//           <div className="flex items-start">
//             <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full mr-4">
//               <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
//             </div>
//             <div className="flex-1">
//               <h2 className="text-xl font-medium dark:text-white mb-1">Profile Information</h2>
//               <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
//                 Manage your personal details
//               </p>

//               <div className="space-y-4">
//                 <div>
//                   <p className="text-gray-900 dark:text-gray-500">You are currently logged in as {user?.customer_email || user?.email || 'N/A'}</p>
//                   {user?.customer_name && (
//                     <p className="text-gray-600 dark:text-gray-400 mt-2">License registered to: {user.customer_name}</p>
//                   )}
//                 </div>
//               </div>

//               <div className="mt-6 flex space-x-4">
//                 {user?.subscription?.status !== 'active' && (
//                   <ReactivateLicense
//                     variant="default"
//                     className="bg-blue-600 hover:bg-blue-700 text-white"
//                     onSuccess={handleLicenseSuccess}
//                   />
//                 )}

//                 <Button
//                   variant="outline"
//                   className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
//                   onClick={() => {
//                     openExternalUrl("https://account.agentkube.com/settings");
//                     toast({
//                       title: "Edit Profile",
//                       description: "Opening settings page...",
//                     });
//                   }}
//                 >
//                   Manage
//                   <Settings2 className="ml-2 h-4 w-4" />
//                 </Button>
//                 {/* TODO to be implemented, replace existing license key */}

//                 {user?.license_key && (
//                   <ReactivateLicense
//                     variant="outline"
//                     className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
//                     onSuccess={handleLicenseSuccess}
//                   />
//                 )}
//               </div>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* Subscription Information */}
//       <Card className="bg-transparent dark:bg-transparent border-gray-200 dark:border-gray-700/30 shadow-sm">
//         <CardContent className="p-6">
//           <div className="flex items-start">
//             <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full mr-4">
//               <CreditCard className="h-6 w-6 text-green-600 dark:text-green-400" />
//             </div>
//             <div className="flex-1">
//               <h2 className="text-xl font-medium dark:text-white mb-1">Subscription</h2>
//               <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
//                 Manage your subscription plan and billing
//               </p>

//               <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/20 rounded-lg mb-6">
//                 <div className="flex justify-between items-center">
//                   <div>
//                     <span className="text-gray-900 dark:text-white font-medium">
//                       {user?.subscription?.product_name}
//                     </span>
//                     <div className="flex items-center mt-1">
//                       <span className={`text-xs px-2 py-1 rounded-[0.2rem] ${user?.subscription?.status === 'active'
//                         ? 'bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-400'
//                         : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
//                         }`}>
//                         {user?.subscription?.status === 'active' ? 'Active' : 'Inactive'}
//                       </span>
//                     </div>
//                   </div>

//                 </div>
//               </div>


//               <div className="flex flex-wrap gap-3">
//                 <Button
//                   variant="outline"
//                   className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
//                   onClick={() => {
//                     openExternalUrl("https://account.agentkube.com/settings");
//                     toast({
//                       title: "Manage Subscription",
//                       description: "Opening settings page...",
//                     });
//                   }}
//                 >
//                   Manage Subscription
//                   <ChevronRight className="ml-2 h-4 w-4" />
//                 </Button>

//                 <Button
//                   variant="outline"
//                   className="flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/30"
//                   onClick={() => {
//                     openExternalUrl("https://account.agentkube.com/settings");
//                     toast({
//                       title: "Billing History",
//                       description: "Opening settings page...",
//                     });
//                   }}
//                 >
//                   Billing History
//                   <ChevronRight className="ml-2 h-4 w-4" />
//                 </Button>
//               </div>
//             </div>
//           </div>
//         </CardContent>
//       </Card>

//       {/* Logout Confirmation Dialog */}
//       <Dialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
//         <DialogContent className="sm:max-w-md bg-gray-100 dark:bg-gray-900/50 backdrop-blur-sm">
//           <DialogHeader>
//             <DialogTitle>Confirm Logout</DialogTitle>
//           </DialogHeader>
//           <div className="py-4">
//             <p className="text-gray-700 dark:text-gray-300">
//               Are you sure you want to log out of your account?
//             </p>
//           </div>
//           <DialogFooter>
//             <Button
//               variant="outline"
//               onClick={() => setIsLogoutDialogOpen(false)}
//               disabled={isLoggingOut}
//             >
//               Cancel
//             </Button>
//             <Button
//               variant="destructive"
//               onClick={handleLogout}
//               disabled={isLoggingOut}
//               className="bg-red-600 hover:bg-red-700"
//             >
//               {isLoggingOut ? (
//                 <>
//                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                   Logging out...
//                 </>
//               ) : (
//                 <>
//                   <LogOut className="mr-2 h-4 w-4" />
//                   Logout
//                 </>
//               )}
//             </Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// };

// export default Account;